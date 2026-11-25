import assert from "node:assert/strict";
import test from "node:test";
import { VideoStatsSampler } from "./videoTelemetry.ts";

function report(timestamp: number, bytes: number, frames: number, received: number, lost: number, id="video") {
  return new Map([[id,{id,type:"inbound-rtp",kind:"video",timestamp,bytesReceived:bytes,framesDecoded:frames,packetsReceived:received,packetsLost:lost,frameWidth:1920,frameHeight:1080,codecId:"codec",jitter:.012,freezeCount:1}],
    ["codec",{id:"codec",type:"codec",mimeType:"video/VP8"}]]) as unknown as RTCStatsReport;
}
test("computes interval bitrate fps and loss instead of cumulative percentages",()=>{
  const sampler=new VideoStatsSampler();
  assert.equal(sampler.sample(report(1000,100000,30,100,0),"receive").bitrateKbps,undefined);
  const measured=sampler.sample(report(3000,600000,80,290,10),"receive");
  assert.equal(measured.bitrateKbps,2000); assert.equal(measured.fps,25); assert.equal(measured.packetLossPercent,5);
  assert.equal(measured.jitterMs,12);assert.equal(measured.codec,"VP8");assert.equal(measured.width,1920);
});
test("counter reset or source replacement does not produce negative bitrate/fps",()=>{
  const sampler=new VideoStatsSampler();sampler.sample(report(1000,90000,30,100,10),"receive");
  assert.equal(sampler.sample(report(2000,200,1,2,0),"receive").bitrateKbps,undefined);
  assert.equal(sampler.sample(report(3000,100,0,0,0,"new-video"),"receive").fps,undefined);
});
test("static desktop reports zero rate without inferring failure or loss",()=>{
  const sampler=new VideoStatsSampler();sampler.sample(report(1000,90000,30,100,10),"receive");
  const measured=sampler.sample(report(3000,90000,30,100,10),"receive");
  assert.equal(measured.bitrateKbps,0);assert.equal(measured.fps,0);assert.equal(measured.packetLossPercent,undefined);
});

test("derives decode and jitter-buffer time from matching interval counters",()=>{
  const sampler=new VideoStatsSampler();
  const first=report(1000,100,10,10,0);Object.assign(first.get("video")!,{totalDecodeTime:.1,jitterBufferDelay:.5,jitterBufferEmittedCount:10,framesDropped:2});
  sampler.sample(first,"receive");
  const second=report(3000,10000,30,30,0);Object.assign(second.get("video")!,{totalDecodeTime:.14,jitterBufferDelay:.9,jitterBufferEmittedCount:30,framesDropped:5});
  const sample=sampler.sample(second,"receive");assert.equal(sample.decodeMs,2);assert.equal(sample.jitterBufferMs,20);assert.equal(sample.framesDropped,3);
});

test("derives sender packet-queue time separately from encode time",()=>{
  const sampler=new VideoStatsSampler();
  const make=(timestamp:number,bytes:number,frames:number,time:number,packets:number,delay:number)=>new Map([["send",{id:"send",type:"outbound-rtp",kind:"video",timestamp,bytesSent:bytes,framesEncoded:frames,totalEncodeTime:time,packetsSent:packets,totalPacketSendDelay:delay}]]) as unknown as RTCStatsReport;
  sampler.sample(make(1000,10000,10,.03,100,.4),"send");
  const result=sampler.sample(make(3000,40000,30,.11,300,1.4),"send");
  assert.equal(result.encodeMs,4);assert.equal(result.sendQueueMs,5);
});

test("sender queue delay stays unavailable for idle, missing, and reset packet counters",()=>{
  const make=(timestamp:number,packets:number,delay?:number)=>new Map([["send",{id:"send",type:"outbound-rtp",kind:"video",timestamp,bytesSent:timestamp,packetsSent:packets,totalPacketSendDelay:delay}]]) as unknown as RTCStatsReport;
  const sampler=new VideoStatsSampler();
  assert.equal(sampler.sample(make(1000,100,10),"send").sendQueueMs,undefined);
  assert.equal(sampler.sample(make(2000,100,10),"send").sendQueueMs,undefined);
  assert.equal(sampler.sample(make(3000,110),"send").sendQueueMs,undefined);
  assert.equal(sampler.sample(make(4000,120,11),"send").sendQueueMs,undefined);
  assert.equal(sampler.sample(make(5000,10,1),"send").sendQueueMs,undefined);
  assert.equal(sampler.sample(make(6000,20,1.1),"send").sendQueueMs,10);
});

test("simulcast frame rates are not added together and encoder target remains distinct from traffic",()=>{
  const make=(timestamp:number,frames:number)=>new Map(["high","low"].map(id=>[id,{id,type:"outbound-rtp",kind:"video",timestamp,bytesSent:timestamp*10,framesEncoded:frames,frameWidth:id==="high"?3840:960,frameHeight:id==="high"?2160:540,targetBitrate:id==="high"?20_000_000:1_000_000}])) as unknown as RTCStatsReport;
  const sampler=new VideoStatsSampler();sampler.sample(make(1000,60),"send");
  const sample=sampler.sample(make(2000,120),"send");assert.equal(sample.fps,60);assert.equal(sample.width,3840);assert.equal(sample.bitrateKbps,160);assert.equal(sample.encoderTargetKbps,21000);
});

test("reports browser codec implementation when the stats implementation exposes it",()=>{
  const outgoing=new Map([["send",{id:"send",type:"outbound-rtp",kind:"video",timestamp:1000,bytesSent:10,framesEncoded:1,codecId:"codec",encoderImplementation:"external encoder (NVENC)"}],
    ["codec",{id:"codec",type:"codec",mimeType:"video/H264"}]]) as unknown as RTCStatsReport;
  const incoming=new Map([["receive",{id:"receive",type:"inbound-rtp",kind:"video",timestamp:1000,bytesReceived:10,framesDecoded:1,codecId:"codec",decoderImplementation:"D3D11VideoDecoder"}],
    ["codec",{id:"codec",type:"codec",mimeType:"video/H264"}]]) as unknown as RTCStatsReport;
  const sampler=new VideoStatsSampler();
  const sent=sampler.sample(outgoing,"send"),received=sampler.sample(incoming,"receive");
  assert.equal(sent.codec,"H264");
  assert.equal(sent.encoderImplementation,"external encoder (NVENC)");
  assert.equal(received.decoderImplementation,"D3D11VideoDecoder");
});

test("sanitizes browser implementation strings before diagnostic export",()=>{
  const stats=new Map([["send",{id:"send",type:"outbound-rtp",kind:"video",timestamp:1,bytesSent:1,framesEncoded:1,encoderImplementation:"encoder\nAuthorization: secret"}]]) as unknown as RTCStatsReport;
  assert.equal(new VideoStatsSampler().sample(stats,"send").encoderImplementation,"browser-reported implementation (details omitted)");
});

test("ignores malformed codec labels returned by the WebRTC stats report",()=>{
  const stats=new Map([["send",{id:"send",type:"outbound-rtp",kind:"video",timestamp:1,bytesSent:1,framesEncoded:1,codecId:"codec"}],
    ["codec",{id:"codec",type:"codec",mimeType:"video/H264\nAuthorization: secret"}]]) as unknown as RTCStatsReport;
  assert.equal(new VideoStatsSampler().sample(stats,"send").codec,undefined);
});
