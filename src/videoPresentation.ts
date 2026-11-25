export const PRESENTATION_WINDOW_MS = 2_000;
export const PRESENTATION_WINDOW_SAMPLES = 300;
const MIN_PRESENTATION_SAMPLES = 10;
const MIN_TAIL_PRESENTATION_SAMPLES = 100;
const SUMMARY_INTERVAL_MS = 250;
const PRESENTATION_COMPACT_THRESHOLD = 32;

export interface VideoPresentationSummary {
  samples: number;
  presentedFrames: number;
  fps: number;
  intervalP50Ms: number;
  intervalP95Ms: number;
  intervalP99Ms?: number;
  intervalMaxMs?: number;
}

type PresentedFrameSample = { at: number; frameCount: number };

/** Measures WebView video-frame callbacks. It does not measure panel scanout or input-to-photon delay. */
export class VideoPresentationWindow {
  private samples: PresentedFrameSample[] = [];
  private firstSample = 0;
  private lastSummaryAt = -Infinity;

  add(at: number, presentedFrames: number): VideoPresentationSummary | undefined {
    if (!Number.isFinite(at) || !Number.isSafeInteger(presentedFrames) || presentedFrames < 0) return undefined;
    const previous = this.samples.at(-1);
    if (previous && (at <= previous.at || presentedFrames <= previous.frameCount)) {
      if (at <= previous.at || presentedFrames < previous.frameCount) {
        this.samples = [];
        this.firstSample = 0;
      }
      if (presentedFrames <= previous.frameCount) return undefined;
    }
    if (presentedFrames < 1) return undefined;
    this.samples.push({ at, frameCount: presentedFrames });
    while (this.firstSample < this.samples.length
      && (at - this.samples[this.firstSample].at > PRESENTATION_WINDOW_MS
        || this.samples.length - this.firstSample > PRESENTATION_WINDOW_SAMPLES)) {
      this.firstSample++;
    }
    if (this.firstSample >= PRESENTATION_COMPACT_THRESHOLD) {
      this.samples = this.samples.slice(this.firstSample);
      this.firstSample = 0;
    }
    if (at - this.lastSummaryAt < SUMMARY_INTERVAL_MS) return undefined;
    const summary = this.snapshot(at);
    if (summary) this.lastSummaryAt = at;
    return summary;
  }

  reset(): void { this.samples = []; this.firstSample = 0; this.lastSummaryAt = -Infinity; }

  private snapshot(now: number): VideoPresentationSummary | undefined {
    const samples = this.samples.slice(this.firstSample);
    if (samples.length < MIN_PRESENTATION_SAMPLES) return undefined;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsed = last.at - first.at;
    const presentedFrames = last.frameCount - first.frameCount;
    if (elapsed <= 0 || presentedFrames <= 0 || now - last.at > 500) return undefined;
    const intervals = samples.slice(1).map((sample, index) => sample.at - samples[index].at);
    return {
      samples: intervals.length,
      presentedFrames,
      fps: Math.round(presentedFrames * 1000 / elapsed * 10) / 10,
      intervalP50Ms: percentile(intervals, .5),
      intervalP95Ms: percentile(intervals, .95),
      ...(intervals.length >= MIN_TAIL_PRESENTATION_SAMPLES ? {
        intervalP99Ms: percentile(intervals, .99),
        intervalMaxMs: Math.round(Math.max(...intervals) * 10) / 10,
      } : {}),
    };
  }
}

function percentile(values: number[], fraction: number): number {
  values.sort((left, right) => left - right);
  return Math.round(values[Math.max(0, Math.ceil(values.length * fraction) - 1)] * 10) / 10;
}
