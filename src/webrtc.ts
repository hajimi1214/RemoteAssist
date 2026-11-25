import { InputEventGate } from "./inputEvents.ts";
import type { RemoteInputEvent } from "./inputEvents.ts";
import type { IceServer } from "./signaling.ts";
import { AdaptiveVideoPolicy, connectionRoute, connectionSample } from "./connectionQuality.ts";
import type { VideoPreference, VideoQuality } from "./connectionQuality.ts";
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS, NEGOTIATION_TIMEOUT_MS, POINTER_INTERVAL_MS, HeartbeatTracker, LatestPointer } from "./transportTiming.ts";
import { VideoStatsSampler } from "./videoTelemetry.ts";
import type { VideoTelemetry } from "./videoTelemetry.ts";
import { compatibleQualityMode, isQualityMode, sessionEncoding } from "./qualityMode.ts";
import type { QualityMode } from "./qualityMode.ts";
import { clampGameDelta, validGameDelta } from "./gameInput.ts";
import { receiveJitterBufferTarget } from "./receiveBuffer.ts";
import { parseCaptureTiming } from "./captureTiming.ts";
import type { CaptureTimingSummary } from "./captureTiming.ts";

function gameMouse(message: {type?: unknown; payload?: unknown}): boolean {
  return message.type === "mouse_relative" || ((message.type === "mouse_down" || message.type === "mouse_up") &&
    (message.payload as Record<string, unknown> | undefined)?.relative === true);
}

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
  onCaptureFrameRate?: (fps: number) => void;
  onTelemetry?: (sample: VideoTelemetry) => void;
  onTextSupport?: (supported: boolean) => void;
  onGameSupport?: (supported: boolean) => void;
  onInputStatus?: (status: { reason: "limited" | "rejected"; rejected: number }) => void;
  onQualityControl?: (status: { supported: boolean; mode: QualityMode; applied?: boolean }) => void;
  onFailure?: (reason: string) => void;
}
export interface PeerOptions {
  preference?: VideoPreference;
  qualityMode?: QualityMode;
  gameInput?: boolean;
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
  private lastInputWarning=-Infinity;
  private rejectedInputs=0;
  private qualityMode:QualityMode="auto";
  private captureTiming?:CaptureTimingSummary;
  private captureTimingAt=0;

