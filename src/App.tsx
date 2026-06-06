import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { inputFromPointer, InputEventGate, keyInput, wheelInput } from "./inputEvents";
import { AssistRequest, AuthResult, Device, SignalingClient, User } from "./signaling";
import { ControllerPeer, HostPeer, SignalMessage } from "./webrtc";

type View = "Dashboard" | "My Devices" | "Remote Assist" | "Sessions" | "Settings";
type AuthMode = "signin" | "register";

const signaling = new SignalingClient();
const appVersion = "0.2.0";

export function App() {
  const [auth, setAuth] = useStoredAuth();
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [user, setUser] = useState<User | null>(auth?.user ?? null);
  const [device, setDevice] = useState<Device | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [view, setView] = useState<View>("Dashboard");
  const [serviceStatus, setServiceStatus] = useState("Disconnected");
  const [assistRequests, setAssistRequests] = useState<AssistRequest[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    async function bootstrap() {
      try {
        const me = await signaling.me(auth!.accessToken);
        if (cancelled) return;
        setUser(me);
        const registered = await signaling.registerDevice(auth!.accessToken, localDeviceInfo());
        localStorage.setItem("remoteassist.deviceId", registered.id);
        setDevice(registered);
        setServiceStatus("Connected");
        const listed = await signaling.devices(auth!.accessToken, registered.id);
        setDevices(listed);
      } catch {
        setServiceStatus("Disconnected");
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  useEffect(() => {
    if (!auth || !device) return;
    const timer = window.setInterval(() => {
      signaling.heartbeat(auth.accessToken, device.id).then(setDevice).catch(() => setServiceStatus("Disconnected"));
      signaling.assistRequests(auth.accessToken, device.id).then(setAssistRequests).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [auth, device]);

  async function handleAuth(result: AuthResult, remember: boolean) {
    setAuth(remember ? result : { ...result, remember: false });
    setUser(result.user);
    setError("");
  }

  async function signOut() {
    if (auth) await signaling.logout(auth.refreshToken).catch(() => undefined);
    setAuth(null);
    setUser(null);
    setDevice(null);
    setDevices([]);
    setView("Dashboard");
  }

  if (!auth || !user) {
    return (
      <AuthShell
        mode={authMode}
        error={error}
        onError={setError}
        onMode={setAuthMode}
        onAuth={handleAuth}
      />
    );
  }

  return (
    <main className="desktop-shell">
      <aside className="sidebar">
        <h1>RemoteAssist</h1>
        {(["Dashboard", "My Devices", "Remote Assist", "Sessions", "Settings"] as View[]).map((item) => (
          <button key={item} className={view === item ? "nav-active" : ""} onClick={() => setView(item)}>{item}</button>
        ))}
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <strong>{user.username}</strong>
            <span>{device?.deviceName ?? "Registering device"}</span>
          </div>
          <div className="topbar-actions">
            <span className={serviceStatus === "Connected" ? "status-ok" : "status-bad"}>{serviceStatus}</span>
            <button className="link-button" onClick={() => void signOut()}>Sign Out</button>
          </div>
        </header>
        {assistRequests.length > 0 && (
          <div className="assist-banner">
            <strong>{assistRequests[0].controllerDeviceName}</strong>
            <span>is requesting remote assistance. Start sharing, choose a screen/window, and only allow control if you approve.</span>
            <button className="primary-action" onClick={() => { setView("Remote Assist"); void signaling.resolveAssistRequest(auth.accessToken, assistRequests[0].id, "ACCEPTED"); setAssistRequests([]); }}>Start Sharing</button>
            <button className="danger-action" onClick={() => { void signaling.resolveAssistRequest(auth.accessToken, assistRequests[0].id, "REJECTED"); setAssistRequests([]); }}>Reject</button>
          </div>
        )}
        {view === "Dashboard" && (
          <Dashboard
            device={device}
            devices={devices}
            onShare={() => setView("Remote Assist")}
            onControl={() => setView("Remote Assist")}
          />
        )}
        {view === "My Devices" && auth && device && (
          <MyDevices auth={auth} currentDevice={device} devices={devices} onDevices={setDevices} onRemoteAssist={() => setView("Remote Assist")} />
        )}
        {view === "Remote Assist" && <RemoteAssist />}
        {view === "Sessions" && <Placeholder title="Sessions" text="Recent session history is recorded server-side for deployment audit review." />}
        {view === "Settings" && <Placeholder title="Settings" text="Account, service URL, and device details are available in this client build." />}
      </section>
    </main>
  );
}

function AuthShell({
  mode,
  error,
  onError,
  onMode,
  onAuth
}: {
  mode: AuthMode;
  error: string;
  onError: (value: string) => void;
  onMode: (mode: AuthMode) => void;
  onAuth: (result: AuthResult, remember: boolean) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);
  const [form, setForm] = useState({ username: "", email: "", login: "", password: "", confirm: "", terms: false });
  const strength = passwordStrength(form.password);

  async function submit() {
    setLoading(true);
    onError("");
    try {
      if (mode === "signin") {
        await onAuth(await signaling.login(form.login, form.password), remember);
      } else {
        if (form.password !== form.confirm || !form.terms) throw new Error("Check password confirmation and agreement.");
        await onAuth(await signaling.register(form.username, form.email, form.password), remember);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>RemoteAssist</h1>
        {mode === "signin" ? (
          <>
            <input value={form.login} onChange={(ev) => setForm({ ...form, login: ev.target.value })} placeholder="Username or email" />
            <input value={form.password} onChange={(ev) => setForm({ ...form, password: ev.target.value })} placeholder="Password" type="password" />
            <label className="check-row"><input type="checkbox" checked={remember} onChange={(ev) => setRemember(ev.target.checked)} /> Remember sign in</label>
            {error && <div className="error-box">{error}</div>}
            <button className="primary-action" disabled={loading} onClick={() => void submit()}>{loading ? "Signing In" : "Sign In"}</button>
            <button className="secondary-action" onClick={() => onMode("register")}>Create Account</button>
          </>
        ) : (
          <>
            <input value={form.username} onChange={(ev) => setForm({ ...form, username: ev.target.value })} placeholder="Username" />
            <input value={form.email} onChange={(ev) => setForm({ ...form, email: ev.target.value })} placeholder="Email" />
            <input value={form.password} onChange={(ev) => setForm({ ...form, password: ev.target.value })} placeholder="Password" type="password" />
            <input value={form.confirm} onChange={(ev) => setForm({ ...form, confirm: ev.target.value })} placeholder="Confirm password" type="password" />
            <div className="strength"><span style={{ width: `${strength}%` }} /></div>
            <label className="check-row"><input type="checkbox" checked={form.terms} onChange={(ev) => setForm({ ...form, terms: ev.target.checked })} /> I agree to use RemoteAssist only with explicit host authorization.</label>
            {error && <div className="error-box">{error}</div>}
            <button className="primary-action" disabled={loading} onClick={() => void submit()}>{loading ? "Creating" : "Create Account"}</button>
            <button className="link-button" onClick={() => onMode("signin")}>Back to Sign In</button>
          </>
        )}
      </section>
    </main>
  );
}

function Dashboard({ device, devices, onShare, onControl }: { device: Device | null; devices: Device[]; onShare: () => void; onControl: () => void }) {
  const recent = useMemo(() => devices.slice(0, 3), [devices]);
  return (
    <section className="dashboard-grid">
      <div className="metric-card"><span>Current Device</span><strong>{device?.online ? "Online" : "Registering"}</strong></div>
      <div className="metric-card"><span>Devices</span><strong>{devices.length}</strong></div>
      <div className="metric-card"><span>Recent Sessions</span><strong>NOT VERIFIED</strong></div>
      <div className="quick-actions">
        <button className="primary-action" onClick={onShare}>Share This Computer</button>
        <button className="secondary-action" onClick={onControl}>Control Another Computer</button>
      </div>
      <div className="table-card">
        <h2>Recently Online</h2>
        {recent.map((item) => <p key={item.id}>{item.deviceName} - {item.online ? "Online" : "Offline"}</p>)}
      </div>
    </section>
  );
}

function MyDevices({ auth, currentDevice, devices, onDevices, onRemoteAssist }: { auth: StoredAuth; currentDevice: Device; devices: Device[]; onDevices: (devices: Device[]) => void; onRemoteAssist: () => void }) {
  const [message, setMessage] = useState("");
  async function reload() {
    onDevices(await signaling.devices(auth.accessToken, currentDevice.id));
  }
  async function updateNote(id: string, note: string) {
    await signaling.updateDevice(auth.accessToken, id, note);
    await reload();
  }
  async function revoke(id: string) {
    await signaling.revokeDevice(auth.accessToken, id);
    await reload();
  }
  async function requestAssist(id: string) {
    await signaling.requestAssist(auth.accessToken, id, currentDevice.id);
    setMessage("Remote assistance request sent. The host must explicitly start sharing and allow control.");
    onRemoteAssist();
  }
  return (
    <section className="table-card">
      <h2>My Devices</h2>
      {message && <div className="info-box">{message}</div>}
      {devices.map((item) => (
        <div className="device-row" key={item.id}>
          <div>
            <strong>{item.deviceName}</strong>
            <span>{item.osName} - {item.online ? "Online" : "Offline"} - Last seen {new Date(item.lastSeenAt).toLocaleString()}</span>
            {item.current && <em>Current device</em>}
          </div>
          <input defaultValue={item.note} placeholder="Note" onBlur={(ev) => void updateNote(item.id, ev.target.value)} />
          <button className="secondary-action" disabled={item.current || !item.online} onClick={() => void requestAssist(item.id)}>Connect</button>
          <button className="danger-action" disabled={item.current} onClick={() => void revoke(item.id)}>Unbind</button>
        </div>
      ))}
    </section>
  );
}

function RemoteAssist() {
  const [tab, setTab] = useState<"share" | "control">("share");
  return (
    <section>
      <div className="segmented">
        <button className={tab === "share" ? "nav-active" : ""} onClick={() => setTab("share")}>Share This Computer</button>
        <button className={tab === "control" ? "nav-active" : ""} onClick={() => setTab("control")}>Control Another Computer</button>
      </div>
      {tab === "share" ? <ShareComputer /> : <ControlComputer />}
    </section>
  );
}

function ShareComputer() {
  const [status, setStatus] = useState("Idle");
  const [permission, setPermission] = useState("Not sharing");
  const [code, setCode] = useState("");
  const [pendingApproval, setPendingApproval] = useState(false);
  const [session, setSession] = useState<{ id: string; hostToken: string; controllerToken?: string } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hostPeerRef = useRef<HostPeer | null>(null);

  async function startSharing() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    streamRef.current = stream;
    const created = await signaling.createShareSession();
    setSession({ id: created.id, hostToken: created.hostToken });
    setCode(created.code);
    setPermission("Sharing selected screen/window, waiting for controller");
    setStatus(`Code expires at ${new Date(created.expiresAt).toLocaleTimeString()}`);
    const ws = new WebSocket(signaling.wsURL(created.id, created.hostToken, "host"));
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as SignalMessage;
      if (msg.type === "ping") {
        setPendingApproval(true);
        setStatus("Controller is waiting for authorization");
      } else {
        void hostPeerRef.current?.handleSignal(msg);
      }
    };
    ws.onclose = () => stopSharing("Disconnected");
    stream.getTracks().forEach((track) => {
      track.onended = () => stopSharing("Capture stopped");
    });
  }

  async function allowControl() {
    if (!session || !streamRef.current || !wsRef.current) return;
    const approved = await signaling.approve(session.id, session.hostToken);
    await invoke("set_input_authorized", { sessionToken: approved.controllerToken });
    setSession({ ...session, controllerToken: approved.controllerToken });
    setPendingApproval(false);
    setPermission("Remote input authorized");
    const gate = new InputEventGate(approved.controllerToken, () => true);
    const peer = new HostPeer(session.id, session.hostToken, wsRef.current, await signaling.iceServers(), { onConnectionStatus: setStatus });
    hostPeerRef.current = peer;
    await peer.start(streamRef.current, gate);
  }

  async function stopSharing(reason = "Disconnected") {
    hostPeerRef.current?.close();
    wsRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    await invoke("clear_input_authorization").catch(() => undefined);
    if (session) await signaling.disconnect(session.id, session.hostToken).catch(() => undefined);
    setStatus(reason);
    setPermission("Not sharing");
    setCode("");
    setPendingApproval(false);
    setSession(null);
  }

  useEffect(() => () => { void stopSharing("Closed"); }, []);

  return (
    <section className="panel">
      <h2>Start Sharing</h2>
      {!code && <button className="primary-action" onClick={() => void startSharing()}>Start Sharing</button>}
      {code && <div className="code-box">{code}</div>}
      {pendingApproval && (
        <div className="approval">
          <strong>Controller is requesting access.</strong>
          <div className="row">
            <button className="primary-action" onClick={() => void allowControl()}>Allow Control</button>
            <button className="danger-action" onClick={() => void stopSharing("Rejected")}>Reject</button>
          </div>
        </div>
      )}
      <dl className="status-grid"><dt>Connection</dt><dd>{status}</dd><dt>Permission</dt><dd>{permission}</dd></dl>
      <button className="danger-action" onClick={() => void stopSharing("Stopped by host")}>Disconnect Now</button>
    </section>
  );
}

function ControlComputer() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("Idle");
  const [relay, setRelay] = useState<"P2P" | "TURN Relay" | "Unknown">("Unknown");
  const [latency, setLatency] = useState<number | null>(null);
  const [session, setSession] = useState<{ id: string; controllerToken: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<ControllerPeer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  async function connect() {
    const joined = await signaling.join(code);
    setSession({ id: joined.id, controllerToken: joined.controllerToken });
    setStatus("Waiting for host authorization");
    const ws = new WebSocket(signaling.wsURL(joined.id, joined.controllerToken, "controller"));
    wsRef.current = ws;
    const peer = new ControllerPeer(joined.id, joined.controllerToken, ws, await signaling.iceServers(), {
      onRemoteStream: (stream) => { if (videoRef.current) videoRef.current.srcObject = stream; },
      onConnectionStatus: setStatus,
      onRelayStatus: setRelay,
      onLatency: setLatency
    });
    peerRef.current = peer;
    ws.onopen = () => ws.send(JSON.stringify({ type: "ping", sessionId: joined.id, sessionToken: joined.controllerToken, ts: Date.now() }));
    ws.onmessage = (ev) => void peer.handleSignal(JSON.parse(ev.data) as SignalMessage);
    ws.onclose = () => disconnect("Disconnected");
  }

  function sendPointer(type: "mouse_move" | "mouse_down" | "mouse_up", ev: React.PointerEvent<HTMLVideoElement>) {
    if (!session || !videoRef.current) return;
    peerRef.current?.sendInput(inputFromPointer(type, session.controllerToken, videoRef.current, ev));
  }

  function disconnect(reason = "Disconnected") {
    if (session) signaling.disconnect(session.id, session.controllerToken).catch(() => undefined);
    peerRef.current?.close();
    wsRef.current?.close();
    setStatus(reason);
    setSession(null);
  }

  return (
    <section className="panel">
      <h2>Control Another Computer</h2>
      {!session && <form className="join-form" onSubmit={(ev) => { ev.preventDefault(); void connect(); }}><input value={code} onChange={(ev) => setCode(ev.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="8-digit code" inputMode="numeric" /><button className="primary-action" disabled={code.length !== 8}>Connect</button></form>}
      <div className="remote-stage"><video ref={videoRef} autoPlay playsInline tabIndex={0} onPointerMove={(ev) => sendPointer("mouse_move", ev)} onPointerDown={(ev) => sendPointer("mouse_down", ev)} onPointerUp={(ev) => sendPointer("mouse_up", ev)} onWheel={(ev) => session && peerRef.current?.sendInput(wheelInput(session.controllerToken, ev))} onKeyDown={(ev) => session && peerRef.current?.sendInput(keyInput("key_down", session.controllerToken, ev))} onKeyUp={(ev) => session && peerRef.current?.sendInput(keyInput("key_up", session.controllerToken, ev))} /></div>
      <dl className="status-grid"><dt>Connection</dt><dd>{status}</dd><dt>Route</dt><dd>{relay}</dd><dt>Latency</dt><dd>{latency == null ? "Unknown" : `${latency} ms`}</dd></dl>
      <button className="danger-action" onClick={() => disconnect("Stopped by controller")}>Disconnect Now</button>
    </section>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <section className="panel"><h2>{title}</h2><p>{text}</p></section>;
}

type StoredAuth = AuthResult & { remember?: boolean };

function useStoredAuth(): [StoredAuth | null, (auth: StoredAuth | null) => void] {
  const [auth, setAuthState] = useState<StoredAuth | null>(() => {
    const raw = localStorage.getItem("remoteassist.auth");
    return raw ? JSON.parse(raw) as StoredAuth : null;
  });
  function setAuth(next: StoredAuth | null) {
    setAuthState(next);
    if (next?.remember !== false) localStorage.setItem("remoteassist.auth", JSON.stringify(next));
    else localStorage.removeItem("remoteassist.auth");
  }
  return [auth, setAuth];
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

function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 25;
  if (/[A-Z]/.test(password)) score += 25;
  if (/[0-9]/.test(password)) score += 25;
  if (/[^A-Za-z0-9]/.test(password)) score += 25;
  return score;
}
