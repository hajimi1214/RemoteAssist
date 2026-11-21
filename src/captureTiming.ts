export const CAPTURE_TIMING_WINDOW = 300;
const MIN_CAPTURE_TIMING_SAMPLES = 10;

export interface CaptureTimingSummary {
  samples: number;
  replyP50Ms: number;
  replyP95Ms: number;
  renderSubmitP50Ms: number;
  renderSubmitP95Ms: number;
}

type CaptureTimingSample = { replyMs: number; renderSubmitMs: number };

/** Bounded timing-only history. It never retains frame, input, or network payloads. */
export class CaptureTimingWindow {
  private readonly values: CaptureTimingSample[] = [];

  add(replyMs: number, renderSubmitMs: number): void {
    if (!Number.isFinite(replyMs) || replyMs < 0 || !Number.isFinite(renderSubmitMs) || renderSubmitMs < 0) return;
    this.values.push({ replyMs, renderSubmitMs });
    if (this.values.length > CAPTURE_TIMING_WINDOW) this.values.shift();
  }

  snapshot(): CaptureTimingSummary | undefined {
    if (this.values.length < MIN_CAPTURE_TIMING_SAMPLES) return undefined;
    return {
      samples: this.values.length,
      replyP50Ms: percentile(this.values.map(value => value.replyMs), .5),
      replyP95Ms: percentile(this.values.map(value => value.replyMs), .95),
      renderSubmitP50Ms: percentile(this.values.map(value => value.renderSubmitMs), .5),
      renderSubmitP95Ms: percentile(this.values.map(value => value.renderSubmitMs), .95),
    };
  }
}

/** Treat the optional host report as untrusted DataChannel input. */
export function parseCaptureTiming(value: unknown): CaptureTimingSummary | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const sample = value as Record<string, unknown>;
  if (!Number.isSafeInteger(sample.samples) || (sample.samples as number) < MIN_CAPTURE_TIMING_SAMPLES || (sample.samples as number) > CAPTURE_TIMING_WINDOW) return undefined;
  const fields = [sample.replyP50Ms, sample.replyP95Ms, sample.renderSubmitP50Ms, sample.renderSubmitP95Ms];
  if (!fields.every(field => typeof field === "number" && Number.isFinite(field) && field >= 0 && field <= 10_000)) return undefined;
  const [replyP50Ms, replyP95Ms, renderSubmitP50Ms, renderSubmitP95Ms] = fields as number[];
  if (replyP50Ms > replyP95Ms || renderSubmitP50Ms > renderSubmitP95Ms) return undefined;
  return { samples: sample.samples as number, replyP50Ms, replyP95Ms, renderSubmitP50Ms, renderSubmitP95Ms };
}

function percentile(values: number[], fraction: number): number {
  values.sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(values.length * fraction) - 1);
  return Math.round(values[index] * 10) / 10;
}
