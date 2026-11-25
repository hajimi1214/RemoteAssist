export const MAX_CAPTURE_FPS = 60;

/** Upper bound for one DXGI wait, derived from the sender's current FPS target. */
export function captureAcquireTimeoutMs(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) return Math.ceil(1000 / MAX_CAPTURE_FPS);
  return Math.ceil(1000 / Math.min(fps, MAX_CAPTURE_FPS));
}
