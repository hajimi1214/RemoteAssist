import { InputEventGate, RemoteInputEvent } from "./inputEvents";
import type { IceServer } from "./signaling";
import { AdaptiveVideoPolicy, connectionRoute, connectionSample, VideoPreference, VideoQuality, videoEncoding } from "./connectionQuality";
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS, NEGOTIATION_TIMEOUT_MS, HeartbeatTracker, LatestPointer } from "./transportTiming";
import { VideoStatsSampler, VideoTelemetry } from "./videoTelemetry";

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
  onTelemetry?: (sample: VideoTelemetry) => void;
  onTextSupport?: (supported: boolean) => void;
  onFailure?: (reason: string) => void;
}
export interface PeerOptions {
  preference?: VideoPreference;
  // Refresh only at negotiation time, after any potentially long approval wait.
  loadIceServers?: () => Promise<IceServer[]>;
}
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_INPUT_BUFFER = 64 * 1024;
const MAX_POINTER_BUFFER = 8 * 1024;
const utf8 = new TextEncoder();

function parseMessage(data: unknown): Record<string, unknown> | undefined {
  if (typeof data !== "string" || data.length > MAX_MESSAGE_BYTES || utf8.encode(data).byteLength > MAX_MESSAGE_BYTES) return;
  try {
    const value = JSON.parse(data);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* Invalid peer input is ignored. */ }
}

class RemoteIceQueue {
  private pending: RTCIceCandidateInit[] = [];
  async accept(pc: RTCPeerConnection | undefined, candidate: RTCIceCandidateInit) {
    if (!pc?.remoteDescription) {
      if (this.pending.length >= 128) throw new Error("too_many_ice_candidates");
      this.pending.push(candidate);
    } else await pc.addIceCandidate(candidate);
  }
  async flush(pc: RTCPeerConnection) {
    const candidates=this.pending;this.pending=[];
    for (const candidate of candidates) await pc.addIceCandidate(candidate);
  }
  clear() { this.pending=[]; }
}

abstract class SessionPeer {
  protected pc?: RTCPeerConnection;
  protected inputChannel?: RTCDataChannel;
  protected pointerChannel?: RTCDataChannel;
  protected closed=false;
  protected readonly remoteIce=new RemoteIceQueue();
  protected readonly statsSampler=new VideoStatsSampler();
  private signals: Promise<void>=Promise.resolve();
  private queuedSignals=0;
  private negotiationTimer?: number;

  constructor(
    protected readonly sessionId: string,
    protected readonly sessionToken: string,
    protected readonly ws: WebSocket,
    protected readonly iceServers: IceServer[],
    protected readonly callbacks: PeerCallbacks = {},
    protected readonly options: PeerOptions = {}
  ) {}

  async handleSignal(msg: SignalMessage): Promise<void> {
    if(this.closed || msg.sessionId!==this.sessionId)return;
    if(["disconnect","rejected","expired"].includes(msg.type)){this.fail("session_ended");return;}
    if(!["offer","answer","ice"].includes(msg.type))return;
    if(++this.queuedSignals>128){this.queuedSignals--;this.fail("signaling_overload");return;}
    this.signals=this.signals.then(async()=>{if(!this.closed)await this.processSignal(msg);})
      .catch(()=>{if(!this.closed)this.fail("negotiation_failed");})
      .finally(()=>{this.queuedSignals--;});
    return this.signals;
  }
  protected abstract processSignal(msg: SignalMessage): Promise<void>;

