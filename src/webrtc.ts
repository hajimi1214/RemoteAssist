import { InputEventGate, RemoteInputEvent } from "./inputEvents";
import { IceServer } from "./signaling";
import { AdaptiveVideoPolicy, connectionRoute, connectionSample, VideoQuality, videoProfiles } from "./connectionQuality";

export type SignalType = "offer" | "answer" | "ice" | "ping" | "pong" | "disconnect" | "rejected" | "expired" | "ready";

export interface SignalMessage {
  type: SignalType;
  sessionId: string;
  sessionToken?: string;
  ts: number;
  payload?: unknown;
}

export interface PeerCallbacks {
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStatus?: (status: string) => void;
  onRelayStatus?: (status: "P2P" | "TURN Relay" | "Unknown") => void;
  onLatency?: (ms: number) => void;
  onQuality?: (quality: VideoQuality | "Browser managed") => void;
}

const maxDataChannelMessageBytes = 16 * 1024;
const utf8Encoder = new TextEncoder();

type ParsedDataChannelMessage =
  | { ok: true; value: unknown }
  | { ok: false };

function parseDataChannelMessage(data: unknown): ParsedDataChannelMessage {
  if (typeof data !== "string" || data.length > maxDataChannelMessageBytes) return { ok: false };
  if (utf8Encoder.encode(data).byteLength > maxDataChannelMessageBytes) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(data) as unknown };
  } catch {
    return { ok: false };
  }
}

function isPingMessage(value: unknown): value is { type: "ping"; sessionToken: string; ts: number } {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message.type === "ping" && typeof message.sessionToken === "string" && Number.isFinite(message.ts);
}

class RemoteIceQueue {
  private pending: RTCIceCandidateInit[] = [];

  async addOrQueue(pc: RTCPeerConnection | undefined, candidate: RTCIceCandidateInit): Promise<void> {
    if (!pc?.remoteDescription) {
      if (this.pending.length >= 128) throw new Error("too_many_ice_candidates");
      this.pending.push(candidate);
      return;
    }
    await pc.addIceCandidate(candidate);
  }

  async flush(pc: RTCPeerConnection): Promise<void> {
    const pending = this.pending;
    this.pending = [];
    for (const candidate of pending) {
      await pc.addIceCandidate(candidate);
    }
  }

  clear(): void { this.pending = []; }
}

export class HostPeer {
  private pc?: RTCPeerConnection;
  private inputChannel?: RTCDataChannel;
  private pointerChannel?: RTCDataChannel;
  private signalQueue: Promise<void> = Promise.resolve();
  private readonly remoteIce = new RemoteIceQueue();
  private closed = false;
  private qualityTimer?: number;
  private videoSender?: RTCRtpSender;
  private readonly qualityPolicy = new AdaptiveVideoPolicy();

  constructor(
    private readonly sessionId: string,
    private readonly hostToken: string,
    private readonly ws: WebSocket,
    private readonly iceServers: IceServer[],
    private readonly callbacks: PeerCallbacks = {}
  ) {}

