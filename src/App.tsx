import { compatibleQualityMode, readQualityPreference } from "./qualityMode";
import { writePreference } from "./preferenceStore";
import type { QualityMode } from "./qualityMode";
import { androidClient, configuredServer, controllerOnly, secureCredentialStorage } from "./platform";
import { MobileGuestPage, MobileHome, ServerDialog } from "./MobileHome";
import type { MobileAction } from "./mobileInput";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { inputFromPointer, keyInput, wheelInput } from "./inputEvents";
import { AuthResult, Device, SignalingClient, SignalingHttpError, User } from "./signaling";
import { ControllerPeer, SignalMessage } from "./webrtc";

import { SessionsPage, SettingsPage } from "./pages";
import { BrandMark, Icon, RemoteScreen, StatusMessage, ConnectionDiagnostics } from "./ui";
import type { IconName } from "./ui";
import type { VideoTelemetry } from "./videoTelemetry";
import { VideoPresentationWindow } from "./videoPresentation";
import type { VideoPresentationSummary } from "./videoPresentation";
import { usePreferences } from "./preferences";
import { useSessionJournal } from "./useSessionJournal";
import { createSessionRecorder } from "./sessionJournal";
import type { SessionSummary } from "./sessionJournal";
import { DeviceWorkspace } from "./DeviceWorkspace";
import { DashboardPage, RemoteAssistWorkspace } from "./WorkflowPages";
import { useDirectHost } from "./useDirectHost";
import { AuthDialog } from "./AuthDialog";
import { FeedbackDialog, nativeWindow, WindowBar } from "./workspaceChrome";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { pages, friendlyError, connectionLabel, transportFailure } from "./ux";
import type { View } from "./ux";
type AuthMode = "signin" | "register";

const signaling = new SignalingClient();
const appVersion = "0.15.1-alpha";
const navigationIcons: Record<View, IconName> = { Dashboard:"grid", "My Devices":"devices", "Remote Assist":"monitor", Sessions:"history", Settings:"settings" };

