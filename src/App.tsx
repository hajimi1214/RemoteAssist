import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { inputFromPointer, InputEventGate, keyInput, wheelInput } from "./inputEvents";
import { AssistRequest, AuthResult, Device, SignalingClient, SignalingHttpError, User } from "./signaling";
import { ControllerPeer, HostPeer, SignalMessage } from "./webrtc";

import { Dashboard, MyDevices, SessionsPage, SettingsPage } from "./pages";
import { BrandMark, ButtonSpinner, ConfirmDialog, Icon, RemoteScreen, StatusMessage, ConnectionDiagnostics, QualityPreference } from "./ui";
import type { IconName } from "./ui";
import type { VideoPreference } from "./connectionQuality";
import type { VideoTelemetry } from "./videoTelemetry";
import { usePreferences } from "./preferences";
import { useSessionJournal } from "./useSessionJournal";
import { createSessionRecorder } from "./sessionJournal";
import type { SessionSummary } from "./sessionJournal";
import { ConnectionCode } from "./forms";
import { AuthDialog } from "./AuthDialog";
import { FeedbackDialog, GuestFeature, GuestWorkspace, nativeWindow, WindowBar } from "./workspaceChrome";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { pages, friendlyError, connectionLabel, remainingTime, transportFailure } from "./ux";
import type { View, AssistMode } from "./ux";
type AuthMode = "signin" | "register";

const signaling = new SignalingClient();
const appVersion = "0.8.0-alpha";
const navigationIcons: Record<View, IconName> = { Dashboard:"grid", "My Devices":"devices", "Remote Assist":"monitor", Sessions:"history", Settings:"settings" };