  async start(stream: MediaStream, inputGate: InputEventGate): Promise<void> {
    if (this.closed) return;
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    stream.getTracks().forEach((track) => {
      if (track.kind === "video") track.contentHint = "text";
      const sender = this.pc!.addTrack(track, stream);
      if (track.kind === "video") this.videoSender = sender;
    });
    this.inputChannel = this.pc.createDataChannel("input", { ordered: true });
    const failInput = () => { if (!this.closed) { this.close(); this.callbacks.onConnectionStatus?.("failed"); } };
    this.inputChannel.onclose = failInput;
    this.inputChannel.onerror = failInput;
    this.pointerChannel = this.pc.createDataChannel("pointer", { ordered: false, maxRetransmits: 0 });
    this.pointerChannel.onmessage = (ev) => {
      const parsed = parseDataChannelMessage(ev.data);
      if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || (parsed.value as Record<string, unknown>).type !== "mouse_move") return;
      void inputGate.accept(parsed.value).catch(() => undefined);
    };
    const channel = this.inputChannel;
    this.inputChannel.onmessage = (ev) => {
      const parsed = parseDataChannelMessage(ev.data);
      if (!parsed.ok) return;
      void inputGate.accept(parsed.value).then(() => {
        if (isPingMessage(parsed.value) && channel.readyState === "open") {
          channel.send(JSON.stringify({ type: "pong", sessionToken: parsed.value.sessionToken, ts: parsed.value.ts }));
        }
      }).catch(() => undefined);
    };
    this.installPeerHandlers();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.send("offer", offer);
    this.startQualityMonitor();
  }

  async handleSignal(msg: SignalMessage): Promise<void> {
    this.signalQueue = this.signalQueue.then(() => this.processSignal(msg)).catch(() => {
      this.callbacks.onConnectionStatus?.("signaling error");
    });
    return this.signalQueue;
  }

  private async processSignal(msg: SignalMessage): Promise<void> {
    if (this.closed) return;
    if (msg.type === "answer") {
      if (!this.pc) return;
      await this.pc.setRemoteDescription(msg.payload as RTCSessionDescriptionInit);
      await this.remoteIce.flush(this.pc);
    }
    if (msg.type === "ice" && msg.payload) {
      await this.remoteIce.addOrQueue(this.pc, msg.payload as RTCIceCandidateInit);
    }
  }

  close(): void {
    this.closed = true;
    if (this.qualityTimer != null) window.clearTimeout(this.qualityTimer);
    this.remoteIce.clear();
    if (this.pc) { this.pc.onconnectionstatechange = null; this.pc.onicecandidate = null; }
    if (this.inputChannel) { this.inputChannel.onmessage = null; this.inputChannel.onclose = null; this.inputChannel.onerror = null; }
    if (this.pointerChannel) this.pointerChannel.onmessage = null;
    this.pointerChannel?.close();
    this.inputChannel?.close();
    this.pc?.close();
  }

  private installPeerHandlers(): void {
    if (!this.pc) return;
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) this.send("ice", ev.candidate.toJSON());
    };
    this.pc.onconnectionstatechange = () => {
      this.callbacks.onConnectionStatus?.(this.pc?.connectionState ?? "unknown");
      void this.updateRelayStatus().catch(() => undefined);
    };
  }

  private async updateRelayStatus(): Promise<void> {
    const stats = await this.pc?.getStats();
    if (!stats) return;
    this.callbacks.onRelayStatus?.(connectionRoute(stats));
  }

  private startQualityMonitor(): void {
    let applied: VideoQuality | undefined;
    const sample = async () => {
      if (this.closed || !this.pc || !this.videoSender) return;
      try {
        if (this.pc.connectionState === "connected") {
          const stats = await this.pc.getStats();
          if (this.closed) return;
          const desired = this.qualityPolicy.observe(connectionSample(stats));
          if (desired !== applied) {
            const parameters = this.videoSender.getParameters();
            if (parameters.encodings?.length) {
              Object.assign(parameters.encodings[0], videoProfiles[desired]);
              parameters.degradationPreference = "maintain-resolution";
              await this.videoSender.setParameters(parameters);
              if (this.closed) return;
              applied = desired;
              this.callbacks.onQuality?.(desired);
            }
          }
          this.callbacks.onRelayStatus?.(connectionRoute(stats));
        }
      } catch {
        if (!this.closed) this.callbacks.onQuality?.("Browser managed");
      } finally {
        if (!this.closed) this.qualityTimer = window.setTimeout(() => { void sample(); }, 3_000);
      }
    };
    void sample();
  }

  private send(type: SignalType, payload?: unknown): void {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, sessionId: this.sessionId, sessionToken: this.hostToken, ts: Date.now(), payload }));
  }
}

export class ControllerPeer {
  private pc?: RTCPeerConnection;
  private inputChannel?: RTCDataChannel;
  private pointerChannel?: RTCDataChannel;
  private inputSequence = 0;
  private pingTimer?: number;
  private lastPing = 0;
  private lastPointerMove = 0;
  private signalQueue: Promise<void> = Promise.resolve();
  private readonly remoteIce = new RemoteIceQueue();
  private closed = false;

  constructor(
    private readonly sessionId: string,
    private readonly controllerToken: string,
    private readonly ws: WebSocket,
    private readonly iceServers: IceServer[],
    private readonly callbacks: PeerCallbacks = {}
  ) {}

