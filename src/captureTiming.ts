export const CAPTURE_TIMING_WINDOW = 300;
const MIN_CAPTURE_TIMING_SAMPLES = 10;
const MIN_TAIL_TIMING_SAMPLES = 100;

export interface CaptureRuntimeSummary {
  windowMs: number;
  requests: number;
  pixelFrames: number;
  fullFrames: number;
  deltaFrames: number;
  cursorPackets: number;
  emptyResponses: number;
  failedRequests: number;
  deltaRectangles: number;
  pixelFps?: number;
  fullFramePercent?: number;
}

export interface CaptureTimingSummary {
  samples: number;
  replyP50Ms?: number;
  replyP95Ms?: number;
  replyP99Ms?: number;
  replyMaxMs?: number;
  renderSubmitP50Ms?: number;
  renderSubmitP95Ms?: number;
  renderSubmitP99Ms?: number;
  renderSubmitMaxMs?: number;
  gpuImageTiming?: GpuImageTimingSummary;
  capture?: CaptureRuntimeSummary;
}

export interface GpuImageTimingSummary {
  samples: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms?: number;
  maxMs?: number;
}

type CaptureTimingSample = { replyMs: number; renderSubmitMs: number };

/** Bounded timing-only history. It never retains frame, input, or network payloads. */
export class CaptureTimingWindow {
  private readonly values: CaptureTimingSample[] = [];
  private readonly gpuImageValues: number[] = [];

  add(replyMs: number, renderSubmitMs: number): void {
    if (!Number.isFinite(replyMs) || replyMs < 0 || !Number.isFinite(renderSubmitMs) || renderSubmitMs < 0) return;
    this.values.push({ replyMs, renderSubmitMs });
    if (this.values.length > CAPTURE_TIMING_WINDOW) this.values.shift();
  }

  addGpuImageTime(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 1_000) return;
    this.gpuImageValues.push(milliseconds);
    if (this.gpuImageValues.length > CAPTURE_TIMING_WINDOW) this.gpuImageValues.shift();
  }

  reset(): void { this.values.length = 0; this.gpuImageValues.length = 0; }

  snapshot(): CaptureTimingSummary | undefined {
    const hasCaptureSamples = this.values.length >= MIN_CAPTURE_TIMING_SAMPLES;
    const hasGpuSamples = this.gpuImageValues.length >= MIN_CAPTURE_TIMING_SAMPLES;
    if (!hasCaptureSamples && !hasGpuSamples) return undefined;
    const reply = hasCaptureSamples ? this.values.map(value => value.replyMs) : [];
    const renderSubmit = hasCaptureSamples ? this.values.map(value => value.renderSubmitMs) : [];
    const gpuImage = hasGpuSamples ? this.gpuImageValues.slice() : [];
    return {
      samples: this.values.length,
      ...(hasCaptureSamples ? { replyP50Ms: percentile(reply, .5), replyP95Ms: percentile(reply, .95) } : {}),
      ...(reply.length >= MIN_TAIL_TIMING_SAMPLES ? { replyP99Ms: percentile(reply, .99), replyMaxMs: Math.max(...reply) } : {}),
      ...(hasCaptureSamples ? { renderSubmitP50Ms: percentile(renderSubmit, .5), renderSubmitP95Ms: percentile(renderSubmit, .95) } : {}),
      ...(renderSubmit.length >= MIN_TAIL_TIMING_SAMPLES ? { renderSubmitP99Ms: percentile(renderSubmit, .99), renderSubmitMaxMs: Math.max(...renderSubmit) } : {}),
      ...(hasGpuSamples ? { gpuImageTiming: summarizeGpuImageTimes(gpuImage) } : {}),
    };
  }
}

/** Treat the optional host report as untrusted DataChannel input. */
export function parseCaptureTiming(value: unknown): CaptureTimingSummary | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const sample = value as Record<string, unknown>;
  if (!Number.isSafeInteger(sample.samples) || (sample.samples as number) < 0 || (sample.samples as number) > CAPTURE_TIMING_WINDOW) return undefined;
  const baseFields = [sample.replyP50Ms, sample.replyP95Ms, sample.renderSubmitP50Ms, sample.renderSubmitP95Ms];
  const hasBase = baseFields.some(field => field !== undefined);
  if (hasBase && (sample.samples as number) < MIN_CAPTURE_TIMING_SAMPLES) return undefined;
  if (hasBase && !baseFields.every(field => typeof field === "number" && Number.isFinite(field) && field >= 0 && field <= 10_000)) return undefined;
  const [replyP50Ms, replyP95Ms, renderSubmitP50Ms, renderSubmitP95Ms] = hasBase ? baseFields as number[] : [];
  if (hasBase && (replyP50Ms > replyP95Ms || renderSubmitP50Ms > renderSubmitP95Ms)) return undefined;
  const tailFields = [sample.replyP99Ms, sample.replyMaxMs, sample.renderSubmitP99Ms, sample.renderSubmitMaxMs];
  const hasTail = tailFields.some(field => field !== undefined);
  if (hasTail && ((sample.samples as number) < MIN_TAIL_TIMING_SAMPLES
      || !tailFields.every(field => typeof field === "number" && Number.isFinite(field) && field >= 0 && field <= 10_000))) return undefined;
  const [replyP99Ms, replyMaxMs, renderSubmitP99Ms, renderSubmitMaxMs] = hasTail ? tailFields as number[] : [];
  if (hasTail && (replyP95Ms > replyP99Ms || replyP99Ms > replyMaxMs || renderSubmitP95Ms > renderSubmitP99Ms || renderSubmitP99Ms > renderSubmitMaxMs)) return undefined;
  const capture = parseCaptureRuntimeSummary(sample.capture);
  if (sample.capture !== undefined && !capture) return undefined;
  const gpuImageTiming = parseGpuImageTiming(sample.gpuImageTiming);
  if (sample.gpuImageTiming !== undefined && !gpuImageTiming) return undefined;
  if ((sample.samples as number) === 0 && !hasBase && !capture && !gpuImageTiming) return undefined;
  return {
    samples: sample.samples as number,
    ...(hasBase ? { replyP50Ms, replyP95Ms, renderSubmitP50Ms, renderSubmitP95Ms } : {}),
    ...(hasTail ? { replyP99Ms, replyMaxMs, renderSubmitP99Ms, renderSubmitMaxMs } : {}),
    ...(gpuImageTiming ? { gpuImageTiming } : {}),
    ...(capture ? { capture } : {})
  };
}

