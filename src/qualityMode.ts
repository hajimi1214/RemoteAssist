import { videoEncoding } from "./connectionQuality.ts";
import type { VideoPreference, VideoQuality, VideoSourceSize } from "./connectionQuality.ts";

export type QualityMode = "auto" | "sharp" | "smooth" | "economy";
export const qualityModes: QualityMode[] = ["auto", "sharp", "smooth", "economy"];
export function isQualityMode(value: unknown): value is QualityMode { return typeof value === "string" && qualityModes.includes(value as QualityMode); }

/** User preference is bounded by the congestion policy; it never disables BWE. */
export function sessionEncoding(mode: QualityMode, quality: VideoQuality, source: VideoSourceSize = {}, preference: VideoPreference = "auto") {
  const encoding = videoEncoding(quality, mode === "smooth" ? "motion" : preference, source);
  const width = Number.isFinite(source.width) && source.width! > 0 ? source.width! : 0;
  const height = Number.isFinite(source.height) && source.height! > 0 ? source.height! : 0;
  if (mode === "sharp") encoding.maxBitrate = Math.min(48_000_000, Math.round(encoding.maxBitrate * 1.2));
  if (mode === "smooth") {
    if (width && height) encoding.scaleResolutionDownBy = Math.max(encoding.scaleResolutionDownBy, width / 2560, height / 1440);
    encoding.maxBitrate = Math.min(20_000_000, encoding.maxBitrate);
  }
  if (mode === "economy") {
    if (width && height) encoding.scaleResolutionDownBy = Math.max(encoding.scaleResolutionDownBy, width / 1280, height / 720);
    encoding.maxFramerate = Math.min(30, encoding.maxFramerate);
    encoding.maxBitrate = Math.min(2_200_000, encoding.maxBitrate);
  }
  return encoding;
}

export function readQualityPreference(): QualityMode {
  try { const value = localStorage.getItem("remoteassist.qualityMode"); return isQualityMode(value) ? value : "auto"; } catch { return "auto"; }
}