export function App() {
  const [auth, setAuth, authLoaded] = useStoredAuth();
  const [loginTarget, setLoginTarget] = useState<{ view: View } | null>(null);
  const [loginError, setLoginError] = useState("");
  const [serverOpen, setServerOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [user, setUser] = useState<User | null>(auth?.user ?? null);
  const [device, setDevice] = useState<Device | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [view, setView] = useState<View>("My Devices");
  const [targetDevice,setTargetDevice]=useState<Device|null>(null);
  const [assistCode,setAssistCode]=useState<string|null>(null);
  const [serviceStatus, setServiceStatus] = useState("Disconnected");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [assistHostActive, setAssistHostActive] = useState(false);
  const [retry, setRetry] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const controlFullscreenEpoch = useRef(0);
  const restoreControlFullscreen = useRef(false);
  const openingDevice = useRef(false);
  const preferences = usePreferences();
  const journal=useSessionJournal(auth?.user.id);
  const directHost=useDirectHost(auth,device,signaling,!assistHostActive);
  const viewRef=useRef(view); viewRef.current=view;
  const authRef = useRef(auth);
  authRef.current = auth;

  function clearAccountData() { setTargetDevice(null);setAssistCode(null); authRef.current = null; setUser(null); setDevice(null); setDevices([]);  setServiceStatus("Disconnected"); setView("My Devices"); }
  function updateActivity(active: boolean) { setSessionActive(active); }
  function guard(action: () => void) { action(); }
  function requestLogin(next: View = view) { if(androidClient&&!configuredServer()&&!import.meta.env.VITE_SIGNALING_URL){setServerOpen(true);return;} if (!authLoaded) { setNotice("正在恢复登录，请稍候再试。"); return; } setLoginError(""); setAuthMode("signin"); setLoginTarget({ view: next }); }
  async function enterControlFullscreen() {
    if(!nativeWindow)return;
    const epoch=++controlFullscreenEpoch.current;
    const currentWindow=getCurrentWindow();
    restoreControlFullscreen.current=false;
    const wasFullscreen=await currentWindow.isFullscreen();
    if(epoch!==controlFullscreenEpoch.current)return;
    restoreControlFullscreen.current=!wasFullscreen;
    if(!wasFullscreen)await currentWindow.setFullscreen(true);
  }
  function leaveControlFullscreen() {
    controlFullscreenEpoch.current++;
    const shouldRestore=restoreControlFullscreen.current;
    restoreControlFullscreen.current=false;
    if(nativeWindow&&shouldRestore)void getCurrentWindow().setFullscreen(false).catch(()=>undefined);
  }
  function returnToDevices() { leaveControlFullscreen();setAssistCode(null);setTargetDevice(null);setView("My Devices"); }
  function connectDevice(item:Device){
    if(!auth){requestLogin("My Devices");return;}
    if(openingDevice.current)return;
    openingDevice.current=true;
    setError("");setNotice("");
    void (async()=>{
      try{await enterControlFullscreen();}
      catch{setNotice("全屏切换失败，正在以大画面打开远程桌面。可通过悬浮控制栏退出。")}
      setAssistCode(null);setTargetDevice(item);setView("Remote Assist");
      openingDevice.current=false;
    })();
  }
  function refreshDevices(){if(!auth||!device)return;const owner=auth.user.id;void signaling.devices(auth.accessToken,device.id).then(list=>{if(authRef.current?.user.id===owner)setDevices(list);}).catch(err=>{if(authRef.current?.user.id===owner)setError(friendlyError(err));});}
  function navigate(next: View) {
    if (next === viewRef.current) return;
    guard(() => { if(next!=="Remote Assist"){setTargetDevice(null);setAssistCode(null);}else{setNotice("");}setView(next); });
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
        const localInfo=localDeviceInfo();
        if(!controllerOnly){try{localInfo.deviceName=await invoke<string>("local_device_name");}catch{}}
        const registered = await signaling.registerDevice(activeAuth.accessToken, localInfo);
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
      const results = await Promise.allSettled([signaling.heartbeat(auth.accessToken,device.id),signaling.devices(auth.accessToken,device.id)]);
      if (cancelled || authRef.current !== auth) return;
      if (results[0].status === "fulfilled") { setDevice(results[0].value); setServiceStatus("Connected"); } else setServiceStatus("Disconnected");
      if (results[1].status === "fulfilled") setDevices(results[1].value ?? []);
      timer = window.setTimeout(() => { void poll(); },12_000);
    };
    void poll();
    return () => { cancelled=true; window.clearTimeout(timer); };
  }, [auth, device?.id]);

  async function handleAuth(result: AuthResult, remember: boolean) {
    const destination = loginTarget;setTargetDevice(null);setAssistCode(null);
    setDevice(null); setDevices([]);  setServiceStatus("Connecting");
    setLoginTarget(null); setLoginError(""); setUser(result.user); setError("");
    setNotice("登录成功，选择在线电脑即可直接进入桌面。");
    if (destination) setView(destination.view);
    await setAuth(result, remember);
  }

  async function signOut() {
    const current = auth;
    authRef.current=null;
    await setAuth(null);
    setTargetDevice(null);
    setAssistCode(null);
    setUser(null);
    setDevice(null);
    setDevices([]);
    setView("My Devices");
     setNotice("已退出登录，可以继续浏览。"); setError(""); setServiceStatus("Disconnected");
    if (current) await signaling.logout(current.refreshToken).catch(() => undefined);
  }

  const signedIn = !!auth && !!user;
  const publicView = signedIn ? user : null;
  const closeWindow = () => guard(() => { void getCurrentWindow().close().catch(() => setError("关闭窗口失败，请重试。")); });

  return (
    <div className={`app-frame${nativeWindow ? " native-frame" : ""}${androidClient?" android-frame":""}${sessionActive?" session-active":""}`}><WindowBar onClose={closeWindow} onError={setError}/>
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
        {view === "Dashboard" && <DashboardPage username={signedIn?user?.username:undefined} onlineDevices={devices.filter(item=>item.online&&item.osName==="Windows").length} onMyDevices={()=>navigate("My Devices")} onRemoteAssist={()=>navigate("Remote Assist")}/>}
        {view === "My Devices" && signedIn && device && <DeviceWorkspace devices={devices} currentDevice={device} onConnect={connectDevice} onRefresh={refreshDevices}/>}
        {view === "My Devices" && !signedIn && <MobileHome signedIn={false} onConnect={()=>requestLogin("My Devices")} onServer={()=>setServerOpen(true)}/>}
        {view === "Remote Assist" && signedIn && auth && device && assistCode && <ControlComputer key={`code-${assistCode}`} auth={auth} controller={device} joinCode={assistCode} onActivity={updateActivity} onRecord={summary=>journal.add(auth.user.id,summary)} onExitFullscreen={leaveControlFullscreen} onBack={()=>{leaveControlFullscreen();setAssistCode(null);setView("Remote Assist");}}/>}
        {view === "Remote Assist" && signedIn && auth && device && !targetDevice && !assistCode && <RemoteAssistWorkspace auth={auth} device={device} signaling={signaling} onLogin={()=>requestLogin("Remote Assist")} onJoin={code=>{void enterControlFullscreen().catch(()=>undefined).finally(()=>{setTargetDevice(null);setAssistCode(code);});}} onActivity={updateActivity} onHostActive={setAssistHostActive} onRecord={summary=>journal.add(auth.user.id,summary)}/>}
        {view === "Remote Assist" && !signedIn && <RemoteAssistWorkspace auth={null} device={null} signaling={signaling} onLogin={()=>requestLogin("Remote Assist")} onJoin={()=>undefined} onActivity={updateActivity} onHostActive={()=>undefined} onRecord={()=>undefined}/>}
        {view === "Remote Assist" && auth && device && targetDevice && <ControlComputer key={`device-${targetDevice.id}`} auth={auth} target={targetDevice} controller={device} onActivity={updateActivity} onRecord={summary=>journal.add(auth.user.id,summary)} onExitFullscreen={leaveControlFullscreen} onBack={returnToDevices}/>}
        {!signedIn && view === "Sessions" && <MobileGuestPage page="Sessions" onLogin={()=>requestLogin("Sessions")} onServer={()=>setServerOpen(true)}/>}
        {view === "Sessions" && signedIn && <SessionsPage records={journal.records} persist={journal.persist} storageError={journal.storageError} onPersistence={journal.setPersistence} onClear={journal.clear} onRetryStorage={journal.retryStorage} onStart={()=>navigate("My Devices")} />}
        {view === "Settings" && <SettingsPage onLogin={()=>requestLogin()} onChangeServer={()=>guard(()=>setServerOpen(true))} onNavigate={next=>navigate(next)} onFeedback={()=>setFeedbackOpen(true)} user={publicView} device={device} version={appVersion} serviceStatus={serviceStatus} preferences={preferences} auth={auth} signaling={signaling} />}
        {signedIn && !controllerOnly && !assistHostActive && <div className={`direct-host-indicator${directHost.active?" host-connected":""}`} role="status"><Icon name="monitor"/><span>{directHost.active?`${directHost.name} 正在控制这台电脑`:directHost.paused?"本人设备直连已暂停":"同账号本人设备直连已开启"}{directHost.error&&<small>{directHost.error}</small>}</span><button onClick={directHost.paused?directHost.resume:directHost.pause}>{directHost.paused?"恢复访问":directHost.active?"停止并暂停访问":"暂停访问"}</button></div>}
      </section>
      <footer className="workspace-footer"><span>RemoteAssist {appVersion}</span><button className="feedback-trigger" onClick={() => setFeedbackOpen(true)}>使用反馈<Icon name="arrow"/></button><span>{sessionActive?"协助进行中 · 悬浮球可结束":"本人设备直连 · 远程协助使用一次性操控码"}</span></footer>
      {serverOpen && <ServerDialog onClose={()=>setServerOpen(false)} onSave={async url=>{await signOut();localStorage.setItem("remoteassist.serverURL",url);window.location.reload();}}/>}
      {loginTarget && <AuthDialog mode={authMode} error={loginError} onError={setLoginError} onMode={setAuthMode} onAuth={handleAuth} signaling={signaling} onClose={() => { setLoginTarget(null); setLoginError(""); }} purpose={loginTarget.view==="Remote Assist"?"两端分别登录后，用一次性操控码建立本次协助。":secureCredentialStorage?"登录后可直接连接同账号在线电脑。此 Windows 电脑默认记住登录，被控电脑需开机并运行客户端。":"登录后可直接连接同账号在线电脑。被控电脑需开机并运行客户端。"}/>}
      {feedbackOpen && <FeedbackDialog version={appVersion} page={pages[view].title} connection={signedIn ? serviceStatus : "未登录"} onClose={() => setFeedbackOpen(false)}/>}
    </main></div>
  );
}

