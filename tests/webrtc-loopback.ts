import { HostPeer, ControllerPeer } from "../src/webrtc";
import { InputEventGate } from "../src/inputEvents";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ConnectionDiagnostics } from "../src/ui";
import "../src/styles.css";

const diagnosticsRoot=createRoot(document.querySelector("#diagnostics")!);
import.meta.hot?.dispose(()=>diagnosticsRoot.unmount());

const output = document.querySelector<HTMLPreElement>("#result")!;
const video = document.querySelector<HTMLVideoElement>("#video")!;
const button = document.querySelector<HTMLButtonElement>("#run")!;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(test: () => boolean, description: string) {
  for (let i = 0; i < 150; i++) { if (test()) return; await delay(100); }
  throw new Error(`Timed out: ${description}`);
}
function check(condition: boolean, description: string) {
  if (!condition) throw new Error(description);
  output.textContent += `PASS ${description}\n`;
}

button.onclick = async () => {
  button.disabled = true;
  output.textContent = "Running…\n";
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 360;
  const context = canvas.getContext("2d")!;
  let frame = 0;
  const draw = () => {
    context.fillStyle = "#0a1733"; context.fillRect(0, 0, 640, 360);
    context.fillStyle = "white"; context.font = "28px sans-serif";
    context.fillText(`RemoteAssist test frame ${++frame}`, 30, 80);
  };
  draw();
  const rendering = window.setInterval(draw, 100);
  const stream = canvas.captureStream(10);
  const delivered: Array<{ command: string; args?: Record<string, unknown> }> = [];
  let authorized = true;
  let controller!: ControllerPeer;
  let host!: HostPeer;
  let latency = -1;
  let quality = "";
  let gameSupported = false;
  let gameModeApplied = false;
  let hostConnected = false;
  let controllerConnected = false;
  let hostIceLoads=0;let controllerIceLoads=0;
  let sendStats: import("../src/videoTelemetry").VideoTelemetry|undefined;
  let receiveStats: import("../src/videoTelemetry").VideoTelemetry|undefined;
  const sessionToken = "local-loopback-test-token";
  const gate = new InputEventGate(sessionToken, () => authorized, 120, async (command, args) => { if (command !== "renew_input_lease") delivered.push({ command, args }); });
  // Signaling is delivered between the two real browser peers; server wire
  // authentication/termination is covered separately by httptest WebSockets.
  const hostWire = { readyState: WebSocket.OPEN, send: (data: string) => { queueMicrotask(() => { void controller.handleSignal(JSON.parse(data)); }); } } as WebSocket;
  const controllerWire = { readyState: WebSocket.OPEN, send: (data: string) => { queueMicrotask(() => { void host.handleSignal(JSON.parse(data)); }); } } as WebSocket;
  try {
    controller = new ControllerPeer("loopback", sessionToken, controllerWire, [], {
      onRemoteStream: (stream) => { video.srcObject = stream; },
      onConnectionStatus: (value) => { controllerConnected = value === "connected"; },
      onLatency: (value) => { latency = value; },
      onGameSupport: (supported) => { gameSupported = supported; },
      onQualityControl: (sample) => { gameModeApplied = sample.mode === "game" && sample.applied === true; },
      onTelemetry:(sample)=>{receiveStats=sample;diagnosticsRoot.render(createElement(ConnectionDiagnostics,{sample}));}
    },{qualityMode:"game",loadIceServers:async()=>{controllerIceLoads++;return[];}});
    host = new HostPeer("loopback", "local-host-test-token", hostWire, [], {
      onConnectionStatus: (value) => { hostConnected = value === "connected"; },
      onQuality: (value) => { quality = value; },
      onTelemetry:(sample)=>{sendStats=sample;}
    },{gameInput:true,loadIceServers:async()=>{hostIceLoads++;return[];}});
    check(hostIceLoads===0&&controllerIceLoads===0,"ICE credentials are not loaded before negotiation");
    await host.start(stream, gate);
    await until(() => hostConnected && controllerConnected && video.videoWidth > 0 && latency >= 0, "video and DataChannels");
    check(true, "real PeerConnection negotiation, received video, ping/pong RTT");
    await until(() => gameSupported && gameModeApplied, "game capability and encoder profile acknowledgement");
    check(true,"game capability negotiation applies saved game mode");
    await until(() => quality !== "", "RTCRtpSender parameters");
    check(quality !== "Browser managed", `sender accepts adaptive encoding parameters (${quality})`);
    await until(()=>receiveStats?.bitrateKbps!=null&&sendStats?.codec!=null,"video telemetry interval");
    check(hostIceLoads===1&&controllerIceLoads===1,"both peers load fresh ICE credentials at negotiation");
    check(!!receiveStats?.codec&&(receiveStats?.width??0)>0&&(receiveStats?.fps??-1)>=0,"real receive codec dimensions fps and interval bitrate measured");
    controller.sendInput({type:"mouse_relative",sessionToken,ts:Date.now(),payload:{dx:21,dy:-7}});
    await until(()=>delivered.some(item=>(item.args?.event as {type?:string})?.type==="mouse_relative"),"game relative input delivery");
    const relative=delivered.find(item=>(item.args?.event as {type?:string})?.type==="mouse_relative")?.args?.event as {payload?:{dx?:number;dy?:number}};
    check(relative.payload?.dx===21&&relative.payload?.dy===-7,"relative game motion preserves accumulated deltas through the unordered channel");
    host.setPreference("text");
    await delay(3300);
    check(quality!=="Browser managed","text-oriented encoder preference accepted during streaming");
    controller.sendInput({ type: "mouse_move", sessionToken, ts: Date.now(), payload: { x: .4, y: .5, button: 0 } });
    await until(() => delivered.some((item) => (item.args?.event as {type?:string})?.type === "mouse_move"), "lossy pointer delivery");
    check(true, "pointer channel delivers validated normalized motion");
    controller.sendInput({type:"mouse_move",sessionToken,ts:Date.now(),payload:{x:.2,y:.5,button:0}});
    controller.sendInput({type:"mouse_move",sessionToken,ts:Date.now(),payload:{x:.8,y:.5,button:0}});
    await until(()=>delivered.some(item=>(item.args?.event as {payload?:{x?:number}})?.payload?.x===.8),"final coalesced pointer position");
    check(true,"pointer burst preserves its final position");
    controller.sendInput({type:"mouse_move",sessionToken,ts:Date.now(),payload:{x:.3,y:.5,button:0}});
    controller.sendInput({type:"mouse_down",sessionToken,ts:Date.now(),payload:{x:.6,y:.5,button:0}});
    await delay(100);
    const buttonAt=delivered.findIndex(item=>(item.args?.event as {type?:string})?.type==="mouse_down");
    check(buttonAt>=0&&!delivered.slice(buttonAt+1).some(item=>(item.args?.event as {payload?:{x?:number}})?.payload?.x===.3),"click cancels older pending pointer movement");
    controller.sendInput({type:"mouse_up",sessionToken,ts:Date.now(),payload:{x:.6,y:.5,button:0}});
    controller.sendInput({ type: "key_down", sessionToken, ts: Date.now(), payload: { key:"a", code:"KeyA" } });
    controller.sendInput({ type: "key_up", sessionToken, ts: Date.now(), payload: { key:"a", code:"KeyA" } });
    controller.sendInput({ type: "release_all", sessionToken, ts: Date.now() });
    await until(() => delivered.some((item) => item.command === "release_remote_inputs"), "reliable release delivery");
    check(delivered.filter((item) => (item.args?.event as {type?:string})?.type?.startsWith("key_")).map((item) => (item.args!.event as {type:string}).type).join(",") === "key_down,key_up", "reliable key order and release-all delivery");
    const count = delivered.length;
    controller.sendInput({ type:"key_down", sessionToken:"invalid-token", ts: Date.now(), payload:{key:"b",code:"KeyB"} });
    await delay(150);
    check(delivered.length === count, "invalid input token rejected");
    authorized = false;
    controller.sendInput({ type:"key_down", sessionToken, ts: Date.now(), payload:{key:"c",code:"KeyC"} });
    await delay(150);
    check(delivered.length === count, "revoked input gate rejects further delivery");
    const safeReleases: string[] = [];
    const limitedGate = new InputEventGate(sessionToken, () => true, 1, async (command) => { safeReleases.push(command); });
    await limitedGate.accept({ type:"key_down", sessionToken, ts:Date.now(), payload:{key:"a",code:"KeyA"} });
    await limitedGate.accept({ type:"key_up", sessionToken, ts:Date.now(), payload:{key:"a",code:"KeyA"} });
    await limitedGate.accept({ type:"release_all", sessionToken, ts:Date.now(),sequence:1 });
    check(safeReleases.length === 3 && safeReleases[2] === "release_remote_inputs", "release events bypass action-rate saturation");
    host.close(); controller.close();
    controller.sendInput({ type:"key_down", sessionToken, ts:Date.now(), payload:{key:"d",code:"KeyD"} });
    await delay(150);
    check(delivered.length === count, "closing peers stops all further input");
    output.textContent += "RESULT: PASS\n";
  } catch (error) {
    output.textContent += `RESULT: FAIL ${error instanceof Error ? error.message : String(error)}\n`;
  } finally {
    host?.close(); controller?.close(); stream.getTracks().forEach((track) => track.stop());
    clearInterval(rendering); button.disabled = false;
  }
};

