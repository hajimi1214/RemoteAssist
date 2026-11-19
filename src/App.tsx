import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { inputFromPointer, InputEventGate, keyInput, wheelInput } from "./inputEvents";
import { AssistRequest, AuthResult, Device, SignalingClient, SignalingHttpError, User } from "./signaling";
import { ControllerPeer, HostPeer, SignalMessage } from "./webrtc";

type View = "Dashboard" | "My Devices" | "Remote Assist" | "Sessions" | "Settings";
type AuthMode = "signin" | "register";

const signaling = new SignalingClient();
const appVersion = "0.3.0-alpha";

export function App() {
  const [auth, setAuth, authLoaded] = useStoredAuth();
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [user, setUser] = useState<User | null>(auth?.user ?? null);
  const [device, setDevice] = useState<Device | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [view, setView] = useState<View>("Dashboard");
  const [serviceStatus, setServiceStatus] = useState("Disconnected");
  const [assistRequests, setAssistRequests] = useState<AssistRequest[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoaded || !auth) return;
    let cancelled = false;
    async function bootstrap() {
      try {
        let activeAuth = auth!;
        let me: User;
        try {
          me = await signaling.me(activeAuth.accessToken);
        } catch (err) {
          if (!(err instanceof SignalingHttpError) || err.status !== 401) throw err;
          try {
            activeAuth = await signaling.refresh(activeAuth.refreshToken);
            await setAuth(activeAuth);
            return;
          } catch (refreshError) {
            if (refreshError instanceof SignalingHttpError && refreshError.status === 401) {
              await setAuth(null);
              setUser(null);
              return;
            }
            throw refreshError;
          }
        }
        if (cancelled) return;
        setUser(me);
        const registered = await signaling.registerDevice(activeAuth.accessToken, localDeviceInfo());
        localStorage.setItem("remoteassist.deviceId", registered.id);
        setDevice(registered);
        setServiceStatus("Connected");
        const listed = await signaling.devices(activeAuth.accessToken, registered.id);
        setDevices(listed);
      } catch {
        setServiceStatus("Disconnected");
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [auth, authLoaded]);

  useEffect(() => {
    if (!auth || !device) return;
    const timer = window.setInterval(() => {
      signaling.heartbeat(auth.accessToken, device.id).then(setDevice).catch(() => setServiceStatus("Disconnected"));
      signaling.assistRequests(auth.accessToken, device.id).then(setAssistRequests).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [auth, device]);

  async function handleAuth(result: AuthResult, remember: boolean) {
    await setAuth(result, remember);
    setUser(result.user);
    setError("");
  }

  async function signOut() {
    if (auth) await signaling.logout(auth.refreshToken).catch(() => undefined);
    await setAuth(null);
    setUser(null);
    setDevice(null);
    setDevices([]);
    setView("Dashboard");
  }

  if (!authLoaded) return <main className="auth-page"><section className="auth-panel">Loading secure sign-in…</section></main>;
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
      <header className="app-nav">
        <button className="brand-lockup" onClick={() => setView("Dashboard")} aria-label="RemoteAssist home">
          <BrandMark />
          <span className="brand-wordmark"><b>Remote</b><strong>Assist</strong></span>
        </button>
        <nav className="nav-menu" aria-label="Primary navigation">
          {(["Dashboard", "My Devices", "Remote Assist", "Sessions", "Settings"] as View[]).map((item) => (
            <button key={item} className={view === item ? "nav-active" : ""} onClick={() => setView(item)}>{item}</button>
          ))}
        </nav>
        <div className="nav-actions">
          <span className={`service-pill ${serviceStatus === "Connected" ? "is-online" : ""}`}><i />{serviceStatus}</span>
          <span className="user-chip">{user.username.slice(0, 1).toUpperCase()}</span>
          <button className="link-button" onClick={() => void signOut()}>Sign Out</button>
        </div>
      </header>
      <section className="workspace">
        <div className="page-heading">
          <div><span className="eyebrow">REMOTE ASSISTANCE CONTROL CENTER</span><h1>{view}</h1><p>{viewDescription(view)}</p></div>
          {device && <span className="device-badge"><i />{device.deviceName}</span>}
        </div>
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
            user={user}
            device={device}
            devices={devices}
            onShare={() => setView("Remote Assist")}
            onControl={() => setView("Remote Assist")}
          />
        )}
        {view === "My Devices" && auth && device && (
          <MyDevices auth={auth} currentDevice={device} devices={devices} onDevices={setDevices} onRemoteAssist={() => setView("Remote Assist")} />
        )}
        {view === "Remote Assist" && <RemoteAssist auth={auth} />}
        {view === "Sessions" && <SessionsPage />}
        {view === "Settings" && <SettingsPage user={user} device={device} />}
      </section>
    </main>
  );
}

function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="3.5" y="5.5" width="25" height="20" rx="4.5" fill="#edf4ff" stroke="#1b62f0" strokeWidth="2.5" /><path d="M10 32.5h12M16 25.5v7" stroke="#1b62f0" strokeWidth="2.5" strokeLinecap="round" /><circle cx="30.5" cy="29.5" r="6" fill="#7359e8" stroke="white" strokeWidth="2" /><path d="M27 9.5h3.5a5 5 0 0 1 5 5v6" stroke="#7359e8" strokeWidth="2.5" strokeLinecap="round" /><circle cx="35.5" cy="22" r="1.7" fill="#7359e8" /></svg>;
}