function ControlComputer({ auth, target, controller, joinCode, onBack, onExitFullscreen, onActivity, onRecord }: { auth: AuthResult; target?:Device;controller:Device;joinCode?:string;onBack:()=>void;onExitFullscreen:()=>void;onActivity: (active: boolean) => void; onRecord:(summary:SessionSummary)=>void }) {
  const recorder=useRef<ReturnType<typeof createSessionRecorder>|null>(null);
  const latestAuth=useRef(auth);latestAuth.current=auth;
  const [status, setStatus] = useState("Idle");
  const [relay, setRelay] = useState<"P2P" | "TURN Relay" | "Unknown">("Unknown");
  const [latency, setLatency] = useState<number | null>(null);
  const [telemetry,setTelemetry]=useState<VideoTelemetry|null>(null);
  const [inputNotice,setInputNotice]=useState("");
  const [qualityMode,setQualityMode]=useState<QualityMode>(readQualityPreference);
  const qualityModeRef=useRef(qualityMode);qualityModeRef.current=qualityMode;
  const [qualityControl,setQualityControl]=useState(false);
  const [gameInputSupported,setGameInputSupported]=useState(false);
  const gameInputSupportedRef=useRef(false);
  const [qualityNotice,setQualityNotice]=useState("");
  const [textSupported,setTextSupported]=useState(false);
  const [session, setSession] = useState<{ id: string; controllerToken: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const presentationRef = useRef<VideoPresentationSummary | undefined>(undefined);
  const presentationAtRef = useRef(0);
  const presentationExpiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peerRef = useRef<ControllerPeer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<{ id: string; controllerToken: string } | null>(null);
  const connectingRef = useRef(false);
  const readyTimer = useRef<number | undefined>(undefined);
  const generationRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const targetName = target ? target.note || target.deviceName : "一次性远程协助";

  async function connect() {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setBusy(true); setError(""); onActivity(true);
    const generation = ++generationRef.current;
    recorder.current=createSessionRecorder("control",onRecord);
    try {
      const joined = joinCode
        ? await signaling.joinCodeSession(latestAuth.current.accessToken, joinCode)
        : target
          ? await signaling.connectDevice(latestAuth.current.accessToken,target.id,controller.id)
          : undefined;
      if (!joined) throw new Error("invalid_connection_target");
      if (!connectingRef.current || generationRef.current !== generation) { await signaling.disconnect(joined.id, joined.controllerToken).catch(() => undefined); return; }
      sessionRef.current = joined;
      setSession({ id: joined.id, controllerToken: joined.controllerToken });
      setBusy(false);
      setStatus("Waiting for device");
      const ws = new WebSocket(signaling.wsURL(joined.id, "controller"));
      wsRef.current = ws;
      const peer = new ControllerPeer(joined.id, joined.controllerToken, ws, [], {
        onQualityControl:sample=>{setQualityControl(sample.supported);if(sample.supported){const compatibleMode=sample.mode==="game"?compatibleQualityMode(sample.mode,gameInputSupportedRef.current):sample.mode;setQualityNotice(`电脑端画质偏好：${{auto:"自动",sharp:"清晰",smooth:"流畅",economy:"省带宽",game:"游戏"}[compatibleMode]}${sample.applied?" · 参数已应用":" · 编码参数由浏览器管理"}`);}},
        onInputStatus:sample=>setInputNotice(sample.reason==="limited"?"输入频率较高，正在合并鼠标移动以降低积压。":"部分输入未送达电脑，请查看连接状态。"),
        onTextSupport:setTextSupported,
        onGameSupport:supported=>{gameInputSupportedRef.current=supported;setGameInputSupported(supported);const compatibleMode=compatibleQualityMode(qualityModeRef.current,supported);if(compatibleMode!==qualityModeRef.current){qualityModeRef.current=compatibleMode;setQualityMode(compatibleMode);}},
        onRemoteStream: (stream) => { if (videoRef.current) videoRef.current.srcObject = stream; },
        onConnectionStatus: (status) => { setStatus(status);if(status==="connected"){window.clearTimeout(readyTimer.current);recorder.current?.connected();} if (["failed","disconnected","signaling error"].includes(status)) disconnect("Connection lost"); },
        onRelayStatus: setRelay,
        onLatency: setLatency,
        onTelemetry:sample=>{
          const presentation=performance.now()-presentationAtRef.current<=2_000?presentationRef.current:undefined;
          setTelemetry(presentation?{...sample,presentation}:sample);
          recorder.current?.route(sample.route);
        },
        onFailure:(reason)=>setError(transportFailure(reason))
      },{qualityMode,loadIceServers:()=>signaling.iceServers(latestAuth.current.accessToken)});
      peerRef.current = peer;
      ws.onopen = () => ws.send(JSON.stringify({ type: "authenticate", token: joined.controllerToken }));
      ws.onmessage = (ev) => {
        let msg: SignalMessage;
        try { msg = JSON.parse(ev.data) as SignalMessage; } catch { disconnect("Invalid signaling message"); return; }
        if (msg.sessionId !== joined.id) return;
        if (msg.type === "ready") {
          ws.send(JSON.stringify({ type: "ping", sessionId: joined.id, sessionToken: joined.controllerToken, ts: Date.now() }));
          return;
        }
        if (["disconnect", "rejected", "expired"].includes(msg.type)) { disconnect(msg.type==="expired"?"Session expired":msg.type==="rejected"?"Rejected":"Session ended"); return; }
        void peer.handleSignal(msg);
      };
      ws.onclose = () => disconnect("Disconnected");
      ws.onerror = () => disconnect("Connection failed");
      readyTimer.current=window.setTimeout(()=>{setError(joinCode?"操控码暂未建立连接，请确认对方电脑仍在等待协助并且操控码未过期。":"设备暂未就绪。请确认电脑客户端已升级、保持登录且没有暂停远程访问。");disconnect("failed");},55_000);
    } catch (err) { if (generationRef.current === generation) { setError(joinCode&&err instanceof SignalingHttpError&&err.status===404?"操控码无效、已过期或已经使用，请让对方重新生成。":friendlyError(err)); disconnect("failed"); } }
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

  function sendMobile(action: MobileAction): boolean {
    const current=sessionRef.current;
    if(!current || status!=="connected")return false;
    return peerRef.current?.sendInput({...action,sessionToken:current.controllerToken,ts:Date.now()}) ?? false;
  }
  function sendGameMouse(action:{type:"mouse_relative"|"mouse_down"|"mouse_up";payload:Record<string,unknown>}):boolean {
    const current=sessionRef.current;
    if(!current||status!=="connected"||!gameInputSupported)return false;
    return peerRef.current?.sendInput({...action,sessionToken:current.controllerToken,ts:Date.now()})??false;
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
    setTelemetry(null);setTextSupported(false);setQualityControl(false);setQualityNotice("");
    gameInputSupportedRef.current=false;setGameInputSupported(false);
    setInputNotice("");
    setRelay("Unknown");
    if(reason!=="Closed")setStatus(reason);
    setSession(null);
    setBusy(false); onActivity(false);onExitFullscreen();
  }

  useEffect(() => { const timer=setTimeout(()=>void connect(),0); return()=>{clearTimeout(timer);disconnect("Closed");}; }, []);

  useEffect(() => {
    const video = videoRef.current as (HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: (now: number, metadata: { presentedFrames: number }) => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    }) | null;
    if (!video?.requestVideoFrameCallback) return;
    const presentation = new VideoPresentationWindow();
    let stopped = false;
    let callbackHandle: number | undefined;
    const onFrame = (now: number, metadata: { presentedFrames: number }) => {
      if (stopped) return;
      const summary = presentation.add(now, metadata.presentedFrames);
      if (summary) {
        presentationRef.current = summary;
        presentationAtRef.current = now;
        setTelemetry(previous => previous ? { ...previous, presentation: summary } : previous);
        clearTimeout(presentationExpiry.current);
        presentationExpiry.current = setTimeout(() => {
          if (presentationRef.current !== summary) return;
          presentationRef.current = undefined;
          setTelemetry(previous => {
            if (!previous?.presentation) return previous;
            const { presentation: _expired, ...current } = previous;
            return current;
          });
        }, 2_000);
      }
      callbackHandle = video.requestVideoFrameCallback!(onFrame);
    };
    callbackHandle = video.requestVideoFrameCallback(onFrame);
    return () => {
      stopped = true;
      if (callbackHandle != null) video.cancelVideoFrameCallback?.(callbackHandle);
      clearTimeout(presentationExpiry.current);
      presentationExpiry.current = undefined;
      presentation.reset();
      presentationRef.current = undefined;
      presentationAtRef.current = 0;
    };
  }, [session?.id]);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) releaseInputs(); };
    window.addEventListener("blur", releaseInputs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("blur", releaseInputs); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  return (
    <section className="panel control-panel" id="control-panel" aria-label="远程桌面连接">
      <div className="panel-heading"><button className="secondary-action" onClick={()=>{disconnect("Stopped by controller");onBack();}}>{joinCode?"返回远程协助":"返回我的设备"}</button><h2>{targetName}</h2><span className={`presence ${status==="connected"?"online":"offline"}`} role="status"><i />{connectionLabel(status)}</span></div>
      {error&&<StatusMessage error>{error}</StatusMessage>}
      {inputNotice&&<StatusMessage>{inputNotice}</StatusMessage>}
      {qualityNotice&&<p className="field-hint" role="status">{qualityNotice}</p>}
      {!session&&!busy&&<button className="primary-action" onClick={()=>void connect()}>重新连接</button>}
      {busy&&<p role="status">正在连接设备…</p>}
      <RemoteScreen qualityMode={qualityMode} gameInputSupported={gameInputSupported} onGameMouse={sendGameMouse} onQualityModeChange={qualityControl?mode=>{if(mode==="game"&&!gameInputSupported)return;qualityModeRef.current=mode;setQualityMode(mode);writePreference("remoteassist.qualityMode",mode);setQualityNotice(peerRef.current?.setQualityMode(mode)?"正在调整电脑端画质…":"画质未调整，连接可能已断开。");}:undefined} telemetry={telemetry} latency={latency} onMobileAction={sendMobile} textSupported={textSupported} videoRef={videoRef} connected={status==="connected"} autoFullscreen deviceName={targetName} status={connectionLabel(status)} onPointer={sendPointer} onKey={sendKey} onWheel={sendWheel} onRelease={releaseInputs} onExitFullscreen={onExitFullscreen} onDisconnect={()=>{disconnect("Stopped by controller");onBack();}} />
      <dl className="connection-details"><div><dt>连接状态</dt><dd>{connectionLabel(status)}</dd></div><div><dt>传输路径</dt><dd>{relay==="P2P"?"设备直连":relay==="TURN Relay"?"中继连接":"等待连接"}</dd></div><div><dt>往返延迟</dt><dd>{latency == null ? "待测量" : `${latency} ms`}</dd></div></dl>
      <ConnectionDiagnostics sample={telemetry} version={appVersion} />
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
    if (!secureCredentialStorage) { setLoaded(true); return; }
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
    const persist = !!next && rememberRef.current && secureCredentialStorage;
    setAuthState(next);
    // Serialize credential writes so a slow save can never complete after logout deletion.
    storageQueue.current = storageQueue.current.then(async () => {
      if(!secureCredentialStorage)return;
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
    deviceName: androidClient ? "Android 手机 / 平板" : navigator.userAgent.includes("Windows") ? "Windows PC" : "RemoteAssist Device",
    deviceFingerprint: fingerprint,
    osName: androidClient ? "Android" : controllerOnly ? "Web Controller" : navigator.userAgent.includes("Windows") ? "Windows" : navigator.platform,
    appVersion
  };
}