  protected beginNegotiation() {
    if(this.negotiationTimer!=null)return;
    this.negotiationTimer=window.setTimeout(()=>this.fail("negotiation_timeout"),NEGOTIATION_TIMEOUT_MS);
  }
  protected installPeerHandlers() {
    if(!this.pc)return;
    this.pc.onicecandidate=(ev)=>{if(ev.candidate)this.sendSignal("ice",ev.candidate.toJSON());};
    this.pc.onconnectionstatechange=()=>{
      if(this.closed)return;
      const state=this.pc!.connectionState;
      if(state==="failed"||state==="disconnected"){this.fail("connection_lost");return;}
      // Reliable input-channel readiness is the usable-connection boundary.
      if(state!=="connected")this.callbacks.onConnectionStatus?.(state);
    };
  }
  protected inputOpened() {
    if(this.closed)return;
    window.clearTimeout(this.negotiationTimer);this.negotiationTimer=undefined;
    this.callbacks.onConnectionStatus?.("connected");
  }
  protected installInputFailureHandlers() {
    if(!this.inputChannel)return;
    this.inputChannel.onclose=()=>{if(!this.closed)this.fail("input_channel_closed");};
    this.inputChannel.onerror=()=>{if(!this.closed)this.fail("input_channel_failed");};
  }
  protected async freshIceServers(): Promise<IceServer[]> {
    return this.options.loadIceServers ? this.options.loadIceServers() : this.iceServers;
  }
  protected sendSignal(type: SignalType,payload?:unknown) {
    if(this.closed)return;
    if(this.ws.readyState!==WebSocket.OPEN){this.fail("signaling_unavailable");return;}
    try {
      if(this.ws.bufferedAmount>256*1024){this.fail("signaling_congested");return;}
      this.ws.send(JSON.stringify({type,sessionId:this.sessionId,sessionToken:this.sessionToken,ts:Date.now(),payload}));
    } catch { this.fail("signaling_unavailable"); }
  }
  protected sendReliable(value: unknown): boolean {
    if(this.closed||this.inputChannel?.readyState!=="open")return false;
    if(this.inputChannel.bufferedAmount>MAX_INPUT_BUFFER){this.fail("input_congested");return false;}
    try {this.inputChannel.send(JSON.stringify(value));return true;}catch{this.fail("input_channel_failed");return false;}
  }
  protected fail(reason: string) {
    if(this.closed)return;
    this.close();
    this.callbacks.onFailure?.(reason);
    this.callbacks.onConnectionStatus?.("failed");
  }
  close() {
    if(this.closed)return;
    this.closed=true;
    window.clearTimeout(this.negotiationTimer);
    this.remoteIce.clear();
    if(this.pc){this.pc.onconnectionstatechange=null;this.pc.onicecandidate=null;this.pc.ontrack=null;this.pc.ondatachannel=null;}
    for(const channel of [this.inputChannel,this.pointerChannel]){
      if(channel){channel.onopen=null;channel.onmessage=null;channel.onclose=null;channel.onerror=null;channel.onbufferedamountlow=null;channel.close();}
    }
    this.pc?.close();
  }
}

export class HostPeer extends SessionPeer {
  private videoSender?: RTCRtpSender;
  private videoTrack?: MediaStreamTrack;
  private qualityTimer?: number;
  private heartbeatTimer?: number;
  private lastHeartbeat=0;
  private preference: VideoPreference;
  private appliedProfile="";
  private readonly policy=new AdaptiveVideoPolicy();