function parseGpuImageTiming(value: unknown): GpuImageTimingSummary | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const sample = value as Record<string, unknown>;
  if (!Number.isSafeInteger(sample.samples) || (sample.samples as number) < MIN_CAPTURE_TIMING_SAMPLES
    || (sample.samples as number) > CAPTURE_TIMING_WINDOW) return undefined;
  const base = [sample.p50Ms, sample.p95Ms];
  if (!base.every(field => typeof field === "number" && Number.isFinite(field) && field >= 0 && field <= 1_000)) return undefined;
  const [p50Ms, p95Ms] = base as number[];
  if (p50Ms > p95Ms) return undefined;
  const tail = [sample.p99Ms, sample.maxMs];
  const hasTail = tail.some(field => field !== undefined);
  if (hasTail && ((sample.samples as number) < MIN_TAIL_TIMING_SAMPLES
    || !tail.every(field => typeof field === "number" && Number.isFinite(field) && field >= 0 && field <= 1_000))) return undefined;
  const [p99Ms, maxMs] = hasTail ? tail as number[] : [];
  if (hasTail && (p95Ms > p99Ms || p99Ms > maxMs)) return undefined;
  return {
    samples: sample.samples as number,
    p50Ms,
    p95Ms,
    ...(hasTail ? { p99Ms, maxMs } : {}),
  };
}

function summarizeGpuImageTimes(values: number[]): GpuImageTimingSummary {
  return {
    samples: values.length,
    p50Ms: percentile(values, .5),
    p95Ms: percentile(values, .95),
    ...(values.length >= MIN_TAIL_TIMING_SAMPLES ? {
      p99Ms: percentile(values, .99),
      maxMs: Math.max(...values),
    } : {}),
  };
}

function parseCaptureRuntimeSummary(value: unknown): CaptureRuntimeSummary | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const sample = value as Record<string, unknown>;
  const counters = [sample.requests, sample.pixelFrames, sample.fullFrames, sample.deltaFrames,
    sample.cursorPackets, sample.emptyResponses, sample.failedRequests, sample.deltaRectangles];
  if (!counters.every(item => Number.isSafeInteger(item) && (item as number) >= 0 && (item as number) <= 1_000_000)) return undefined;
  if (typeof sample.windowMs !== "number" || !Number.isFinite(sample.windowMs) || sample.windowMs <= 0 || sample.windowMs > 60_000) return undefined;
  const [requests, pixelFrames, fullFrames, deltaFrames, cursorPackets, emptyResponses, failedRequests, deltaRectangles] = counters as number[];
  if (pixelFrames !== fullFrames + deltaFrames
    || requests !== pixelFrames + cursorPackets + emptyResponses + failedRequests
    || deltaRectangles < deltaFrames
    || deltaRectangles > deltaFrames * 64) return undefined;
  const pixelFps = sample.pixelFps;
  const fullFramePercent = sample.fullFramePercent;
  if (pixelFps !== undefined && (typeof pixelFps !== "number" || !Number.isFinite(pixelFps) || pixelFps < 0 || pixelFps > 1000)) return undefined;
  if (fullFramePercent !== undefined && (typeof fullFramePercent !== "number" || !Number.isFinite(fullFramePercent) || fullFramePercent < 0 || fullFramePercent > 100)) return undefined;
  const expectedFps = Math.round(pixelFrames * 1000 / sample.windowMs * 10) / 10;
  const expectedFullFramePercent = pixelFrames ? Math.round(fullFrames * 10_000 / pixelFrames) / 100 : 0;
  if (pixelFps !== undefined && pixelFps !== expectedFps) return undefined;
  if (fullFramePercent !== undefined && fullFramePercent !== expectedFullFramePercent) return undefined;
  return { windowMs: sample.windowMs, requests, pixelFrames, fullFrames, deltaFrames, cursorPackets,
    emptyResponses, failedRequests, deltaRectangles, ...(pixelFps !== undefined ? { pixelFps } : {}),
    ...(fullFramePercent !== undefined ? { fullFramePercent } : {}) };
}

function percentile(values: number[], fraction: number): number {
  values.sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(values.length * fraction) - 1);
  return Math.round(values[index] * 10) / 10;
}
