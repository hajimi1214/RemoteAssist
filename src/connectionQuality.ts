export type VideoQuality = "Economy" | "Constrained" | "Balanced" | "Sharp";
export type VideoPreference = "auto" | "text" | "motion";
export interface VideoSourceSize { width?: number; height?: number }
export const videoTarget = { width: 3840, height: 2160, maxFramerate: 60 } as const;

export interface ConnectionSample {
  rttMs?: number;
  availableOutgoingBitrate?: number;
  // Mean RTP packetizer-to-socket delay from consecutive sender samples.
  sendQueueMs?: number;
  encodeMs?: number;
  qualityLimitationReason?: "none" | "cpu" | "bandwidth" | "other";
}

export const videoProfiles = {
  Economy: { maxBitrate: 1_000_000, maxFramerate: 15, scaleResolutionDownBy: 2 },
  Constrained: { maxBitrate: 3_000_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
  Balanced: { maxBitrate: 8_000_000, maxFramerate: 60, scaleResolutionDownBy: 1 },
  Sharp: { maxBitrate: 16_000_000, maxFramerate: 60, scaleResolutionDownBy: 1 }
} satisfies Record<VideoQuality, Pick<RTCRtpEncodingParameters, "maxBitrate" | "maxFramerate" | "scaleResolutionDownBy">>;

const qualityLevels: VideoQuality[] = ["Economy", "Constrained", "Balanced", "Sharp"];
const qualityRank: Record<VideoQuality, number> = { Economy: 0, Constrained: 1, Balanced: 2, Sharp: 3 };

export function videoEncoding(quality: VideoQuality, preference: VideoPreference, source: VideoSourceSize = {}) {
  const profile = { ...videoProfiles[quality] };
  const width = finiteNonnegative(source.width), height = finiteNonnegative(source.height);
  if (preference === "text") profile.maxFramerate = Math.min(profile.maxFramerate, 15);
  if (preference === "motion" && quality === "Constrained") {
    profile.maxFramerate = 45;
    profile.scaleResolutionDownBy = Math.max(profile.scaleResolutionDownBy, 1.5);
  }
  if (width && height) {
    // Budget the actual encoded pixels. Never upscale a smaller host screen.
    const targetScale = Math.max(1, width / videoTarget.width, height / videoTarget.height);
    profile.scaleResolutionDownBy = Math.max(profile.scaleResolutionDownBy, targetScale);
    const encodedPixels = width * height / (profile.scaleResolutionDownBy ** 2);
    const factor = Math.min(2.5, Math.max(.5, encodedPixels / (1920 * 1080)));
    profile.maxBitrate = Math.round(profile.maxBitrate * factor);
  }
  return profile;
}

// Hysteresis avoids resolution flicker when bandwidth oscillates near a threshold.
export class AdaptiveVideoPolicy {
  current: VideoQuality;
  private candidate?: VideoQuality;
  private samples = 0;

  constructor(initial: VideoQuality = "Balanced") { this.current = initial; }

  observe(sample: ConnectionSample): VideoQuality {
    const bandwidth = finiteNonnegative(sample.availableOutgoingBitrate);
    const rtt = typeof sample.rttMs === "number" && Number.isFinite(sample.rttMs) && sample.rttMs >= 0 ? sample.rttMs : undefined;
    const sendQueue = finiteNonnegative(sample.sendQueueMs);
    const constrained = sample.qualityLimitationReason === "cpu" || sample.qualityLimitationReason === "bandwidth";
    const encodeMs = finiteNonnegative(sample.encodeMs);
    // Severe sender-side pressure is a latency event, not a cosmetic quality
    // preference: lower the ceiling immediately instead of waiting for the
    // normal hysteresis window. Recovery still uses the regular good-sample gate.
    const severeBandwidth = bandwidth != null && bandwidth < 300_000;
    const severeQueue = sendQueue != null && sendQueue >= 250;
    const severeCpu = sample.qualityLimitationReason === "cpu" && encodeMs != null && encodeMs >= 120;
    if (severeBandwidth || severeQueue || severeCpu) {
      const currentRank = qualityRank[this.current];
      const steps = severeBandwidth || (sendQueue != null && sendQueue >= 500) || severeCpu ? 2 : 1;
      this.current = qualityLevels[Math.max(0, currentRank - steps)];
      this.candidate = undefined;
      this.samples = 0;
      return this.current;
    }
    if (bandwidth == null && rtt == null && sendQueue == null && !constrained) {
      this.candidate = undefined;
      this.samples = 0;
      return this.current;
    }

    let desired = this.current;
    if ((bandwidth != null && bandwidth < 900_000) || (rtt != null && rtt > 500) || (sendQueue != null && sendQueue > 120)) {
      desired = "Economy";
    } else if (constrained || (bandwidth != null && bandwidth < 1_800_000) || (rtt != null && rtt > 300) || (sendQueue != null && sendQueue > 50)) {
      desired = "Constrained";
    } else if ((sendQueue == null || sendQueue < 25) && bandwidth != null && bandwidth >= 6_000_000 && rtt != null && rtt >= 0 && rtt < 120) {
      desired = "Sharp";
    } else if ((sendQueue == null || sendQueue < 25) && bandwidth != null && bandwidth >= 2_500_000 && rtt != null && rtt < 220) {
      desired = "Balanced";
    }
    // A pressure tier is a ceiling, never a reason to upgrade from Economy.
    if (qualityRank[desired] > qualityRank[this.current] && (constrained || (sendQueue != null && sendQueue >= 25))) desired=this.current;
    if (desired === this.current) {
      this.candidate = undefined;
      this.samples = 0;
      return this.current;
    }
    this.samples = this.candidate === desired ? this.samples + 1 : 1;
    this.candidate = desired;
    const needed = qualityRank[desired] < qualityRank[this.current] ? 2 : 3;
    if (this.samples >= needed) {
      // One level per transition avoids halving text resolution on a brief dip.
      this.current = qualityLevels[qualityRank[this.current] + Math.sign(qualityRank[desired] - qualityRank[this.current])];
      this.samples = 0;
      this.candidate = undefined;
    }
    return this.current;
  }
}

function finiteNonnegative(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function selectedCandidatePair(stats: RTCStatsReport): RTCStats | undefined {
  let pair: RTCStats | undefined;
  stats.forEach((report) => {
    if (report.type === "transport" && report.selectedCandidatePairId) {
      pair = stats.get(report.selectedCandidatePairId);
    }
  });
  if (pair) return pair;
  // Older WebView2 builds expose a nominated pair without a transport link.
  stats.forEach((report) => {
    if (!pair && report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) pair = report;
  });
  return pair;
}

export function connectionSample(stats: RTCStatsReport): ConnectionSample {
  const pair = selectedCandidatePair(stats) as Record<string, unknown> | undefined;
  const sample: ConnectionSample = {};
  if (typeof pair?.currentRoundTripTime === "number") sample.rttMs = pair.currentRoundTripTime * 1000;
  if (typeof pair?.availableOutgoingBitrate === "number") sample.availableOutgoingBitrate = pair.availableOutgoingBitrate;
  const limitationRank: Record<NonNullable<ConnectionSample["qualityLimitationReason"]>, number> = {none:0,other:1,cpu:2,bandwidth:3};
  stats.forEach((report) => {
    if (report.type !== "outbound-rtp" || (report.kind ?? report.mediaType) !== "video") return;
    const reason = report.qualityLimitationReason;
    if (["none", "cpu", "bandwidth", "other"].includes(reason)) {
      // Preserve reported pressure across streams; W3C prioritizes bandwidth,
      // then CPU, then other when more than one limiting factor is present.
      const nextReason=reason as NonNullable<ConnectionSample["qualityLimitationReason"]>;
      if (limitationRank[nextReason] >= limitationRank[sample.qualityLimitationReason??"none"]) sample.qualityLimitationReason = nextReason;
    }
  });
  return sample;
}

export function connectionRoute(stats: RTCStatsReport): "P2P" | "TURN Relay" | "Unknown" {
  return connectionRouteDetails(stats).route;
}

export function connectionRouteDetails(stats: RTCStatsReport): {
  route: "P2P" | "TURN Relay" | "Unknown";
  localProtocol?: "udp" | "tcp";
  remoteProtocol?: "udp" | "tcp";
  relayProtocol?: "udp" | "tcp" | "tls";
} {
  const pair = selectedCandidatePair(stats) as Record<string, unknown> | undefined;
  if (!pair) return { route: "Unknown" };
  const local = typeof pair.localCandidateId === "string" ? stats.get(pair.localCandidateId) as Record<string, unknown> | undefined : undefined;
  const remote = typeof pair.remoteCandidateId === "string" ? stats.get(pair.remoteCandidateId) as Record<string, unknown> | undefined : undefined;
  const localProtocol = candidateProtocol(local?.protocol);
  const remoteProtocol = candidateProtocol(remote?.protocol);
  const relayedCandidate = local?.candidateType === "relay" ? local : remote?.candidateType === "relay" ? remote : undefined;
  const relayProtocol = turnProtocol(relayedCandidate?.relayProtocol);
  const route = relayedCandidate ? "TURN Relay" : local && remote ? "P2P" : "Unknown";
  return {
    route,
    ...(localProtocol ? { localProtocol } : {}),
    ...(remoteProtocol ? { remoteProtocol } : {}),
    ...(relayProtocol ? { relayProtocol } : {}),
  };
}

function candidateProtocol(value: unknown): "udp" | "tcp" | undefined {
  return value === "udp" || value === "tcp" ? value : undefined;
}

function turnProtocol(value: unknown): "udp" | "tcp" | "tls" | undefined {
  return value === "udp" || value === "tcp" || value === "tls" ? value : undefined;
}