  constructor(sessionId:string,hostToken:string,ws:WebSocket,iceServers:IceServer[],callbacks:PeerCallbacks={},options:PeerOptions={}){
    super(sessionId,hostToken,ws,iceServers,callbacks,options);this.preference=options.preference??"auto";
  }
  setPreference(preference: VideoPreference) {
    this.preference=preference;
    this.appliedProfile="";
    if(this.videoTrack)this.videoTrack.contentHint=preference==="motion"?"motion":"text";
  }
  async start(stream:MediaStream,gate:InputEventGate):Promise<void>{
    if(this.closed||this.pc)return;
    this.beginNegotiation();
    try {
      const servers=await this.freshIceServers();
      if(this.closed)return;
      if(!stream.getVideoTracks().some(track=>track.readyState==="live"))throw new Error("capture_ended");
      this.pc=new RTCPeerConnection({iceServers:servers,bundlePolicy:"max-bundle"});
      stream.getTracks().forEach(track=>{
        const sender=this.pc!.addTrack(track,stream);
        if(track.kind==="video"){this.videoSender=sender;this.videoTrack=track;track.contentHint=this.preference==="motion"?"motion":"text";}
      });
      this.inputChannel=this.pc.createDataChannel("input",{ordered:true});
      this.pointerChannel=this.pc.createDataChannel("pointer",{ordered:false,maxRetransmits:0});
      this.installInputFailureHandlers();
      this.inputChannel.onopen=()=>{
        this.inputOpened();if(this.closed)return;this.lastHeartbeat=performance.now();
        this.heartbeatTimer=window.setInterval(()=>{
          if(performance.now()-this.lastHeartbeat>=HEARTBEAT_TIMEOUT_MS)this.fail("heartbeat_timeout");
        },HEARTBEAT_INTERVAL_MS);
      };
      this.pointerChannel.onmessage=(ev)=>{
        const msg=parseMessage(ev.data);
        if(msg?.type==="mouse_move")void gate.accept(msg).catch(()=>undefined);
      };
      this.inputChannel.onmessage=(ev)=>{
        const msg=parseMessage(ev.data);if(!msg)return;
        void gate.accept(msg).then(()=>{
          if(this.closed)return;
          if(msg.type==="ping"){
            this.lastHeartbeat=performance.now();
            this.sendReliable({type:"pong",sessionToken:msg.sessionToken,ts:msg.ts,probeId:msg.probeId,textInputVersion:1});
          }
        }).catch(()=>{
          // A failed authenticated keepalive means the native authorization lease
          // cannot be maintained; do not leave a seemingly usable session running.
          if(msg.type==="ping"&&!this.closed)this.fail("input_authorization_lost");
        });
      };
      this.installPeerHandlers();
      const offer=await this.pc.createOffer();
      if(this.closed)return;
      await this.pc.setLocalDescription(offer);
      if(this.closed)return;
      this.sendSignal("offer",offer);
      this.startQualityMonitor();
    } catch {
      if(!this.closed)this.fail("negotiation_failed");
    }
  }
  protected async processSignal(msg:SignalMessage){
    if(msg.type==="answer"){
      if(!this.pc)return;
      await this.pc.setRemoteDescription(msg.payload as RTCSessionDescriptionInit);
      if(!this.closed)await this.remoteIce.flush(this.pc);
    }else if(msg.type==="ice"&&msg.payload){
      await this.remoteIce.accept(this.pc,msg.payload as RTCIceCandidateInit);
    }
  }
  override close(){
    if(this.qualityTimer!=null)window.clearTimeout(this.qualityTimer);
    if(this.heartbeatTimer!=null)window.clearInterval(this.heartbeatTimer);
    super.close();
  }
  private startQualityMonitor(){
    const sample=async()=>{
      if(this.closed||!this.pc||!this.videoSender)return;
      try {
        if(this.pc.connectionState==="connected"){
          const stats=await this.pc.getStats();if(this.closed)return;
          this.callbacks.onRelayStatus?.(connectionRoute(stats));
          const telemetry=this.statsSampler.sample(stats,"send");
          this.callbacks.onTelemetry?.(telemetry);
          const quality=this.policy.observe({...connectionSample(stats),sendQueueMs:telemetry.sendQueueMs});
          const key=quality+":"+this.preference;
          if(key!==this.appliedProfile){
            const parameters=this.videoSender.getParameters();
            if(parameters.encodings?.length){
              Object.assign(parameters.encodings[0],videoEncoding(quality,this.preference));
              parameters.degradationPreference=this.preference==="motion"?"maintain-framerate":"maintain-resolution";
              await this.videoSender.setParameters(parameters);
              if(this.closed)return;
              this.appliedProfile=key;this.callbacks.onQuality?.(quality);
            }else this.callbacks.onQuality?.("Browser managed");
          }
        }
      }catch{
        if(!this.closed)this.callbacks.onQuality?.("Browser managed");
      }finally{
        if(!this.closed)this.qualityTimer=window.setTimeout(()=>void sample(),3_000);
      }
    };
    void sample();
  }
}

export class ControllerPeer extends SessionPeer {
  private inputSequence=0;
  private pingTimer?:number;
  private telemetryTimer?:number;
  private heartbeat?:HeartbeatTracker;
  private readonly pointer=new LatestPointer<RemoteInputEvent>((event)=>this.deliverInput(event));