  async handleSignal(msg: SignalMessage): Promise<void> {
    this.signalQueue = this.signalQueue.then(() => this.processSignal(msg)).catch(() => {
      this.callbacks.onConnectionStatus?.("signaling error");
    });
    return this.signalQueue;
  }

  private async processSignal(msg: SignalMessage): Promise<void> {
    if (this.closed) return;
    if (msg.type === "offer") {
      if (this.pc) return; // This protocol permits one host-approved negotiation per session.
      this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.installPeerHandlers();
      this.pc.ontrack = (ev) => this.callbacks.onRemoteStream?.(ev.streams[0]);
      this.pc.ondatachannel = (ev) => {
        if (ev.channel.label === "pointer" && !this.pointerChannel) { this.pointerChannel = ev.channel; return; }
        if (ev.channel.label !== "input" || this.inputChannel) { ev.channel.close(); return; }
        this.inputChannel = ev.channel;
        const failInput = () => { if (!this.closed) { this.close(); this.callbacks.onConnectionStatus?.("failed"); } };
        this.inputChannel.onclose = failInput;
        this.inputChannel.onerror = failInput;
        this.startLatencyProbe();
      };
      await this.pc.setRemoteDescription(msg.payload as RTCSessionDescriptionInit);
      await this.remoteIce.flush(this.pc);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.send("answer", answer);
      return;
    }
    if (msg.type === "ice" && msg.payload) {
      await this.remoteIce.addOrQueue(this.pc, msg.payload as RTCIceCandidateInit);
    }
  }

  sendInput(event: RemoteInputEvent): void {
    if (this.closed || this.inputChannel?.readyState !== "open") return;
    if (event.type === "mouse_move") {
      const now = Date.now();
      if (now - this.lastPointerMove < 20) return;
      this.lastPointerMove = now;
    }
    const channel = event.type === "mouse_move" && this.pointerChannel?.readyState === "open" ? this.pointerChannel : this.inputChannel;
    if (channel.bufferedAmount > (event.type === "mouse_move" ? 8 * 1024 : 64 * 1024)) {
      if (event.type === "mouse_move") return;
      this.close();
      this.callbacks.onConnectionStatus?.("failed");
      return;
    }
    channel.send(JSON.stringify({ ...event, sequence: ++this.inputSequence }));
  }

  close(): void {
    this.closed = true;
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.remoteIce.clear();
    if (this.pc) { this.pc.onconnectionstatechange = null; this.pc.onicecandidate = null; this.pc.ontrack = null; this.pc.ondatachannel = null; }
    if (this.inputChannel) { this.inputChannel.onmessage = null; this.inputChannel.onclose = null; this.inputChannel.onerror = null; }
    this.pointerChannel?.close();
    this.inputChannel?.close();
    this.pc?.close();
  }

  private installPeerHandlers(): void {
    if (!this.pc) return;
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) this.send("ice", ev.candidate.toJSON());
    };
    this.pc.onconnectionstatechange = () => {
      this.callbacks.onConnectionStatus?.(this.pc?.connectionState ?? "unknown");
      void this.updateRelayStatus().catch(() => undefined);
    };
  }

  private startLatencyProbe(): void {
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => {
      if (this.inputChannel?.readyState !== "open") return;
      this.lastPing = Date.now();
      this.inputChannel.send(JSON.stringify({ type: "ping", sessionToken: this.controllerToken, ts: this.lastPing }));
    }, 2000);
    this.inputChannel!.onmessage = (ev) => {
      const parsed = parseDataChannelMessage(ev.data);
      if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") return;
      const msg = parsed.value as Record<string, unknown>;
      if (msg.type === "pong" && msg.sessionToken === this.controllerToken && msg.ts === this.lastPing && this.lastPing > 0) {
        this.callbacks.onLatency?.(Date.now() - this.lastPing);
        this.lastPing = 0;
      }
    };
  }

  private async updateRelayStatus(): Promise<void> {
    const stats = await this.pc?.getStats();
    if (!stats) return;
    this.callbacks.onRelayStatus?.(connectionRoute(stats));
  }

  private send(type: SignalType, payload?: unknown): void {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({ type, sessionId: this.sessionId, sessionToken: this.controllerToken, ts: Date.now(), payload })
    );
  }
}
