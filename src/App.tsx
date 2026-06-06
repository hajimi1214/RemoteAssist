import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { inputFromPointer, InputEventGate, keyInput, wheelInput } from "./inputEvents";
import { SignalingClient } from "./signaling";
import { ControllerPeer, HostPeer, SignalMessage } from "./webrtc";

type Mode = "home" | "share" | "control";

const signaling = new SignalingClient();

export function App() {
  const [mode, setMode] = useState<Mode>("home");
  return (
    <main className="app-shell">
      <header>
        <div>
          <h1>RemoteAssist</h1>
          <p>Visible Windows remote assistance with explicit host authorization.</p>
        </div>
      </header>
      {mode === "home" && <Home onShare={() => setMode("share")} onControl={() => setMode("control")} />}
      {mode === "share" && <ShareComputer onBack={() => setMode("home")} />}
      {mode === "control" && <ControlComputer onBack={() => setMode("home")} />}
    </main>
  );
}

function Home({ onShare, onControl }: { onShare: () => void; onControl: () => void }) {
  return (
    <section className="home-actions">
      <button className="primary-action" onClick={onShare}>Share This Computer</button>
      <button className="secondary-action" onClick={onControl}>Control Another Computer</button>
    </section>
  );
}

function ShareComputer({ onBack }: { onBack: () => void }) {
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
    const peer = new HostPeer(session.id, session.hostToken, wsRef.current, await signaling.iceServers(), {
      onConnectionStatus: setStatus
    });
    hostPeerRef.current = peer;
    await peer.start(streamRef.current, gate);
  }

  async function rejectControl() {
    if (!session) return;
    await signaling.reject(session.id, session.hostToken);
    setPendingApproval(false);
    await stopSharing("Rejected");
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
      <button className="link-button" onClick={onBack}>Back</button>
      <h2>Share This Computer</h2>
      {!code && <button className="primary-action" onClick={() => void startSharing()}>Start Sharing</button>}
      {code && <div className="code-box" aria-label="Temporary connection code">{code}</div>}
      {pendingApproval && (
        <div className="approval">
          <strong>Controller is requesting access.</strong>
          <div className="row">
            <button className="primary-action" onClick={() => void allowControl()}>Allow Control</button>
            <button className="danger-action" onClick={() => void rejectControl()}>Reject</button>
          </div>
        </div>
      )}
      <dl className="status-grid">
        <dt>Connection</dt><dd>{status}</dd>
        <dt>Permission</dt><dd>{permission}</dd>
      </dl>
      <button className="danger-action" onClick={() => void stopSharing("Stopped by host")}>Disconnect Now</button>
    </section>
  );
}

function ControlComputer({ onBack }: { onBack: () => void }) {
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
      onRemoteStream: (stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      },
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
      <button className="link-button" onClick={onBack}>Back</button>
      <h2>Control Another Computer</h2>
      {!session && (
        <form className="join-form" onSubmit={(ev) => { ev.preventDefault(); void connect(); }}>
          <input value={code} onChange={(ev) => setCode(ev.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="8-digit code" inputMode="numeric" />
          <button className="primary-action" disabled={code.length !== 8}>Connect</button>
        </form>
      )}
      <div className="remote-stage">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          tabIndex={0}
          onPointerMove={(ev) => sendPointer("mouse_move", ev)}
          onPointerDown={(ev) => sendPointer("mouse_down", ev)}
          onPointerUp={(ev) => sendPointer("mouse_up", ev)}
          onWheel={(ev) => session && peerRef.current?.sendInput(wheelInput(session.controllerToken, ev))}
          onKeyDown={(ev) => session && peerRef.current?.sendInput(keyInput("key_down", session.controllerToken, ev))}
          onKeyUp={(ev) => session && peerRef.current?.sendInput(keyInput("key_up", session.controllerToken, ev))}
        />
      </div>
      <dl className="status-grid">
        <dt>Connection</dt><dd>{status}</dd>
        <dt>Route</dt><dd>{relay}</dd>
        <dt>Latency</dt><dd>{latency == null ? "Unknown" : `${latency} ms`}</dd>
      </dl>
      <button className="danger-action" onClick={() => disconnect("Stopped by controller")}>Disconnect</button>
    </section>
  );
}
