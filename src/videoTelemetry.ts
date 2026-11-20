import { connectionRoute, connectionSample } from "./connectionQuality.ts";

export interface VideoTelemetry {
  direction: "send" | "receive";
  route: "P2P" | "TURN Relay" | "Unknown";
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrateKbps?: number;
  packetLossPercent?: number;
  jitterMs?: number;
  rttMs?: number;
  qualityLimitation?: string;
  freezes?: number;
  encodeMs?: number;
  decodeMs?: number;
  jitterBufferMs?: number;
  framesDropped?: number;
  sendQueueMs?: number;
}

interface Counters { timestamp: number; bytes: number; frames?: number; received?: number; lost?: number; processingTime?: number; bufferDelay?: number; bufferCount?: number; dropped?: number; sendDelay?: number; sent?: number }
function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

// Store counters only, never addresses, SDP, video frames, or input contents.
export class VideoStatsSampler {
  private previous = new Map<string, Counters>();

  sample(stats: RTCStatsReport, direction: "send" | "receive"): VideoTelemetry {
    const result: VideoTelemetry = { direction, route: connectionRoute(stats) };
    const network = connectionSample(stats);
    result.rttMs = numeric(network.rttMs);
    const next = new Map<string, Counters>();
    let bitrate = 0; let measuredBitrate = false;
    let fps = 0; let measuredFps = false;
    let lost = 0; let received = 0; let measuredLoss = false;
    let processingTime=0; let processedFrames=0; let bufferDelay=0; let bufferCount=0; let dropped=0; let measuredDropped=false;
    let sendDelay=0;let sent=0;
    stats.forEach((report) => {
      if (report.type !== (direction === "send" ? "outbound-rtp" : "inbound-rtp") || (report.kind ?? report.mediaType) !== "video") return;
      const bytes = numeric(direction === "send" ? report.bytesSent : report.bytesReceived);
      const timestamp = numeric(report.timestamp);
      if (bytes == null || timestamp == null) return;
      const current: Counters = {
        timestamp, bytes, frames: numeric(direction === "send" ? report.framesEncoded : report.framesDecoded),
        received: numeric(report.packetsReceived), lost: numeric(report.packetsLost),
        processingTime: numeric(direction === "send" ? report.totalEncodeTime : report.totalDecodeTime),
        bufferDelay: numeric(report.jitterBufferDelay), bufferCount: numeric(report.jitterBufferEmittedCount),
        dropped: numeric(report.framesDropped),
        sendDelay:numeric(report.totalPacketSendDelay),sent:numeric(report.packetsSent)
      };
      next.set(report.id, current);
      const before = this.previous.get(report.id);
      const elapsed = before ? timestamp - before.timestamp : 0;
      if (before && elapsed > 0 && bytes >= before.bytes) {
        bitrate += (bytes-before.bytes)*8/elapsed;
        measuredBitrate = true;
        if (current.frames != null && before.frames != null && current.frames >= before.frames) {
          fps += (current.frames-before.frames)*1000/elapsed; measuredFps = true;
          if(current.processingTime!=null&&before.processingTime!=null&&current.processingTime>=before.processingTime&&current.frames>before.frames){
            processingTime+=current.processingTime-before.processingTime; processedFrames+=current.frames-before.frames;
          }
        }
        if (current.received != null && before.received != null && current.lost != null && before.lost != null && current.received >= before.received && current.lost >= before.lost) {
          received += current.received-before.received; lost += current.lost-before.lost; measuredLoss=true;
        }
        if(current.bufferDelay!=null&&before.bufferDelay!=null&&current.bufferCount!=null&&before.bufferCount!=null&&current.bufferDelay>=before.bufferDelay&&current.bufferCount>before.bufferCount){
          bufferDelay+=current.bufferDelay-before.bufferDelay;bufferCount+=current.bufferCount-before.bufferCount;
        }
        if(current.dropped!=null&&before.dropped!=null&&current.dropped>=before.dropped){dropped+=current.dropped-before.dropped;measuredDropped=true;}
        if(current.sendDelay!=null&&before.sendDelay!=null&&current.sent!=null&&before.sent!=null&&current.sendDelay>=before.sendDelay&&current.sent>before.sent){sendDelay+=current.sendDelay-before.sendDelay;sent+=current.sent-before.sent;}
      }
      const width = numeric(report.frameWidth); const height = numeric(report.frameHeight);
      if (width && height && width*height > (result.width??0)*(result.height??0)) { result.width=width; result.height=height; }
      const codec=report.codecId?stats.get(report.codecId):undefined;
      if (typeof codec?.mimeType === "string") result.codec=codec.mimeType.replace(/^video\//i,"").slice(0,24);
      const jitter=numeric(report.jitter); if(jitter!=null) result.jitterMs=jitter*1000;
      const freezes=numeric(report.freezeCount); if(freezes!=null) result.freezes=freezes;
      if (typeof report.qualityLimitationReason === "string") result.qualityLimitation=report.qualityLimitationReason;
    });
    this.previous=next;
    if(measuredBitrate)result.bitrateKbps=Math.round(bitrate);
    if(measuredFps)result.fps=Math.round(fps*10)/10;
    if(measuredLoss && received+lost>0)result.packetLossPercent=Math.round(1000*lost/(received+lost))/10;
    if(processedFrames>0)result[direction === "send" ? "encodeMs" : "decodeMs"]=Math.round(processingTime*10000/processedFrames)/10;
    if(bufferCount>0)result.jitterBufferMs=Math.round(bufferDelay*10000/bufferCount)/10;
    if(measuredDropped)result.framesDropped=dropped;
    if(sent>0)result.sendQueueMs=Math.round(sendDelay*10000/sent)/10;
    return result;
  }
}
