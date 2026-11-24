import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { AuthResult, Device, SignalingClient } from "./signaling";
import { HostPeer, type SignalMessage } from "./webrtc";
import { InputEventGate } from "./inputEvents";
import { startNativeStream } from "./nativeCapture";
import type { CaptureTimingSummary } from "./captureTiming";
import { nativeDesktop } from "./platform";
import { createSessionRecorder } from "./sessionJournal";
import type { SessionSummary } from "./sessionJournal";

type CodeSession = { id: string; code: string; hostToken: string; expiresAt: string };
type RunningAssist = {
  code: CodeSession;
  requestId: string;
  socket: WebSocket;
  peer?: HostPeer;
  capture?: { stop: () => void };
  stopped: boolean;
  activating: boolean;
  recorder?: ReturnType<typeof createSessionRecorder>;
};

export function useCodeAssistHost(
  auth: AuthResult,
  device: Device,
  signaling: SignalingClient,
  onActivity: (active: boolean) => void,
  onSharing: (active: boolean) => void,
  onRecord: (record: SessionSummary) => void
) {
  const latestAuth = useRef(auth);
  latestAuth.current = auth;
  const mounted = useRef(true);
  const running = useRef<RunningAssist | null>(null);
  const [code, setCode] = useState<CodeSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [controllerName, setControllerName] = useState("");
  const [error, setError] = useState("");

  function stop(reason = "Stopped by host") {
    const current = running.current;
    if (!current || current.stopped) return;
    current.stopped = true;
    current.recorder?.finish(reason);
    current.peer?.close();
    current.capture?.stop();
    current.socket.onclose = null;
    current.socket.onerror = null;
    current.socket.onmessage = null;
    current.socket.close();
    void invoke("clear_direct_capture", { requestId: current.requestId }).catch(() => undefined);
    void signaling.disconnect(current.code.id, current.code.hostToken).catch(() => undefined);
    running.current = null;
    if (mounted.current) {
      setCode(null);
      setControllerName("");
      setBusy(false);
    }
    onSharing(false);
    onActivity(false);
  }

  async function activate(current: RunningAssist) {
    if (current.activating || current.stopped || running.current !== current) return;
    current.activating = true;
    try {
      const accepted = await invoke<{ controllerToken: string; expiresAt: string }>("accept_code_capture", {
        serverUrl: signaling.serviceURL(), sessionId: current.code.id,
        hostToken: current.code.hostToken, requestId: current.requestId
      });
      if (current.stopped || running.current !== current) {
        void invoke("clear_direct_capture", { requestId: current.requestId }).catch(() => undefined);
        return;
      }
      const capture = await startNativeStream(accepted.controllerToken, () => stop("Capture stopped"), (summary: CaptureTimingSummary) => current.peer?.setCaptureTiming(summary));
      if (current.stopped || running.current !== current) {
        capture.stop();
        return;
      }
      current.capture = capture;
      const gate = new InputEventGate(accepted.controllerToken, () => !current.stopped && running.current === current);
      const peer = new HostPeer(current.code.id, current.code.hostToken, current.socket, [], {
        onCaptureFrameRate: capture.setFrameRate,
        onConnectionStatus: status => {
          if (status === "connected") {
            current.recorder?.connected();
            setControllerName("协助者已连接，本码已使用");
            onActivity(true);
          }
        },
        onFailure: () => stop("Connection lost")
      }, { gameInput: true, loadIceServers: () => signaling.iceServers(latestAuth.current.accessToken) });
      current.peer = peer;
      await peer.start(capture.stream, gate);
      if (mounted.current && !current.stopped && running.current === current) setBusy(false);
    } catch {
      if (running.current === current && !current.stopped) {
        setError("操控码连接准备失败，请重新生成操控码后再试。");
        stop("Connection failed");
      }
    }
  }

  async function start() {
    if (!nativeDesktop || running.current || busy) return;
    setBusy(true);
    setError("");
    try {
      const created = await signaling.createCodeSession(latestAuth.current.accessToken);
      if (!mounted.current) {
        await signaling.disconnect(created.id, created.hostToken).catch(() => undefined);
        return;
      }
      const socket = new WebSocket(signaling.wsURL(created.id, "host"));
      const current: RunningAssist = {
        code: created, requestId: crypto.randomUUID(), socket,
        stopped: false, activating: false,
        recorder: createSessionRecorder("share", onRecord)
      };
      running.current = current;
      setCode(created);
      onSharing(true);
      socket.onopen = () => {
        if (running.current === current && !current.stopped) socket.send(JSON.stringify({ type: "authenticate", token: created.hostToken }));
      };
      socket.onmessage = event => {
        let message: SignalMessage;
        try { message = JSON.parse(event.data) as SignalMessage; } catch { stop("Invalid signaling message"); return; }
        if (message.sessionId !== created.id || current.stopped) return;
        if (message.type === "ping") {
          setControllerName("协助者正在连接");
          void activate(current);
        } else if (["disconnect", "expired", "rejected"].includes(message.type)) {
          stop(message.type === "expired" ? "Session expired" : "Stopped by controller");
        }
      };
      socket.onerror = () => {
        if (running.current === current) {
          setError("信令连接失败，请检查服务地址和网络。");
          stop("Connection failed");
        }
      };
      socket.onclose = () => { if (running.current === current) stop("Connection lost"); };
      setBusy(false);
    } catch {
      if (mounted.current) {
        setBusy(false);
        setError("无法生成操控码，请检查服务是否在线并重新登录。");
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop("Closed"); };
  }, []);
  return { code, busy, controllerName, error, start, stop };
}
