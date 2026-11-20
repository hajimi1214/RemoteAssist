import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { AuthResult, Device, DirectPending, SignalingClient } from "./signaling";
import { HostPeer } from "./webrtc";
import type { SignalMessage } from "./webrtc";
import { InputEventGate } from "./inputEvents";
import { startNativeStream } from "./nativeCapture";
import { nativeDesktop } from "./platform";

type RunningSession = {
  pending: DirectPending;
  requestId: string;
  socket: WebSocket;
  peer?: HostPeer;
  capture?: { stop: () => void };
  cancelReady?: () => void;
  stopped: boolean;
};

/** Account/device authorization happens independently inside the native accept command. */
export function useDirectHost(auth: AuthResult | null, device: Device | null, signaling: SignalingClient) {
  const [state, setState] = useState({ active: false, name: "", error: "" });
  const latest = useRef(auth); latest.current = auth;
  const stopRef = useRef<() => void>(() => {});
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    setState({active:false,name:"",error:""});
    if (!nativeDesktop || !auth || !device || paused) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: RunningSession | undefined;
    const live = (session: RunningSession) => !disposed && !session.stopped && current === session;
    const stop = (session: RunningSession | undefined = current) => {
      if (!session || session.stopped) return;
      session.stopped = true;
      session.cancelReady?.(); session.cancelReady = undefined;
      session.peer?.close(); session.capture?.stop();
      session.socket.onclose = null; session.socket.onerror = null; session.socket.onmessage = null; session.socket.close();
      // An old asynchronous cleanup can revoke only its own native request.
      void invoke("clear_direct_capture", { requestId: session.requestId }).catch(() => {});
      void signaling.disconnect(session.pending.id, session.pending.hostToken).catch(() => {});
      if (current === session) {
        current = undefined;
        if (!disposed) setState(previous => ({ ...previous, active: false, name: "" }));
      }
    };
    stopRef.current = () => stop();
    const fail = (session: RunningSession, message: string) => {
      if (live(session)) setState(previous => ({ ...previous, error: message }));
      stop(session);
    };
    const begin = async (pending: DirectPending) => {
      if (disposed || current) return;
      const socket = new WebSocket(signaling.wsURL(pending.id, "host"));
      const session: RunningSession = { pending, requestId: crypto.randomUUID(), socket, stopped: false };
      current = session;
      setState({ active: true, name: pending.controllerDeviceName, error: "" });
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("device_handshake_timeout")), 12_000);
          const settle = (error?: Error) => {
            clearTimeout(timeout); session.cancelReady = undefined;
            if (error) reject(error); else resolve();
          };
          session.cancelReady = () => settle(new Error("device_cancelled"));
          socket.onopen = () => { if (live(session)) socket.send(JSON.stringify({ type: "authenticate", token: pending.hostToken })); };
          socket.onerror = () => settle(new Error("device_communication_failed"));
          socket.onclose = () => settle(new Error("device_disconnected"));
          socket.onmessage = event => {
            try {
              const message = JSON.parse(event.data) as SignalMessage;
              if (message.sessionId !== pending.id) return;
              if (message.type === "ready") settle();
              else if (["disconnect", "expired", "rejected"].includes(message.type)) settle(new Error("device_disconnected"));
            } catch { settle(new Error("invalid_device_message")); }
          };
        });
        if (!live(session) || !latest.current) return;
        const result = await invoke<{ controllerToken: string; expiresAt: string }>("accept_direct_capture", {
          serverUrl: signaling.serviceURL(), accessToken: latest.current.accessToken,
          deviceId: device.id, sessionId: pending.id, hostToken: pending.hostToken, requestId: session.requestId
        });
        if (!live(session)) { void invoke("clear_direct_capture", { requestId: session.requestId }).catch(() => {}); return; }
        const source = await startNativeStream(result.controllerToken, () => fail(session, "屏幕采集已中断，请重新连接。"));
        if (!live(session)) { source.stop(); return; }
        session.capture = source;
        const gate = new InputEventGate(result.controllerToken, () => live(session));
        const peer = new HostPeer(pending.id, pending.hostToken, socket, [], {
          onCaptureFrameRate: source.setFrameRate,
          onFailure: () => fail(session, "连接已中断，可重新进入设备。")
        }, { preference: "auto", loadIceServers: () => signaling.iceServers(latest.current!.accessToken) });
        session.peer = peer;
        socket.onclose = () => stop(session); socket.onerror = () => stop(session);
        socket.onmessage = event => {
          if (!live(session)) return;
          let message: SignalMessage;
          try { message = JSON.parse(event.data) as SignalMessage; } catch { stop(session); return; }
          if (message.sessionId !== pending.id) return;
          if (["disconnect", "expired", "rejected"].includes(message.type)) { stop(session); return; }
          void peer.handleSignal(message);
        };
        await peer.start(source.stream, gate);
      } catch {
        fail(session, "设备连接准备失败。请确认电脑桌面已解锁且新版服务在线。");
      }
    };
    const poll = async () => {
      try {
        if (!current && latest.current) {
          const pending = await signaling.incomingDevices(latest.current.accessToken, device.id);
          if (!disposed && !current && pending.length) void begin(pending[0]);
        }
      } catch { /* The native lease and session websocket remain fail-closed. */ }
      finally { if (!disposed) timer = setTimeout(() => void poll(), 2500); }
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); stop(); };
  }, [auth?.user.id, device?.id, paused, signaling]);
  return { ...state, paused, pause: () => { stopRef.current(); setPaused(true); }, resume: () => setPaused(false) };
}
