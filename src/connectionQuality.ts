export type VideoQuality = "Economy" | "Constrained" | "Balanced" | "Sharp";
export type VideoPreference = "auto" | "text" | "motion";

export interface ConnectionSample {
  rttMs?: number;
  availableOutgoingBitrate?: number;
  qualityLimitationReason?: "none" | "cpu" | "bandwidth" | "other";
}

export const videoProfiles = {
  Economy: { maxBitrate: 650_000, maxFramerate: 12, scaleResolutionDownBy: 2 },
  Constrained: { maxBitrate: 1_100_000, maxFramerate: 12, scaleResolutionDownBy: 1 },
  Balanced: { maxBitrate: 1_800_000, maxFramerate: 20, scaleResolutionDownBy: 1 },
  Sharp: { maxBitrate: 4_000_000, maxFramerate: 30, scaleResolutionDownBy: 1 }
} satisfies Record<VideoQuality, Pick<RTCRtpEncodingParameters, "maxBitrate" | "maxFramerate" | "scaleResolutionDownBy">>;

const qualityLevels: VideoQuality[] = ["Economy", "Constrained", "Balanced", "Sharp"];
const qualityRank: Record<VideoQuality, number> = { Economy: 0, Constrained: 1, Balanced: 2, Sharp: 3 };

export function videoEncoding(quality: VideoQuality, preference: VideoPreference) {
  const profile = { ...videoProfiles[quality] };
  if (preference === "text") profile.maxFramerate = Math.min(profile.maxFramerate, 15);
  if (preference === "motion" && quality === "Constrained") {
    profile.maxFramerate = 20;
    profile.scaleResolutionDownBy = 1.5;
  }
  return profile;
}

// Hysteresis avoids resolution flicker when bandwidth oscillates near a threshold.
export class AdaptiveVideoPolicy {
  current: VideoQuality = "Balanced";
  private candidate?: VideoQuality;
  private samples = 0;

  observe(sample: ConnectionSample): VideoQuality {
    const bandwidth = finiteNonnegative(sample.availableOutgoingBitrate);
    const rtt = typeof sample.rttMs === "number" && Number.isFinite(sample.rttMs) && sample.rttMs >= 0 ? sample.rttMs : undefined;
    const constrained = sample.qualityLimitationReason === "cpu" || sample.qualityLimitationReason === "bandwidth";
    if (bandwidth == null && rtt == null && !constrained) {
      this.candidate = undefined;
      this.samples = 0;
      return this.current;
    }

    let desired = this.current;
    if ((bandwidth != null && bandwidth < 900_000) || (rtt != null && rtt > 500)) {
      desired = "Economy";
    } else if (constrained || (bandwidth != null && bandwidth < 1_800_000) || (rtt != null && rtt > 300)) {
      desired = "Constrained";
    } else if (bandwidth != null && bandwidth >= 6_000_000 && rtt != null && rtt >= 0 && rtt < 120) {
      desired = "Sharp";
    } else if (bandwidth != null && bandwidth >= 2_500_000 && rtt != null && rtt < 220) {
      desired = "Balanced";
    }
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
  stats.forEach((report) => {
    if (report.type !== "outbound-rtp" || (report.kind ?? report.mediaType) !== "video") return;
    const reason = report.qualityLimitationReason;
    if (["none", "cpu", "bandwidth", "other"].includes(reason)) {
      // CPU pressure wins when multiple outbound streams report different limits.
      if (sample.qualityLimitationReason !== "cpu") sample.qualityLimitationReason = reason;
    }
  });
  return sample;
}

export function connectionRoute(stats: RTCStatsReport): "P2P" | "TURN Relay" | "Unknown" {
  const pair = selectedCandidatePair(stats) as Record<string, unknown> | undefined;
  if (!pair) return "Unknown";
  const local = typeof pair.localCandidateId === "string" ? stats.get(pair.localCandidateId) : undefined;
  const remote = typeof pair.remoteCandidateId === "string" ? stats.get(pair.remoteCandidateId) : undefined;
  if (local?.candidateType === "relay" || remote?.candidateType === "relay") return "TURN Relay";
  return local && remote ? "P2P" : "Unknown";
}