export function App() {
  const [auth, setAuth, authLoaded] = useStoredAuth();
  const [loginTarget, setLoginTarget] = useState<{ view: View; mode?: AssistMode } | null>(null);
  const [loginError, setLoginError] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [user, setUser] = useState<User | null>(auth?.user ?? null);
  const [device, setDevice] = useState<Device | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [view, setView] = useState<View>("Dashboard");
  const [serviceStatus, setServiceStatus] = useState("Disconnected");
  const [assistRequests, setAssistRequests] = useState<AssistRequest[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [assistMode, setAssistMode] = useState<AssistMode>("share");
  const [sessionActive, setSessionActive] = useState(false);
  const activeRef = useRef(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [retry, setRetry] = useState(0);
  const [requestBusy, setRequestBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const preferences = usePreferences();
  const journal=useSessionJournal(auth?.user.id);
  const viewRef=useRef(view); viewRef.current=view;
  const modeRef=useRef(assistMode); modeRef.current=assistMode;
  const authRef = useRef(auth);
  authRef.current = auth;

  function clearAccountData() { authRef.current = null; setUser(null); setDevice(null); setDevices([]); setAssistRequests([]); setServiceStatus("Disconnected"); setView("Dashboard"); }
  function updateActivity(active: boolean) { activeRef.current=active; setSessionActive(active); }
  function guard(action: () => void) { if (activeRef.current) setPendingNavigation(() => action); else action(); }
  function requestLogin(next: View = view, mode?: AssistMode) { if (!authLoaded) { setNotice("正在恢复登录，请稍候再试。"); return; } setLoginError(""); setAuthMode("signin"); setLoginTarget({ view: next, mode }); }
  function useAssist(mode: AssistMode) { if (!authRef.current) requestLogin("Remote Assist", mode); else navigate("Remote Assist", mode); }
  function navigate(next: View, mode?: AssistMode) {
    if (next === viewRef.current && (!mode || mode === modeRef.current)) return;
    guard(() => { setView(next); if (mode) setAssistMode(mode); });
  }
  useEffect(() => { headingRef.current?.focus({ preventScroll:true }); }, [view]);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    const expected = auth;
    let timer: number;
    const refresh = async () => {
      try {
        const next = await signaling.refresh(expected.refreshToken);
        if (!cancelled && authRef.current === expected) await setAuth(next);
      } catch (err) {
        if (cancelled || authRef.current !== expected) return;
        if (err instanceof SignalingHttpError && err.status === 401) {
          clearAccountData(); setNotice("登录已过期，请重新登录后继续使用。");
          await setAuth(null);
        } else {
          setServiceStatus("Disconnected");
          timer = window.setTimeout(() => { void refresh(); }, 15_000);
        }
      }
    };
    const expires = Date.parse(auth.expiresAt);
    timer = window.setTimeout(() => { void refresh(); }, Number.isFinite(expires) ? Math.max(0, expires - Date.now() - 60_000) : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [auth]);

  useEffect(() => {
    if (!authLoaded || !auth) return;
    let cancelled = false;
    setUser(auth.user);
    setServiceStatus("Connecting");
    async function bootstrap() {
      try {
        let activeAuth = auth!;
        let me: User;
        try {
          me = await signaling.me(activeAuth.accessToken);
        } catch (err) {
          if (cancelled) return;
          if (!(err instanceof SignalingHttpError) || err.status !== 401) throw err;
          try {
            activeAuth = await signaling.refresh(activeAuth.refreshToken);
            if (!cancelled && authRef.current === auth) await setAuth(activeAuth);
            return;
          } catch (refreshError) {
            if (refreshError instanceof SignalingHttpError && refreshError.status === 401) {
              if (cancelled || authRef.current !== auth) return;
              clearAccountData(); setNotice("登录已过期，请重新登录后继续使用。");
              await setAuth(null);
              return;
            }
            throw refreshError;
          }
        }
        if (cancelled) return;
        setUser(me);
        const registered = await signaling.registerDevice(activeAuth.accessToken, localDeviceInfo());
        if (cancelled || authRef.current !== auth) return;
        localStorage.setItem("remoteassist.deviceId", registered.id);
        setDevice(registered);
        setServiceStatus("Connected");
        const listed = await signaling.devices(activeAuth.accessToken, registered.id);
        if (!cancelled && authRef.current === auth) setDevices(listed);
      } catch {
        if (!cancelled) setServiceStatus("Disconnected");
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [auth, authLoaded, retry]);

  useEffect(() => {
    if (!auth || !device) return;
    let cancelled = false;
    let timer: number;
    const poll = async () => {
      const results = await Promise.allSettled([signaling.heartbeat(auth.accessToken,device.id),signaling.assistRequests(auth.accessToken,device.id),signaling.devices(auth.accessToken,device.id)]);
      if (cancelled || authRef.current !== auth) return;
      if (results[0].status === "fulfilled") { setDevice(results[0].value); setServiceStatus("Connected"); } else setServiceStatus("Disconnected");
      if (results[1].status === "fulfilled") setAssistRequests(results[1].value ?? []);
      if (results[2].status === "fulfilled") setDevices(results[2].value ?? []);
      timer = window.setTimeout(() => { void poll(); },30_000);
    };
    void poll();
    return () => { cancelled=true; window.clearTimeout(timer); };
  }, [auth, device?.id]);

  async function handleAuth(result: AuthResult, remember: boolean) {
    const destination = loginTarget;
    setDevice(null); setDevices([]); setAssistRequests([]); setServiceStatus("Connecting");
    setLoginTarget(null); setLoginError(""); setUser(result.user); setError("");
    setNotice("登录成功，可以开始使用。共享和控制仍需单独确认。");
    if (destination) { setView(destination.view); if (destination.mode) setAssistMode(destination.mode); }
    await setAuth(result, remember);
  }

  async function signOut() {
    const current = auth;
    authRef.current=null;
    await setAuth(null);
    setUser(null);
    setDevice(null);
    setDevices([]);
    setView("Dashboard");
    setAssistRequests([]); setNotice("已退出登录，可以继续浏览。"); setError(""); setServiceStatus("Disconnected");
    if (current) await signaling.logout(current.refreshToken).catch(() => undefined);
  }

  async function resolveRequest(status: "ACCEPTED" | "REJECTED") {
    if (!auth || requestBusy || !assistRequests[0]) return;
    setRequestBusy(true); setError("");
    const request = assistRequests[0];
    try {
      await signaling.resolveAssistRequest(auth.accessToken,request.id,status);
      if (authRef.current?.user.id !== auth.user.id) return;
      setAssistRequests((items)=>items.filter((item)=>item.id!==request.id));
      setNotice(status === "ACCEPTED" ? "已接受协助请求。请选择主显示器，并将连接码发给对方。" : "已拒绝协助请求。");
      if (status === "ACCEPTED") navigate("Remote Assist","share");
    } catch(err) { if(authRef.current?.user.id===auth.user.id)setError(friendlyError(err)); } finally { setRequestBusy(false); }
  }

  const signedIn = !!auth && !!user;
  const publicView = signedIn ? user : null;
  const closeWindow = () => guard(() => { void getCurrentWindow().close().catch(() => setError("关闭窗口失败，请重试。")); });

  return (
    <div className={`app-frame${nativeWindow ? " native-frame" : ""}`}><WindowBar onClose={closeWindow} onError={setError}/>
    <main className="desktop-shell">
      <a className="skip-link" href="#workspace">跳到主要内容</a>
      <header className="app-nav">
        <button className="brand-lockup" onClick={() => navigate("Dashboard")} aria-label="RemoteAssist 工作台">
          <BrandMark />
          <span className="brand-wordmark"><b>Remote</b><strong>Assist</strong></span>
        </button>
        <nav className="nav-menu" aria-label="主要导航">
          {(["Dashboard", "My Devices", "Remote Assist", "Sessions", "Settings"] as View[]).map((item) => (
            <button key={item} aria-current={view===item?"page":undefined} className={view === item ? "nav-active" : ""} onClick={() => navigate(item)}><Icon name={navigationIcons[item]}/><span>{pages[item].title}</span></button>
          ))}
        </nav>
        <div className="nav-actions">
          {signedIn ? <><span className={`service-pill ${serviceStatus === "Connected" ? "is-online" : ""}`} role="status"><i />{serviceStatus==="Connected"?"服务在线":serviceStatus==="Connecting"?"正在连接":"服务离线"}</span><span className="user-chip" title={user!.username} aria-label={`当前账号 ${user!.username}`}>{user!.username.slice(0, 1).toUpperCase()}</span><button className="link-button" onClick={() => guard(()=>{void signOut();})}>退出登录</button></> : <><span className="guest-badge"><Icon name="monitor"/>{authLoaded ? "自由浏览" : "恢复登录中…"}</span><button className="primary-action nav-login" disabled={!authLoaded} onClick={() => requestLogin()}>登录<Icon name="arrow"/></button></>}
        </div>
      </header>
      <section className="workspace" id="workspace">
        <div className="page-heading">
          <div><span className="eyebrow">REMOTE ASSISTANCE WORKSPACE</span><h1 ref={headingRef} tabIndex={-1}>{pages[view].title}</h1><p>{pages[view].description}</p></div>
          {signedIn && device && <span className="device-badge"><i />{device.deviceName}</span>}
        </div>
        {signedIn && serviceStatus === "Disconnected" && <div className="connection-banner" role="status"><span>暂时无法连接服务器。已建立的协助不会自动重连。</span><button className="secondary-action" onClick={()=>setRetry((v)=>v+1)}>重新连接服务</button></div>}
        {error && <StatusMessage error>{error}</StatusMessage>}
        {notice && <div className="notice-banner" role="status"><span>{notice}</span><button className="link-button" onClick={()=>setNotice("")}>关闭提示</button></div>}
        {signedIn && assistRequests.length > 0 && (
          <div className="assist-banner">
            <strong>{assistRequests[0].controllerDeviceName}</strong>
            <span>请求协助。接受后仍需你选择屏幕并批准控制。</span>
            <button className="primary-action" disabled={requestBusy} onClick={() => void resolveRequest("ACCEPTED")}>{requestBusy?"正在处理…":"接受请求"}</button>
            <button className="danger-quiet" disabled={requestBusy} onClick={() => void resolveRequest("REJECTED")}>拒绝</button>
          </div>
        )}
        {view === "Dashboard" && signedIn && (
          <Dashboard
            user={user!}
            device={device}
            devices={devices}
            recentSessions={journal.records}
            onHistory={()=>navigate("Sessions")}
            onShare={() => useAssist("share")}
            onControl={() => useAssist("control")}
          />
        )}
        {!signedIn && view === "Dashboard" && <GuestWorkspace onUse={useAssist}/>}
        {!signedIn && view !== "Dashboard" && view !== "Settings" && <GuestFeature view={view} onLogin={() => requestLogin()} onUse={useAssist}/>}
        {view === "My Devices" && signedIn && auth && device && (
          <MyDevices auth={auth} currentDevice={device} devices={devices} onDevices={setDevices} signaling={signaling} onRemoteAssist={(message) => { setNotice(message??""); navigate("Remote Assist","control"); }} />
        )}
        {view === "My Devices" && signedIn && !device && <div className="panel empty-state"><Icon name="devices" /><h2>正在登记这台设备</h2><p>服务连接成功后会显示设备列表。</p></div>}
        {view === "Remote Assist" && auth && signedIn && <RemoteAssist auth={auth} mode={assistMode} onMode={(mode)=>navigate("Remote Assist",mode)} onActivity={updateActivity} onRecord={summary=>journal.add(auth.user.id,summary)} />}
        {view === "Sessions" && signedIn && <SessionsPage records={journal.records} persist={journal.persist} storageError={journal.storageError} onPersistence={journal.setPersistence} onClear={journal.clear} onRetryStorage={journal.retryStorage} onStart={()=>navigate("Remote Assist","share")} />}
        {view === "Settings" && <SettingsPage onLogin={() => requestLogin()} user={publicView} device={device} version={appVersion} preferences={preferences} auth={auth} signaling={signaling} />}
      </section>
      <footer className="workspace-footer"><span>RemoteAssist {appVersion}</span><button className="feedback-trigger" onClick={() => setFeedbackOpen(true)}>使用反馈<Icon name="arrow"/></button><span>{sessionActive?"协助进行中 · 离开页面将结束连接":"清晰可见 · 每次授权 · 随时结束"}</span></footer>
      {loginTarget && <AuthDialog mode={authMode} error={loginError} onError={setLoginError} onMode={setAuthMode} onAuth={handleAuth} signaling={signaling} onClose={() => { setLoginTarget(null); setLoginError(""); }} purpose={loginTarget.view === "Remote Assist" ? "登录后进入远程协助，准备好再开始连接。" : "登录后管理设备和协助记录，也可以先关闭继续看看。"}/>}
      {feedbackOpen && <FeedbackDialog version={appVersion} page={pages[view].title} connection={signedIn ? serviceStatus : "未登录"} onClose={() => setFeedbackOpen(false)}/>}
      {pendingNavigation && <ConfirmDialog title="结束当前协助并离开？" description="离开此页面会停止屏幕共享、断开连接并释放远程输入。下次连接需要重新授权。" confirmLabel="结束并离开" onCancel={()=>setPendingNavigation(null)} onConfirm={()=>{const action=pendingNavigation;setPendingNavigation(null);action();}} />}
    </main></div>
  );
}

function RemoteAssist({ auth, mode: tab, onMode, onActivity, onRecord }: { auth: AuthResult; mode: AssistMode; onMode: (mode: AssistMode) => void; onActivity: (active: boolean) => void; onRecord:(summary:SessionSummary)=>void }) {
  return (
    <section className="remote-assist-page">
      <div className="segmented" role="tablist" aria-label="协助方式" onKeyDown={(ev)=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(ev.key)){ev.preventDefault();const target=ev.key==="Home"?"share":ev.key==="End"?"control":ev.target===(document.getElementById("share-tab"))?"control":"share";document.getElementById(`${target}-tab`)?.focus();}}}>
        <button id="share-tab" role="tab" aria-controls="share-panel" tabIndex={tab==="share"?0:-1} aria-selected={tab === "share"} className={tab === "share" ? "nav-active" : ""} onClick={() => onMode("share")}><Icon name="monitor" />共享这台电脑</button>
        <button id="control-tab" role="tab" aria-controls="control-panel" tabIndex={tab==="control"?0:-1} aria-selected={tab === "control"} className={tab === "control" ? "nav-active" : ""} onClick={() => onMode("control")}><Icon name="devices" />连接另一台电脑</button>
      </div>
      {tab === "share" ? <ShareComputer auth={auth} onActivity={onActivity} onRecord={onRecord} /> : <ControlComputer auth={auth} onActivity={onActivity} onRecord={onRecord} />}
    </section>
  );
}

function ShareComputer({ auth, onActivity, onRecord }: { auth: AuthResult; onActivity: (active: boolean) => void; onRecord:(summary:SessionSummary)=>void }) {
  const recorder=useRef<ReturnType<typeof createSessionRecorder>|null>(null);
  const latestAuth=useRef(auth);latestAuth.current=auth;
  const [status, setStatus] = useState("Idle");
  const [permission, setPermission] = useState("Not sharing");
  const [code, setCode] = useState("");
  const [pendingApproval, setPendingApproval] = useState(false);
  const [session, setSession] = useState<{ id: string; hostToken: string; controllerToken?: string } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hostPeerRef = useRef<HostPeer | null>(null);
  const sessionRef = useRef<{ id: string; hostToken: string } | null>(null);
  const sharingRef = useRef(false);
  const generationRef = useRef(0);
  const authorizingRef = useRef(false);
  const expiryTimer = useRef<number | undefined>(undefined);
  const readyTimer = useRef<number | undefined>(undefined);
  const [quality, setQuality] = useState("Balanced");
  const [preference,setPreference]=useState<VideoPreference>("auto");
  const [telemetry,setTelemetry]=useState<VideoTelemetry|null>(null);
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  useEffect(()=>{if(!expiresAt)return;const timer=window.setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[expiresAt]);

  async function copyCode() {
    try { await navigator.clipboard.writeText(code); setCopyStatus("连接码已复制"); }
    catch { setCopyStatus("无法访问剪贴板，请选中连接码手动复制。"); }
  }

  async function startSharing() {
    if (sharingRef.current) return;
    sharingRef.current = true;
    setBusy(true); setError(""); setCopyStatus(""); onActivity(true);
    const generation = ++generationRef.current;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor", frameRate: { ideal: 20, max: 30 } }, audio: false });
      if (!sharingRef.current || generationRef.current !== generation) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      stream.getTracks().forEach((track) => {
        track.onended = () => { if (generationRef.current === generation) void stopSharing("Capture stopped"); };
      });
      const capture = stream.getVideoTracks()[0];
      if (!capture || capture.readyState !== "live" || capture.getSettings().displaySurface !== "monitor") {
        throw new Error("Choose your primary full display. Window and tab control are not supported yet.");
      }
      const created = await signaling.createShareSession(latestAuth.current.accessToken);
      if (!sharingRef.current || generationRef.current !== generation) { await signaling.disconnect(created.id, created.hostToken).catch(() => undefined); return; }
      sessionRef.current = created;
      recorder.current=createSessionRecorder("share",onRecord);
      setSession({ id: created.id, hostToken: created.hostToken });
      setExpiresAt(Date.parse(created.expiresAt)); setClock(Date.now());
      setPermission("Sharing selected screen/window, waiting for controller");
      setStatus(`Code expires at ${new Date(created.expiresAt).toLocaleTimeString()}`);
      const ws = new WebSocket(signaling.wsURL(created.id, "host"));
      ws.onopen = () => ws.send(JSON.stringify({ type: "authenticate", token: created.hostToken }));
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        let msg: SignalMessage;
        try { msg = JSON.parse(ev.data) as SignalMessage; } catch { void stopSharing("Invalid signaling message"); return; }
        if (msg.sessionId !== created.id) return;
        if (msg.type === "ready") { window.clearTimeout(readyTimer.current); setCode(created.code); setBusy(false); return; }
        if (["disconnect", "rejected", "expired"].includes(msg.type)) { void stopSharing(msg.type==="expired"?"Session expired":msg.type==="rejected"?"Rejected":"Session ended"); return; }
        if (msg.type === "ping") {
          setPendingApproval(true);
          setStatus("Controller is waiting for authorization");
        } else {
          void hostPeerRef.current?.handleSignal(msg);
        }
      };
      ws.onclose = () => { void stopSharing("Disconnected"); };
      ws.onerror = () => { void stopSharing("Connection failed"); };
      readyTimer.current=window.setTimeout(()=>{setError("连接响应超时，请检查网络后重试。");void stopSharing("failed");},15_000);
      expiryTimer.current = window.setTimeout(() => { void stopSharing("Connection code expired"); }, Math.max(0, Date.parse(created.expiresAt) - Date.now()));
    } catch (err) {
      if (generationRef.current === generation) { setError(friendlyError(err)); await stopSharing("Idle"); }
    }
  }

  async function allowControl() {
    const current = sessionRef.current;
    if (!current || !sharingRef.current || !streamRef.current || !wsRef.current || authorizingRef.current) return;
    if (!streamRef.current.getVideoTracks().some((track) => track.readyState === "live")) { await stopSharing("Capture stopped"); return; }
    authorizingRef.current = true;
    setApproving(true); setError("");
    const generation = generationRef.current;
    try {
      const consent = await invoke<boolean>("request_input_authorization");
      if (!sharingRef.current || sessionRef.current !== current) { await invoke("clear_input_authorization"); return; }
      if (!consent) {
        setPermission("Remote input not authorized");
        return;
      }
      const approved = await signaling.approve(current.id, current.hostToken);
      if (!sharingRef.current || sessionRef.current !== current) return;
      await invoke("set_input_authorized", { sessionToken: approved.controllerToken, expiresAtMs: Date.parse(approved.expiresAt) });
      if (!sharingRef.current || sessionRef.current !== current) { await invoke("clear_input_authorization"); return; }
      if (expiryTimer.current != null) window.clearTimeout(expiryTimer.current);
      expiryTimer.current = window.setTimeout(() => { void stopSharing("Session expired"); }, Math.max(0, Date.parse(approved.expiresAt) - Date.now()));
      setSession({ ...current, controllerToken: approved.controllerToken });
      setExpiresAt(Date.parse(approved.expiresAt)); setClock(Date.now());
      setPendingApproval(false);
      setPermission("Remote input authorized");
      const gate = new InputEventGate(approved.controllerToken, () => sharingRef.current);
      const peer = new HostPeer(current.id, current.hostToken, wsRef.current!, [], {
        onConnectionStatus: (status) => { setStatus(status);if(status==="connected")recorder.current?.connected(); if (["failed","disconnected","signaling error"].includes(status)) void stopSharing("Connection lost"); },
        onQuality: setQuality,
        onTelemetry:sample=>{setTelemetry(sample);recorder.current?.route(sample.route);},
        onFailure:(reason)=>setError(transportFailure(reason))
      },{preference,loadIceServers:()=>signaling.iceServers(latestAuth.current.accessToken)});
      hostPeerRef.current = peer;
      await peer.start(streamRef.current!, gate);
    } catch (err) {
      if (generationRef.current === generation) { setError(friendlyError(err)); await stopSharing("failed"); }
    } finally { if (generationRef.current === generation) { authorizingRef.current = false; setApproving(false); } }
  }

  async function stopSharing(reason = "Disconnected") {
    recorder.current?.finish(reason);recorder.current=null;
    sharingRef.current = false;
    generationRef.current++;
    authorizingRef.current = false;
    const current = sessionRef.current;
    sessionRef.current = null;
    if (expiryTimer.current != null) window.clearTimeout(expiryTimer.current);
    expiryTimer.current = undefined;
    window.clearTimeout(readyTimer.current); readyTimer.current=undefined;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; ws.onerror = null; }
    hostPeerRef.current?.close();
    hostPeerRef.current = null;
    ws?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if(reason!=="Closed")setStatus(reason);
    setPermission("Not sharing");
    setCode("");
    setPendingApproval(false);
    setSession(null);
    setQuality("Balanced");
    setTelemetry(null);
    setBusy(false); setApproving(false); setExpiresAt(0); setCopyStatus(""); onActivity(false);
    await invoke("clear_input_authorization").catch(() => undefined);
    if (current) await signaling.disconnect(current.id, current.hostToken).catch(() => undefined);
  }

  useEffect(() => () => { void stopSharing("Closed"); }, []);

  return (
    <section className="panel share-panel" id="share-panel" role="tabpanel" aria-labelledby="share-tab">
      <div className="panel-heading"><div><span className="eyebrow">SHARE WITH CONFIDENCE</span><h2>把主屏共享给信任的人</h2><p>选择主显示器的整个屏幕。当前暂不支持窗口、标签页或副屏控制。</p></div><span className={`presence ${code ? "online" : "offline"}`} role="status"><i />{code ? "屏幕共享中" : busy ? "准备共享" : "尚未共享"}</span></div>
      {error && <StatusMessage error>{error}</StatusMessage>}
      <QualityPreference value={preference} onChange={(value)=>{setPreference(value);hostPeerRef.current?.setPreference(value);}} />
      <ol className="session-steps" aria-label="共享步骤"><li className={code?"complete":"current"}><span>1</span>选择屏幕</li><li className={pendingApproval||session?.controllerToken?"complete":code?"current":""}><span>2</span>发送连接码</li><li className={session?.controllerToken?"complete":pendingApproval?"current":""}><span>3</span>确认控制</li></ol>
      {!code && <div className="share-start"><span className="large-monitor"><Icon name="monitor" /></span><div><strong>从一次明确的共享开始</strong><p>系统会让你选择屏幕。确认后生成临时连接码，对方输入后仍需你授权。</p><button className="primary-action" disabled={busy} onClick={() => void startSharing()}><Icon name="monitor" />{busy?"正在准备共享…":"选择主显示器"}</button></div></div>}
      {code && <div className="share-active"><span className="eyebrow">临时连接码</span><div className="code-row"><output className="code-box" aria-label={`连接码 ${code.split("").join(" ")}`}>{code.slice(0,4)} {code.slice(4)}</output><button className="secondary-action" onClick={()=>void copyCode()}><Icon name="copy" />复制连接码</button></div><p>仅发送给你信任的人。<span className="countdown" aria-label={`剩余有效时间 ${remainingTime(expiresAt,clock)}`}>{session?.controllerToken?"会话剩余":"连接码剩余"} <b>{remainingTime(expiresAt,clock)}</b></span></p>{copyStatus&&<p role="status">{copyStatus}</p>}</div>}
      {pendingApproval && (
        <div className="approval">
          <div><span className="eyebrow">需要你的确认</span><strong>对方正在请求控制</strong><p>请确认对方身份。允许后，对方可以操作你的鼠标与键盘。</p></div>
          <div className="row">
            <button className="primary-action" disabled={approving} onClick={() => void allowControl()}><Icon name="shield" />{approving?"等待本机确认…":"确认并允许控制"}</button>
            <button className="danger-quiet" onClick={() => void stopSharing("Rejected")}>拒绝并结束</button>
          </div>
        </div>
      )}
      <dl className="status-grid"><dt>连接状态</dt><dd role="status">{connectionLabel(status)}</dd><dt>输入权限</dt><dd>{permission==="Remote input authorized"?"已允许远程控制":"尚未允许控制"}</dd>{session?.controllerToken && <><dt>自适应画质</dt><dd>{{Balanced:"平衡",Constrained:"优先保清晰",Sharp:"清晰",Economy:"节省带宽","Browser managed":"自动"}[quality]??quality}</dd></>}</dl>
      <ConnectionDiagnostics sample={telemetry} />
      {(code||busy) && <div className="session-end-row"><span>停止后，画面与远程输入都会立即断开。</span><button className="danger-action" onClick={() => void stopSharing("Stopped by host")}><Icon name="stop" />停止共享</button></div>}
    </section>
  );
}

function ControlComputer({ auth, onActivity, onRecord }: { auth: AuthResult; onActivity: (active: boolean) => void; onRecord:(summary:SessionSummary)=>void }) {
  const recorder=useRef<ReturnType<typeof createSessionRecorder>|null>(null);
  const latestAuth=useRef(auth);latestAuth.current=auth;
  const [code, setCode] = useState("");
  const [codeError,setCodeError]=useState("");
  const [status, setStatus] = useState("Idle");
  const [relay, setRelay] = useState<"P2P" | "TURN Relay" | "Unknown">("Unknown");
  const [latency, setLatency] = useState<number | null>(null);
  const [telemetry,setTelemetry]=useState<VideoTelemetry|null>(null);
  const [session, setSession] = useState<{ id: string; controllerToken: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<ControllerPeer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<{ id: string; controllerToken: string } | null>(null);
  const connectingRef = useRef(false);
  const readyTimer = useRef<number | undefined>(undefined);
  const generationRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    if (connectingRef.current) return;
    if (!/^\d{8}$/.test(code)) { setCodeError("请填写完整的 8 位数字连接码。");document.getElementById("session-code")?.focus();return; }
    setCodeError("");
    connectingRef.current = true;
    setBusy(true); setError(""); onActivity(true);
    const generation = ++generationRef.current;
    recorder.current=createSessionRecorder("control",onRecord);
    try {
      const joined = await signaling.join(code, latestAuth.current.accessToken);
      if (!connectingRef.current || generationRef.current !== generation) { await signaling.disconnect(joined.id, joined.controllerToken).catch(() => undefined); return; }
      sessionRef.current = joined;
      setSession({ id: joined.id, controllerToken: joined.controllerToken });
      setBusy(false);
      setStatus("Waiting for host authorization");
      const ws = new WebSocket(signaling.wsURL(joined.id, "controller"));
      wsRef.current = ws;
      const peer = new ControllerPeer(joined.id, joined.controllerToken, ws, [], {
        onRemoteStream: (stream) => { if (videoRef.current) videoRef.current.srcObject = stream; },
        onConnectionStatus: (status) => { setStatus(status);if(status==="connected")recorder.current?.connected(); if (["failed","disconnected","signaling error"].includes(status)) disconnect("Connection lost"); },
        onRelayStatus: setRelay,
        onLatency: setLatency,
        onTelemetry:sample=>{setTelemetry(sample);recorder.current?.route(sample.route);},
        onFailure:(reason)=>setError(transportFailure(reason))
      },{loadIceServers:()=>signaling.iceServers(latestAuth.current.accessToken)});
      peerRef.current = peer;
      ws.onopen = () => ws.send(JSON.stringify({ type: "authenticate", token: joined.controllerToken }));
      ws.onmessage = (ev) => {
        let msg: SignalMessage;
        try { msg = JSON.parse(ev.data) as SignalMessage; } catch { disconnect("Invalid signaling message"); return; }
        if (msg.sessionId !== joined.id) return;
        if (msg.type === "ready") {
          window.clearTimeout(readyTimer.current);
          ws.send(JSON.stringify({ type: "ping", sessionId: joined.id, sessionToken: joined.controllerToken, ts: Date.now() }));
          return;
        }
        if (["disconnect", "rejected", "expired"].includes(msg.type)) { disconnect(msg.type==="expired"?"Session expired":msg.type==="rejected"?"Rejected":"Session ended"); return; }
        void peer.handleSignal(msg);
      };
      ws.onclose = () => disconnect("Disconnected");
      ws.onerror = () => disconnect("Connection failed");
      readyTimer.current=window.setTimeout(()=>{setError("连接响应超时，请确认对方仍在共享。");disconnect("failed");},15_000);
    } catch (err) { if (generationRef.current === generation) { setError(friendlyError(err)); disconnect("failed"); } }
  }

  function sendPointer(type: "mouse_move" | "mouse_down" | "mouse_up", ev: React.PointerEvent<HTMLVideoElement>) {
    if (!session || !videoRef.current) return;
    const input = inputFromPointer(type, session.controllerToken, videoRef.current, ev);
    if (input) {
      ev.preventDefault();
      if (type === "mouse_down") { ev.currentTarget.focus(); ev.currentTarget.setPointerCapture(ev.pointerId); }
      peerRef.current?.sendInput(input);
    } else if (type === "mouse_up") {
      releaseInputs();
    }
    if (type === "mouse_up" && ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
  }

  function releaseInputs() {
    const current = sessionRef.current;
    if (current) peerRef.current?.sendInput({ type: "release_all", sessionToken: current.controllerToken, ts: Date.now() });
  }

  function sendKey(type: "key_down" | "key_up", ev: React.KeyboardEvent<HTMLVideoElement>) {
    if (!sessionRef.current) return;
    ev.preventDefault();
    peerRef.current?.sendInput(keyInput(type, sessionRef.current.controllerToken, ev));
  }

  function sendWheel(ev: WheelEvent) {
    if (!sessionRef.current) return;
    ev.preventDefault();
    peerRef.current?.sendInput(wheelInput(sessionRef.current.controllerToken, ev));
  }

  function disconnect(reason = "Disconnected") {
    recorder.current?.finish(reason);recorder.current=null;
    connectingRef.current = false;
    window.clearTimeout(readyTimer.current); readyTimer.current=undefined;
    generationRef.current++;
    const current = sessionRef.current;
    sessionRef.current = null;
    if (current) void signaling.disconnect(current.id, current.controllerToken).catch(() => undefined);
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; ws.onerror = null; }
    peerRef.current?.close();
    peerRef.current = null;
    ws?.close();
    if (videoRef.current) videoRef.current.srcObject = null;
    setLatency(null);
    setTelemetry(null);
    setRelay("Unknown");
    if(reason!=="Closed")setStatus(reason);
    setSession(null);
    setBusy(false); onActivity(false);
  }

  useEffect(() => () => { disconnect("Closed"); }, []);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) releaseInputs(); };
    window.addEventListener("blur", releaseInputs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("blur", releaseInputs); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  return (
    <section className="panel control-panel" id="control-panel" role="tabpanel" aria-labelledby="control-tab">
      <div className="panel-heading"><div><span className="eyebrow">CONNECT WITH A CODE</span><h2>连接另一台电脑</h2><p>请对方先共享主屏，再输入他们提供的 8 位连接码。</p></div><span className={`presence ${status==="connected"?"online":"offline"}`} role="status"><i />{connectionLabel(status)}</span></div>
      {error&&<StatusMessage error>{error}</StatusMessage>}
      {!session && <form className="join-form" onSubmit={(ev) => { ev.preventDefault(); void connect(); }} aria-busy={busy}><ConnectionCode id="session-code" value={code} onChange={value=>{setCode(value);setCodeError("");}} onBlur={()=>setCodeError(code&&!/^\d{8}$/.test(code)?"请填写完整的 8 位数字连接码。":"")} error={codeError} disabled={busy}/><button className="primary-action" disabled={busy} onPointerDown={ev=>{if(ev.button===0)ev.preventDefault();}}>{busy ? <ButtonSpinner/> : <Icon name="arrow"/>}{busy?"正在连接…":"发起连接"}</button></form>}
      {busy&&<button className="secondary-action" onClick={()=>disconnect("Disconnected")}>取消连接</button>}
      <RemoteScreen videoRef={videoRef} connected={!!session} status={connectionLabel(status)} onPointer={sendPointer} onKey={sendKey} onWheel={sendWheel} onRelease={releaseInputs} onDisconnect={()=>disconnect("Stopped by controller")} />
      <dl className="connection-details"><div><dt>连接状态</dt><dd>{connectionLabel(status)}</dd></div><div><dt>传输路径</dt><dd>{relay==="P2P"?"设备直连":relay==="TURN Relay"?"中继连接":"等待连接"}</dd></div><div><dt>往返延迟</dt><dd>{latency == null ? "待测量" : `${latency} ms`}</dd></div></dl>
      <ConnectionDiagnostics sample={telemetry} />
    </section>
  );
}

type StoredAuth = AuthResult;

function useStoredAuth(): [StoredAuth | null, (auth: StoredAuth | null, remember?: boolean) => Promise<void>, boolean] {
  const [auth, setAuthState] = useState<StoredAuth | null>(null);
  const [loaded, setLoaded] = useState(false);
  const rememberRef = useRef(true);
  const generation = useRef(0);
  const storageQueue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    const started = generation.current;
    void invoke<string | null>("read_stored_auth")
      .then(async raw => {
        if (cancelled || generation.current !== started) return;
        const legacy = localStorage.getItem("remoteassist.auth");
        localStorage.removeItem("remoteassist.auth");
        const saved = raw ?? legacy;
        if (!saved) return;
        const parsed = JSON.parse(saved) as StoredAuth & { remember?: boolean };
        if (parsed.remember === false) return;
        if (!parsed.user?.id || typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") return;
        const { remember: _remember, ...secureAuth } = parsed;
        setAuthState(secureAuth);
        if (!raw) {
          storageQueue.current = storageQueue.current.then(async () => {
            if (!cancelled && generation.current === started) await invoke("write_stored_auth", { authState: JSON.stringify(secureAuth) });
          }).catch(() => undefined);
          await storageQueue.current;
        }
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);
  async function setAuth(next: StoredAuth | null, remember?: boolean) {
    generation.current++;
    if (remember != null) rememberRef.current = remember;
    const persist = !!next && rememberRef.current;
    setAuthState(next);
    // Serialize credential writes so a slow save can never complete after logout deletion.
    storageQueue.current = storageQueue.current.then(async () => {
      if (persist) await invoke("write_stored_auth", { authState: JSON.stringify(next) });
      else await invoke("delete_stored_auth");
    }).catch(() => undefined);
    await storageQueue.current;
  }
  return [auth, setAuth, loaded];
}

function localDeviceInfo() {
  let fingerprint = localStorage.getItem("remoteassist.deviceFingerprint");
  if (!fingerprint) {
    fingerprint = crypto.randomUUID();
    localStorage.setItem("remoteassist.deviceFingerprint", fingerprint);
  }
  return {
    deviceName: navigator.userAgent.includes("Windows") ? "Windows PC" : "RemoteAssist Device",
    deviceFingerprint: fingerprint,
    osName: navigator.userAgent.includes("Windows") ? "Windows" : navigator.platform,
    appVersion
  };
}