  protected async processSignal(msg:SignalMessage){
    if(msg.type==="offer"){
      if(this.pc)return;
      this.beginNegotiation();
      const servers=await this.freshIceServers();
      if(this.closed)return;
      this.pc=new RTCPeerConnection({iceServers:servers,bundlePolicy:"max-bundle"});
      this.installPeerHandlers();
      this.pc.ontrack=(ev)=>this.callbacks.onRemoteStream?.(ev.streams[0]??new MediaStream([ev.track]));
      this.pc.ondatachannel=(ev)=>{
        if(ev.channel.label==="pointer"&&!this.pointerChannel){this.pointerChannel=ev.channel;this.watchPointerBuffer(ev.channel);return;}
        if(ev.channel.label!=="input"||this.inputChannel){ev.channel.close();return;}
        this.inputChannel=ev.channel;this.installInputFailureHandlers();this.watchPointerBuffer(ev.channel);
        this.inputChannel.onmessage=(message)=>{
          const parsed=parseMessage(message.data);
          if(parsed?.type!=="pong"||parsed.sessionToken!==this.sessionToken||!this.heartbeat)return;
          this.callbacks.onTextSupport?.(parsed.textInputVersion===1);
          const rtt=this.heartbeat.acknowledge(parsed.probeId,performance.now());
          if(rtt!=null)this.callbacks.onLatency?.(rtt);
        };
        const open=()=>{this.inputOpened();if(!this.closed)this.startLatencyProbe();};
        this.inputChannel.onopen=open;
        if(this.inputChannel.readyState==="open")open();
      };
      await this.pc.setRemoteDescription(msg.payload as RTCSessionDescriptionInit);
      if(this.closed)return;
      await this.remoteIce.flush(this.pc);
      const answer=await this.pc.createAnswer();
      if(this.closed)return;
      await this.pc.setLocalDescription(answer);
      if(this.closed)return;
      this.sendSignal("answer",answer);
      this.startTelemetry();
    }else if(msg.type==="ice"&&msg.payload){
      await this.remoteIce.accept(this.pc,msg.payload as RTCIceCandidateInit);
    }
  }
  sendInput(event:RemoteInputEvent){
    if(this.closed||this.inputChannel?.readyState!=="open")return false;
    if(event.type==="mouse_move"){this.pointer.push(event);return true;}
    if(event.type==="mouse_down"||event.type==="mouse_up"||event.type==="release_all"||event.type==="disconnect"||event.type==="text_input")this.pointer.discard();
    return this.deliverInput(event);
  }
  private watchPointerBuffer(channel:RTCDataChannel){
    channel.bufferedAmountLowThreshold=MAX_POINTER_BUFFER/2;
    channel.onbufferedamountlow=()=>{if(!this.closed)this.pointer.flush();};
  }
  private deliverInput(event:RemoteInputEvent):boolean{
    if(this.closed||this.inputChannel?.readyState!=="open")return false;
    const pointerChannel=event.type==="mouse_move"&&this.pointerChannel?.readyState==="open"?this.pointerChannel:undefined;
    if(pointerChannel){
      if(pointerChannel.bufferedAmount>MAX_POINTER_BUFFER)return false;
      try{pointerChannel.send(JSON.stringify({...event,sequence:++this.inputSequence}));return true;}
      catch{this.fail("input_channel_failed");return false;}
    }else{
      if(event.type==="mouse_move"&&this.inputChannel.bufferedAmount>MAX_POINTER_BUFFER)return false;
      return this.sendReliable({...event,sequence:++this.inputSequence});
    }
  }
  override close(){
    this.pointer.close();
    if(this.pingTimer!=null)window.clearInterval(this.pingTimer);
    if(this.telemetryTimer!=null)window.clearTimeout(this.telemetryTimer);
    super.close();
  }
  private startLatencyProbe(){
    if(this.pingTimer!=null)window.clearInterval(this.pingTimer);
    this.heartbeat=new HeartbeatTracker(performance.now());
    const probe=()=>{
      if(this.closed)return;
      const now=performance.now();
      if(this.heartbeat!.expired(now)){this.fail("heartbeat_timeout");return;}
      this.sendReliable({type:"ping",sessionToken:this.sessionToken,ts:Date.now(),probeId:this.heartbeat!.probe(now)});
    };
    probe();
    this.pingTimer=window.setInterval(probe,HEARTBEAT_INTERVAL_MS);
  }
  private startTelemetry(){
    const sample=async()=>{
      if(this.closed||!this.pc)return;
      try{
        if(this.pc.connectionState==="connected"){
          const stats=await this.pc.getStats();if(this.closed)return;
          const telemetry=this.statsSampler.sample(stats,"receive");
          this.callbacks.onRelayStatus?.(telemetry.route);this.callbacks.onTelemetry?.(telemetry);
        }
      }catch{/* Statistics are best effort and cannot grant or resume input. */}
      finally{if(!this.closed)this.telemetryTimer=window.setTimeout(()=>void sample(),2_000);}
    };
    void sample();
  }
}