function Icon({ name }: { name: "monitor" | "devices" | "shield" | "history" | "arrow" }) {
  const paths = {
    monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    devices: <><rect x="3" y="4" width="13" height="15" rx="2" /><path d="M8 21h10a3 3 0 0 0 3-3V8a2 2 0 0 0-2-2h-3M7 16h5" /></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5M12 7v5l3 2" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>
  };
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function viewDescription(view: View): string {
  switch (view) {
    case "Dashboard": return "See your devices, sessions, and connection readiness at a glance.";
    case "My Devices": return "Manage trusted devices and start an explicit assistance request.";
    case "Remote Assist": return "Share a screen or connect with a temporary, host-approved code.";
    case "Sessions": return "Review recent assistance activity and connection status.";
    case "Settings": return "Review account, service, and device preferences.";
  }
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
  const [form, setForm] = useState({ username: "", email: "", login: "", password: "", confirm: "", terms: false });
  const [remember, setRemember] = useState(true);
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
      <section className="auth-layout">
        <div className="auth-showcase"><div className="showcase-brand"><BrandMark /><span><b>Remote</b><strong>Assist</strong></span></div><span className="eyebrow">VISIBLE BY DESIGN</span><h1>Help from anywhere.<br /><em>With permission.</em></h1><p>A calm, transparent remote assistance workspace for people and teams who need to stay in control.</p><div className="showcase-note"><i />Host approval is required before remote input is enabled.</div></div>
        <section className="auth-panel">
          <span className="eyebrow">SECURE WORKSPACE</span><h2>{mode === "signin" ? "Welcome back" : "Create your workspace"}</h2><p className="auth-subtitle">{mode === "signin" ? "Sign in to manage your trusted devices." : "Set up an account for explicit, visible assistance."}</p>
          {mode === "signin" ? (
            <>
              <label>Username or email<input value={form.login} onChange={(ev) => setForm({ ...form, login: ev.target.value })} placeholder="you@example.com" /></label>
              <label>Password<input value={form.password} onChange={(ev) => setForm({ ...form, password: ev.target.value })} placeholder="Enter your password" type="password" /></label>
              <label className="check-row"><input type="checkbox" checked={remember} onChange={(ev) => setRemember(ev.target.checked)} /> Remember sign in on this PC</label>
              {error && <div className="error-box">{error}</div>}
              <button className="primary-action wide-action" disabled={loading} onClick={() => void submit()}>{loading ? "Signing In" : "Sign In"}</button>
              <button className="link-button auth-switch" onClick={() => onMode("register")}>Create Account</button>
            </>
          ) : (
            <>
              <label>Username<input value={form.username} onChange={(ev) => setForm({ ...form, username: ev.target.value })} placeholder="Choose a username" /></label>
              <label>Email<input value={form.email} onChange={(ev) => setForm({ ...form, email: ev.target.value })} placeholder="you@example.com" /></label>
              <label>Password<input value={form.password} onChange={(ev) => setForm({ ...form, password: ev.target.value })} placeholder="At least 8 characters" type="password" /></label>
              <label>Confirm password<input value={form.confirm} onChange={(ev) => setForm({ ...form, confirm: ev.target.value })} placeholder="Repeat your password" type="password" /></label>
              <div className="strength"><span style={{ width: `${strength}%` }} /></div>
              <label className="check-row"><input type="checkbox" checked={form.terms} onChange={(ev) => setForm({ ...form, terms: ev.target.checked })} /> I agree to use RemoteAssist only with explicit host authorization.</label>
              {error && <div className="error-box">{error}</div>}
              <button className="primary-action wide-action" disabled={loading} onClick={() => void submit()}>{loading ? "Creating" : "Create Account"}</button>
              <button className="link-button auth-switch" onClick={() => onMode("signin")}>← Back to sign in</button>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function Dashboard({ user, device, devices, onShare, onControl }: { user: User; device: Device | null; devices: Device[]; onShare: () => void; onControl: () => void }) {
  const recent = useMemo(() => devices.slice(0, 3), [devices]);
  return (
    <section className="dashboard-page">
      <div className="welcome-hero">
        <div className="hero-copy"><span className="eyebrow">YOUR SUPPORT WORKSPACE</span><h2>Good to see you,<br /><em>{user.username}.</em></h2><p>Connect with confidence. Every session is visible, temporary, and approved by the host.</p><div className="hero-actions"><button className="primary-action" onClick={onShare}><Icon name="monitor" /> Share this computer</button><button className="hero-secondary" onClick={onControl}>Connect with a code <Icon name="arrow" /></button></div></div>
        <RemoteLinkVisual />
      </div>
      <div className="metric-grid">
        <div className="metric-card"><span className="metric-icon blue-icon"><Icon name="monitor" /></span><span>THIS DEVICE</span><strong>{device?.online ? "Online" : device ? "Connecting" : "Registering"}</strong><small>{device?.deviceName ?? "Windows desktop"}</small></div>
        <div className="metric-card"><span className="metric-icon violet-icon"><Icon name="devices" /></span><span>TRUSTED DEVICES</span><strong>{devices.length}</strong><small>{devices.filter((item) => item.online).length} online now</small></div>
        <div className="metric-card"><span className="metric-icon green-icon"><Icon name="shield" /></span><span>SESSION SECURITY</span><strong>Host approved</strong><small>Remote input stays locked until consent</small></div>
      </div>
      <section className="table-card device-overview">
        <div className="section-head"><div><span className="eyebrow">YOUR NETWORK</span><h2>Recently seen devices</h2></div><span className="count-chip">{devices.length} devices</span></div>
        {recent.length === 0 ? <div className="empty-inline"><span className="empty-icon"><Icon name="devices" /></span><div><strong>Your trusted device list is getting ready</strong><p>Once registered, your devices will appear here.</p></div></div> : recent.map((item) => <div className="device-summary" key={item.id}><span className="device-symbol"><Icon name="monitor" /></span><div className="device-summary-copy"><strong>{item.deviceName}</strong><span>{item.osName} · {item.current ? "This device" : `Last seen ${new Date(item.lastSeenAt).toLocaleString()}`}</span></div><span className={`presence ${item.online ? "online" : "offline"}`}><i />{item.online ? "Online" : "Offline"}</span></div>)}
      </section>
    </section>
  );
}

function RemoteLinkVisual() {
  return <div className="hero-visual" aria-hidden="true"><div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" /><div className="endpoint endpoint-left"><span className="endpoint-screen"><i /><i /><i /></span><span className="endpoint-label">YOUR DEVICE</span></div><svg className="connection-line" viewBox="0 0 250 80"><path d="M8 40h75l20-22h42l20 44h77" /><circle cx="8" cy="40" r="4" /><circle cx="242" cy="62" r="4" /></svg><span className="secure-node"><Icon name="shield" /></span><div className="endpoint endpoint-right"><span className="endpoint-screen remote-screen"><i /><i /><i /></span><span className="endpoint-label">REMOTE DEVICE</span></div><div className="visual-caption"><span className="caption-dot" /> Secure by default <b>Host approval required</b></div></div>;
}

function SessionsPage() {
  return <section className="panel empty-state"><span className="empty-icon large-empty"><Icon name="history" /></span><span className="eyebrow">SESSION ACTIVITY</span><h2>Your session history will live here</h2><p>This build doesn’t yet provide a session history feed. Start a visible, host-approved connection from Remote Assist when you’re ready.</p><div className="empty-security"><Icon name="shield" /><span>Session access remains temporary and host controlled.</span></div></section>;
}

function SettingsPage({ user, device }: { user: User; device: Device | null }) {
  return <section className="settings-grid"><article className="table-card settings-card"><span className="eyebrow">ACCOUNT</span><h2>Profile details</h2><div className="setting-row"><span>Name</span><strong>{user.username}</strong></div><div className="setting-row"><span>Email</span><strong>{user.email}</strong></div><div className="setting-row"><span>Sign-in storage</span><strong>Windows Credential Manager</strong></div></article><article className="table-card settings-card"><span className="eyebrow">THIS DEVICE</span><h2>Desktop client</h2><div className="setting-row"><span>Device</span><strong>{device?.deviceName ?? "Registering device"}</strong></div><div className="setting-row"><span>Operating system</span><strong>{device?.osName ?? "Windows"}</strong></div><div className="setting-row"><span>Application version</span><strong>{appVersion}</strong></div></article><article className="settings-safety"><span className="safety-icon"><Icon name="shield" /></span><div><strong>Host consent is always required</strong><p>Signing in does not grant remote access. The host must start sharing and explicitly approve input for each session.</p></div></article></section>;
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
    <section className="table-card device-list-page">
      <div className="section-head"><div><span className="eyebrow">TRUSTED ENDPOINTS</span><h2>My Devices</h2></div><span className="count-chip">{devices.length} devices</span></div>
      <p className="section-intro">Only your account’s registered devices appear here. A host still needs to start sharing and approve each request.</p>
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

function RemoteAssist({ auth }: { auth: AuthResult }) {
  const [tab, setTab] = useState<"share" | "control">("share");
  return (
    <section className="remote-assist-page">
      <div className="segmented" role="tablist" aria-label="Remote assistance mode">
        <button role="tab" aria-selected={tab === "share"} className={tab === "share" ? "nav-active" : ""} onClick={() => setTab("share")}><Icon name="monitor" /> Share this computer</button>
        <button role="tab" aria-selected={tab === "control"} className={tab === "control" ? "nav-active" : ""} onClick={() => setTab("control")}><Icon name="devices" /> Control another</button>
      </div>
      {tab === "share" ? <ShareComputer auth={auth} /> : <ControlComputer auth={auth} />}
    </section>
  );
}

function ShareComputer({ auth }: { auth: AuthResult }) {
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
    const consent = await invoke<boolean>("request_input_authorization");
    if (!consent) {
      setPermission("Remote input not authorized");
      return;
    }
    const approved = await signaling.approve(session.id, session.hostToken);
    await invoke("set_input_authorized", { sessionToken: approved.controllerToken });
    setSession({ ...session, controllerToken: approved.controllerToken });
    setPendingApproval(false);
    setPermission("Remote input authorized");
    const gate = new InputEventGate(approved.controllerToken, () => true);
    const peer = new HostPeer(session.id, session.hostToken, wsRef.current, await signaling.iceServers(auth.accessToken), { onConnectionStatus: setStatus });
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
    <section className="panel share-panel">
      <div className="panel-heading"><div><span className="eyebrow">HOST WORKFLOW</span><h2>Share this computer</h2><p>Choose a screen or window. Control remains disabled until you approve the request.</p></div><span className={`presence ${code ? "online" : "offline"}`}><i />{code ? "Sharing is visible" : "Not sharing"}</span></div>
      {!code && <div className="share-start"><span className="large-monitor"><Icon name="monitor" /></span><div><strong>Start a visible support session</strong><p>RemoteAssist will ask you to select the screen or window you want to share.</p><button className="primary-action" onClick={() => void startSharing()}><Icon name="monitor" /> Choose screen & start</button></div></div>}
      {code && <div className="share-active"><span className="eyebrow">TEMPORARY CONNECTION CODE</span><div className="code-box">{code}</div><p>Share this code with the person you trust. It expires at {status.startsWith("Code expires at ") ? status.replace("Code expires at ", "") : "the displayed time"}.</p></div>}
      {pendingApproval && (
        <div className="approval">
          <div><span className="eyebrow">HOST APPROVAL REQUIRED</span><strong>Someone is waiting to connect</strong><p>Review the request, then approve only if you recognize this person.</p></div>
          <div className="row">
            <button className="primary-action" onClick={() => void allowControl()}><Icon name="shield" /> Review & allow control</button>
            <button className="danger-action" onClick={() => void stopSharing("Rejected")}>Reject</button>
          </div>
        </div>
      )}
      <dl className="status-grid"><dt>Connection</dt><dd>{status}</dd><dt>Permission</dt><dd>{permission}</dd></dl>
      {code && <button className="danger-action" onClick={() => void stopSharing("Stopped by host")}>Stop sharing</button>}
    </section>
  );
}

function ControlComputer({ auth }: { auth: AuthResult }) {
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
    const peer = new ControllerPeer(joined.id, joined.controllerToken, ws, await signaling.iceServers(auth.accessToken), {
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
    <section className="panel control-panel">
      <div className="panel-heading"><div><span className="eyebrow">CONTROLLER WORKFLOW</span><h2>Connect to a computer</h2><p>Enter a temporary code. The host chooses what to share and must approve control.</p></div><span className="presence offline"><i />{status}</span></div>
      {!session && <form className="join-form" onSubmit={(ev) => { ev.preventDefault(); void connect(); }}><label htmlFor="session-code">8-digit session code</label><div><input id="session-code" value={code} onChange={(ev) => setCode(ev.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="00000000" inputMode="numeric" /><button className="primary-action" disabled={code.length !== 8}>Connect</button></div></form>}
      <div className="remote-stage"><video ref={videoRef} autoPlay playsInline tabIndex={0} onPointerMove={(ev) => sendPointer("mouse_move", ev)} onPointerDown={(ev) => sendPointer("mouse_down", ev)} onPointerUp={(ev) => sendPointer("mouse_up", ev)} onWheel={(ev) => session && peerRef.current?.sendInput(wheelInput(session.controllerToken, ev))} onKeyDown={(ev) => session && peerRef.current?.sendInput(keyInput("key_down", session.controllerToken, ev))} onKeyUp={(ev) => session && peerRef.current?.sendInput(keyInput("key_up", session.controllerToken, ev))} /></div>
      {!session && <div className="stage-placeholder"><span className="empty-icon"><Icon name="monitor" /></span><strong>Remote screen will appear here</strong><span>Connect with a temporary code to begin.</span></div>}
      <dl className="status-grid"><dt>Connection</dt><dd>{status}</dd><dt>Route</dt><dd>{relay}</dd><dt>Latency</dt><dd>{latency == null ? "Waiting for connection" : `${latency} ms`}</dd></dl>
      {session && <button className="danger-action" onClick={() => disconnect("Stopped by controller")}>Disconnect</button>}
    </section>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <section className="panel"><h2>{title}</h2><p>{text}</p></section>;
}

type StoredAuth = AuthResult;

function useStoredAuth(): [StoredAuth | null, (auth: StoredAuth | null, remember?: boolean) => Promise<void>, boolean] {
  const [auth, setAuthState] = useState<StoredAuth | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void invoke<string | null>("read_stored_auth")
      .then(async (raw) => {
        const legacy = localStorage.getItem("remoteassist.auth");
        localStorage.removeItem("remoteassist.auth");
        const saved = raw ?? legacy;
        if (!saved) return;
        const parsed = JSON.parse(saved) as StoredAuth & { remember?: boolean };
        if (parsed.remember === false) return;
        const { remember: _remember, ...secureAuth } = parsed;
        setAuthState(secureAuth);
        if (!raw) await invoke("write_stored_auth", { authState: JSON.stringify(secureAuth) });
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  async function setAuth(next: StoredAuth | null, remember = true) {
    setAuthState(next);
    try {
      if (next && remember) await invoke("write_stored_auth", { authState: JSON.stringify(next) });
      else await invoke("delete_stored_auth");
    } catch {
      // Authentication remains in memory when the platform credential store is unavailable.
    }
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

function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 25;
  if (/[A-Z]/.test(password)) score += 25;
  if (/[0-9]/.test(password)) score += 25;
  if (/[^A-Za-z0-9]/.test(password)) score += 25;
  return score;
}