document.querySelector<HTMLButtonElement>("#timeouts")!.onclick=async()=>{
  const run=document.querySelector<HTMLButtonElement>("#timeouts")!;run.disabled=true;button.disabled=true;
  output.textContent="Running watchdog checks…\n";
  const canvas=document.createElement("canvas");canvas.width=160;canvas.height=90;
  canvas.getContext("2d")!.fillRect(0,0,160,90);
  const stream=canvas.captureStream(5);
  const peers:Array<HostPeer|ControllerPeer>=[];
  try {
    let timedOut="";
    const silentWire={readyState:WebSocket.OPEN,send:()=>{}} as unknown as WebSocket;
    const noAnswer=new HostPeer("timeout","host-test-token",silentWire,[],{onFailure:reason=>{timedOut=reason;}});
    peers.push(noAnswer);
    await noAnswer.start(stream,new InputEventGate("controller-test-token",()=>true,120,async()=>{}));
    for(let i=0;i<300&&!timedOut;i++)await delay(100);
    check(timedOut==="negotiation_timeout","missing SDP answer ends negotiation within its deadline");
    let host!:HostPeer;let controller!:ControllerPeer;let lost="";let connected=false;
    const hostWire={readyState:WebSocket.OPEN,send:(s:string)=>queueMicrotask(()=>void controller.handleSignal(JSON.parse(s)))}as WebSocket;
    const controllerWire={readyState:WebSocket.OPEN,send:(s:string)=>queueMicrotask(()=>void host.handleSignal(JSON.parse(s)))}as WebSocket;
    const token="watchdog-controller-token";
    // Simulate a native layer that never acknowledges keepalive: no pong can
    // be produced, while the real data channel and video transport still exist.
    const gate=new InputEventGate(token,()=>true,120,(command)=>command==="renew_input_lease"?new Promise(()=>{}):Promise.resolve());
    host=new HostPeer("watchdog","host-test-token",hostWire,[],{onFailure:reason=>{lost=reason;}});
    controller=new ControllerPeer("watchdog",token,controllerWire,[],{onConnectionStatus:status=>{if(status==="connected")connected=true;},onFailure:reason=>{if(!lost)lost=reason;}});
    peers.push(host,controller);await host.start(stream,gate);
    await until(()=>connected,"watchdog input channel open");
    await until(()=>!!lost,"watchdog termination");
    check(lost==="heartbeat_timeout","missing authenticated keepalive ends an otherwise-open connection");
    output.textContent+="RESULT: PASS\n";
  }catch(error){output.textContent+=`RESULT: FAIL ${error instanceof Error?error.message:String(error)}\n`;}
  finally{for(const peer of peers)peer.close();stream.getTracks().forEach(track=>track.stop());run.disabled=false;button.disabled=false;}
};