  constructor(sessionId:string,hostToken:string,ws:WebSocket,iceServers:IceServer[],callbacks:PeerCallbacks={},options:PeerOptions={}){
    super(sessionId,hostToken,ws,iceServers,callbacks,options);this.preference=options.preference??"auto";this.qualityMode=options.qualityMode??"auto";
  }
  setPreference(preference: VideoPreference) {
    this.preference=preference;
    this.appliedProfile="";
    if(this.videoTrack)this.videoTrack.contentHint=preference==="motion"?"motion":preference==="text"?"text":"detail";
    void this.applyVideoProfile();
  }
  setCaptureTiming(summary: CaptureTimingSummary) {
    this.captureTiming=summary;
    this.captureTimingAt=performance.now();
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
        if(track.kind==="video"){
          this.videoTrack=track;track.contentHint=this.preference==="motion"?"motion":this.preference==="text"?"text":"detail";
          // Seed encoding ceilings in the first offer, not several seconds after media starts.
          this.videoSender=this.pc!.addTransceiver(track,{direction:"sendonly",streams:[stream],sendEncodings:[sessionEncoding(this.qualityMode,this.policy.current,track.getSettings(),this.preference)]}).sender;
        } else this.pc!.addTrack(track,stream);
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
        if(msg?.type==="mouse_move" || (this.options.gameInput && msg?.type==="mouse_relative"))void gate.accept(msg).catch(error=>this.reportInputRejection(error));
      };
      this.inputChannel.onmessage=(ev)=>{
        const msg=parseMessage(ev.data);if(!msg)return;
        if(gameMouse(msg)&&!this.options.gameInput)return;
        // Relative motion uses the unordered pointer channel; only reliable
        // mouse button edges are handled on this channel.
        if(msg.type==="mouse_relative")return;
        void gate.accept(msg).then(()=>{
          if(this.closed)return;
          if(msg.type==="quality_mode"){
            const mode=(msg.payload as Record<string,unknown>)?.mode;
            if(isQualityMode(mode) && (mode!=="game" || this.options.gameInput)){
              this.qualityMode=mode;this.appliedProfile="";
              if(this.videoTrack)this.videoTrack.contentHint=mode==="smooth"||mode==="game"?"motion":"detail";
              void this.applyVideoProfile().then(applied=>{if(!this.closed)this.sendReliable({type:"quality_mode_status",sessionId:this.sessionId,mode:this.qualityMode,applied});});
            }
            return;
          }
          if(msg.type==="ping"){
            this.lastHeartbeat=performance.now();
            const captureTiming=performance.now()-this.captureTimingAt<=5_000?this.captureTiming:undefined;
            this.sendReliable({type:"pong",sessionToken:msg.sessionToken,ts:msg.ts,probeId:msg.probeId,textInputVersion:1,gameInputVersion:this.options.gameInput?1:undefined,qualityControlVersion:1,qualityMode:this.qualityMode,qualityProfileApplied:!!this.appliedProfile,captureTiming});
          }
        }).catch(error=>{
          // A failed authenticated keepalive means the native authorization lease
          // cannot be maintained; do not leave a seemingly usable session running.
          if(msg.type==="ping"&&!this.closed)this.fail("input_authorization_lost");
          else this.reportInputRejection(error);
        });
      };
      this.installPeerHandlers();
      const offer=await this.pc.createOffer();
      if(this.closed)return;
      await this.pc.setLocalDescription(offer);
      if(this.closed)return;
      await this.applyVideoProfile();
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
      if(!this.closed){await this.remoteIce.flush(this.pc);await this.applyVideoProfile();}
    }else if(msg.type==="ice"&&msg.payload){
      await this.remoteIce.accept(this.pc,msg.payload as RTCIceCandidateInit);
    }
  }
  override close(){
    if(this.qualityTimer!=null)window.clearTimeout(this.qualityTimer);
    if(this.heartbeatTimer!=null)window.clearInterval(this.heartbeatTimer);
    super.close();
  }
  private reportInputRejection(error:unknown){
    if(this.closed)return;
    const reason=typeof error==="string"?error:error instanceof Error?error.message:"";
    // Delayed unordered motion is expected at sequence barriers, not an input failure.
    if(reason==="stale_pointer_event")return;
    if(["input_not_authorized","input_authorization_lost","invalid_session_token","send_input_failed"].includes(reason)){this.fail(reason==="send_input_failed"?"input_delivery_failed":"input_authorization_lost");return;}
    this.rejectedInputs++;
    if(performance.now()-this.lastInputWarning<1000)return;
    this.lastInputWarning=performance.now();
    const status={reason:reason==="input_rate_limited"?"limited" as const:"rejected" as const,rejected:this.rejectedInputs};
    this.callbacks.onInputStatus?.(status);
    // No input payload, key, coordinate, token value, or native exception text is reported.
    this.sendReliable({type:"input_status",sessionId:this.sessionId,...status});
  }
  private applyingProfile?:Promise<boolean>;
  private profileDirty=false;
  private applyVideoProfile():Promise<boolean>{
    this.profileDirty=true;
    if(this.applyingProfile)return this.applyingProfile;
    const drain=async()=>{
      let applied=false;
      try {
        while(this.profileDirty&&!this.closed){this.profileDirty=false;applied=await this.updateVideoProfile();}
        return applied&&!this.closed;
      } finally {this.applyingProfile=undefined;}
    };
    this.applyingProfile=drain();
    return this.applyingProfile;
  }
  private async updateVideoProfile():Promise<boolean>{
    if(this.closed||!this.videoSender||!this.videoTrack)return false;
    const quality=this.policy.current;
    const settings=this.videoTrack.getSettings();
    const key=[quality,this.preference,this.qualityMode,settings.width,settings.height].join(":");
    if(key===this.appliedProfile)return true;
    try{
      const parameters=this.videoSender.getParameters();
      if(!parameters.encodings?.length){this.appliedProfile="";this.callbacks.onQuality?.("Browser managed");return false;}
      const encoding=sessionEncoding(this.qualityMode,quality,settings,this.preference);
      Object.assign(parameters.encodings[0],encoding);
      parameters.degradationPreference=this.qualityMode==="smooth"||this.qualityMode==="game"||this.preference==="motion"?"maintain-framerate":"maintain-resolution";
      await this.videoSender.setParameters(parameters);
      if(this.closed)return false;
      this.callbacks.onCaptureFrameRate?.(encoding.maxFramerate);
      this.appliedProfile=key;this.callbacks.onQuality?.(quality);return true;
    }catch{this.appliedProfile="";if(!this.closed)this.callbacks.onQuality?.("Browser managed");return false;}
  }
  private startQualityMonitor(){
    const sample=async()=>{
      if(this.closed||!this.pc||!this.videoSender)return;
      try {
        if(this.pc.connectionState==="connected"){
          const stats=await this.pc.getStats();if(this.closed)return;
          this.callbacks.onRelayStatus?.(connectionRoute(stats));
          const telemetry=this.statsSampler.sample(stats,"send");
          const target=sessionEncoding(this.qualityMode,this.policy.current,this.videoTrack?.getSettings(),this.preference);
          telemetry.qualityMode=this.qualityMode;
          telemetry.targetFps=target.maxFramerate;telemetry.targetBitrateKbps=Math.round(target.maxBitrate/1000);
          this.callbacks.onTelemetry?.(telemetry);
          this.policy.observe({...connectionSample(stats),sendQueueMs:telemetry.sendQueueMs,encodeMs:telemetry.encodeMs});
          await this.applyVideoProfile();
        }
      }catch{
        if(!this.closed)this.callbacks.onQuality?.("Browser managed");
      }finally{
        if(!this.closed)this.qualityTimer=window.setTimeout(()=>void sample(),1_500);
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
  private readonly relativePointer=new LatestPointer<RemoteInputEvent>(
    event=>this.deliverInput(event), POINTER_INTERVAL_MS, undefined, undefined, undefined,
    (older, newer)=>({...newer,payload:{
      dx:clampGameDelta(Number(older.payload?.dx)+Number(newer.payload?.dx)),
      dy:clampGameDelta(Number(older.payload?.dy)+Number(newer.payload?.dy)),
    }}), 45
  );
  private gameSupported=false;
  private videoReceiver?: RTCRtpReceiver;
  private latestReceiveTelemetry?: VideoTelemetry;
  private latestCaptureTiming?: CaptureTimingSummary;
  private confirmedGameVideo=false;
  private desiredQuality?:QualityMode;
  private qualitySupported=false;
  setQualityMode(mode:QualityMode):boolean {
    if(!isQualityMode(mode))return false;
    this.desiredQuality=mode;
    if(!this.qualitySupported)return false;
    return this.sendReliable({type:"quality_mode",sessionToken:this.sessionToken,ts:Date.now(),payload:{mode:mode==="game"&&!this.gameSupported?"auto":mode}});
  }

  private updateReceiveBuffer(game: boolean, telemetry?: VideoTelemetry) {
    const receiver=this.videoReceiver;
    if(telemetry)this.latestReceiveTelemetry=telemetry;
    if(!receiver || !("jitterBufferTarget" in receiver)) return;
    const sample=telemetry??this.latestReceiveTelemetry;
    // This is an optional hint, not measured latency. Give uneven/lossy paths more headroom.
    const target=receiveJitterBufferTarget(game,sample);
    try { if(receiver.jitterBufferTarget!==target)receiver.jitterBufferTarget=target; } catch {/* Older WebViews may reject it. */}
  }

  protected async processSignal(msg:SignalMessage){
    if(msg.type==="offer"){
      if(this.pc)return;
      this.beginNegotiation();
      const servers=await this.freshIceServers();
      if(this.closed)return;
      this.pc=new RTCPeerConnection({iceServers:servers,bundlePolicy:"max-bundle"});
      this.installPeerHandlers();
      this.pc.ontrack=(ev)=>{
        // This is a preferred hold time, not a guaranteed playout delay. Unsupported browsers keep their default.
        if(ev.track.kind==="video"){this.videoReceiver=ev.receiver;this.updateReceiveBuffer(this.confirmedGameVideo);}
        this.callbacks.onRemoteStream?.(ev.streams[0]??new MediaStream([ev.track]));
      };
      this.pc.ondatachannel=(ev)=>{
        if(ev.channel.label==="pointer"&&!this.pointerChannel){this.pointerChannel=ev.channel;this.watchPointerBuffer(ev.channel);return;}
        if(ev.channel.label!=="input"||this.inputChannel){ev.channel.close();return;}
        this.inputChannel=ev.channel;this.installInputFailureHandlers();this.watchPointerBuffer(ev.channel);
        this.inputChannel.onmessage=(message)=>{
          const parsed=parseMessage(message.data);
          if(parsed?.type==="quality_mode_status"&&parsed.sessionId===this.sessionId&&isQualityMode(parsed.mode)){
            this.confirmedGameVideo=parsed.mode==="game"&&parsed.applied===true;
            this.updateReceiveBuffer(this.confirmedGameVideo);
            this.callbacks.onQualityControl?.({supported:true,mode:parsed.mode,applied:parsed.applied===true});return;
          }
          if(parsed?.type==="input_status"&&parsed.sessionId===this.sessionId){
            if((parsed.reason==="limited"||parsed.reason==="rejected")&&Number.isSafeInteger(parsed.rejected)&&(parsed.rejected as number)>=0)this.callbacks.onInputStatus?.({reason:parsed.reason,rejected:parsed.rejected as number});
            return;
          }
          if(parsed?.type!=="pong"||parsed.sessionToken!==this.sessionToken||!this.heartbeat)return;
          this.latestCaptureTiming=parseCaptureTiming(parsed.captureTiming);
          const supported=parsed.qualityControlVersion===1;
          this.gameSupported=parsed.gameInputVersion===1;
          this.callbacks.onGameSupport?.(this.gameSupported);
          const mode=isQualityMode(parsed.qualityMode)?parsed.qualityMode:"auto";
          const negotiatedMode=compatibleQualityMode(mode,this.gameSupported);
          const first=supported&&!this.qualitySupported;this.qualitySupported=supported;
          this.confirmedGameVideo=negotiatedMode==="game"&&parsed.qualityProfileApplied===true;
          this.updateReceiveBuffer(this.confirmedGameVideo);
          this.callbacks.onQualityControl?.({supported,mode:negotiatedMode,applied:parsed.qualityProfileApplied===true});
          if(first)this.setQualityMode(this.desiredQuality??this.options.qualityMode??"auto");
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
    if(gameMouse(event) && !this.gameSupported)return false;
    if(event.type==="mouse_relative"){
      if(this.pointerChannel?.readyState!=="open"||!validGameDelta(event.payload?.dx)||!validGameDelta(event.payload?.dy))return false;
      this.pointer.discard();this.relativePointer.push(event);return true;
    }
    if(event.type==="mouse_move"){this.relativePointer.discard();this.pointer.push(event);return true;}
    // A key/wheel/quality message is independent of camera displacement. Clearing
    // on every key edge discarded pending motion while moving and aiming together.
    if(event.type==="mouse_down"||event.type==="mouse_up"||event.type==="release_all"||event.type==="disconnect"||event.type==="text_input")this.relativePointer.discard();
    if(event.type==="mouse_down"||event.type==="mouse_up"||event.type==="release_all"||event.type==="disconnect"||event.type==="text_input")this.pointer.discard();
    return this.deliverInput(event);
  }
  private watchPointerBuffer(channel:RTCDataChannel){
    channel.bufferedAmountLowThreshold=MAX_POINTER_BUFFER/2;
    channel.onbufferedamountlow=()=>{if(!this.closed){this.pointer.flush();this.relativePointer.flush();}};
  }
  private deliverInput(event:RemoteInputEvent):boolean{
    if(this.closed||this.inputChannel?.readyState!=="open")return false;
    const pointerChannel=(event.type==="mouse_move"||event.type==="mouse_relative")&&this.pointerChannel?.readyState==="open"?this.pointerChannel:undefined;
    if(pointerChannel){
      if(pointerChannel.bufferedAmount>MAX_POINTER_BUFFER)return false;
      try{pointerChannel.send(JSON.stringify({...event,sequence:++this.inputSequence}));return true;}
      catch{this.fail("input_channel_failed");return false;}
    }else{
      if(event.type==="mouse_relative")return false;
      if(event.type==="mouse_move"&&this.inputChannel.bufferedAmount>MAX_POINTER_BUFFER)return false;
      return this.sendReliable({...event,sequence:++this.inputSequence});
    }
  }
  override close(){
    this.pointer.close();
    this.relativePointer.close();
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
          telemetry.captureTiming=this.latestCaptureTiming;
          this.updateReceiveBuffer(this.confirmedGameVideo,telemetry);
          this.callbacks.onRelayStatus?.(telemetry.route);this.callbacks.onTelemetry?.(telemetry);
        }
      }catch{/* Statistics are best effort and cannot grant or resume input. */}
      finally{if(!this.closed)this.telemetryTimer=window.setTimeout(()=>void sample(),2_000);}
    };
    void sample();
  }
}
