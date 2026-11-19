import { InputEventGate, RemoteInputEvent } from "./inputEvents";
import { IceServer } from "./signaling";

export type SignalType = "offer" | "answer" | "ice" | "ping" | "pong" | "disconnect";

export interface SignalMessage {
  type: SignalType;
  sessionId: string;
  sessionToken: string;
  ts: number;
  payload?: unknown;
}

export interface PeerCallbacks {
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStatus?: (status: string) => void;
  onRelayStatus?: (status: "P2P" | "TURN Relay" | "Unknown") => void;
  onLatency?: (ms: number) => void;
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
}

export class HostPeer {
  private pc?: RTCPeerConnection;
  private inputChannel?: RTCDataChannel;
  private signalQueue: Promise<void> = Promise.resolve();
  private readonly remoteIce = new RemoteIceQueue();

  constructor(
    private readonly sessionId: string,
    private readonly hostToken: string,
    private readonly ws: WebSocket,
    private readonly iceServers: IceServer[],
    private readonly callbacks: PeerCallbacks = {}
  ) {}

  async start(stream: MediaStream, inputGate: InputEventGate): Promise<void> {
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    stream.getTracks().forEach((track) => this.pc?.addTrack(track, stream));
    this.inputChannel = this.pc.createDataChannel("input", { ordered: true });
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
  }

  async handleSignal(msg: SignalMessage): Promise<void> {
    this.signalQueue = this.signalQueue.then(() => this.processSignal(msg)).catch(() => {
      this.callbacks.onConnectionStatus?.("signaling error");
    });
    return this.signalQueue;
  }

  private async processSignal(msg: SignalMessage): Promise<void> {
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
      void this.updateRelayStatus();
    };
  }

  private async updateRelayStatus(): Promise<void> {
    const stats = await this.pc?.getStats();
    if (!stats) return;
    stats.forEach((report) => {
      if (report.type === "candidate-pair" && report.state === "succeeded" && report.remoteCandidateId) {
        const remote = stats.get(report.remoteCandidateId);
        if (remote?.candidateType === "relay" || report.localCandidateType === "relay") {
          this.callbacks.onRelayStatus?.("TURN Relay");
        } else {
          this.callbacks.onRelayStatus?.("P2P");
        }
      }
    });
  }

  private send(type: SignalType, payload?: unknown): void {
    this.ws.send(JSON.stringify({ type, sessionId: this.sessionId, sessionToken: this.hostToken, ts: Date.now(), payload }));
  }
}

export class ControllerPeer {
  private pc?: RTCPeerConnection;
  private inputChannel?: RTCDataChannel;
  private pingTimer?: number;
  private lastPing = 0;
  private signalQueue: Promise<void> = Promise.resolve();
  private readonly remoteIce = new RemoteIceQueue();

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
    if (msg.type === "offer") {
      this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.installPeerHandlers();
      this.pc.ontrack = (ev) => this.callbacks.onRemoteStream?.(ev.streams[0]);
      this.pc.ondatachannel = (ev) => {
        this.inputChannel = ev.channel;
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
    if (this.inputChannel?.readyState !== "open") {
      throw new Error("input_channel_not_open");
    }
    this.inputChannel.send(JSON.stringify(event));
  }

  close(): void {
    if (this.pingTimer) window.clearInterval(this.pingTimer);
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
      void this.updateRelayStatus();
    };
  }

  private startLatencyProbe(): void {
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
    stats.forEach((report) => {
      if (report.type === "candidate-pair" && report.state === "succeeded" && report.remoteCandidateId) {
        const remote = stats.get(report.remoteCandidateId);
        if (remote?.candidateType === "relay" || report.localCandidateType === "relay") {
          this.callbacks.onRelayStatus?.("TURN Relay");
        } else {
          this.callbacks.onRelayStatus?.("P2P");
        }
      }
    });
  }

  private send(type: SignalType, payload?: unknown): void {
    this.ws.send(
      JSON.stringify({ type, sessionId: this.sessionId, sessionToken: this.controllerToken, ts: Date.now(), payload })
    );
  }
}
