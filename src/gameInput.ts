export const MAX_GAME_DELTA = 1024;
export type GameRelativeInput = {type: "mouse_relative"; payload: {dx: number; dy: number}};
export type NormalizedGamePointer = {x:number;y:number};

export function validGameDelta(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= MAX_GAME_DELTA;
}

export function clampGameDelta(value: number): number {
  return Number.isFinite(value) ? Math.max(-MAX_GAME_DELTA, Math.min(MAX_GAME_DELTA, Math.round(value))) : 0;
}

/** Convert one browser-locked pointer sample; zero motion is intentionally omitted. */
export function relativeMouseSample(movementX: number, movementY: number, sensitivity = 1): GameRelativeInput | null {
  if (!Number.isFinite(movementX) || !Number.isFinite(movementY) ||
      !Number.isFinite(sensitivity) || sensitivity < 0.25 || sensitivity > 4) return null;
  const dx=clampGameDelta(movementX*sensitivity), dy=clampGameDelta(movementY*sensitivity);
  return dx===0&&dy===0 ? null : {type:"mouse_relative",payload:{dx,dy}};
}

/** Preserve fractional PC mouse movement instead of rounding every DOM event. */
export class RelativeMouseAccumulator {
  private remainderX = 0;
  private remainderY = 0;
  private sensitivity?: number;

  reset(): void { this.remainderX = 0; this.remainderY = 0; this.sensitivity = undefined; }

  sample(movementX: number, movementY: number, sensitivity = 1): GameRelativeInput | null {
    if (!Number.isFinite(movementX) || !Number.isFinite(movementY) ||
        !Number.isFinite(sensitivity) || sensitivity < .25 || sensitivity > 4) {
      this.reset(); return null;
    }
    if (this.sensitivity !== sensitivity) { this.reset(); this.sensitivity = sensitivity; }
    const axis = (movement: number, remainder: number): [number, number] => {
      const scaled = movement * sensitivity;
      // An oversized/overflowing sample is bounded and never becomes a backlog.
      if (Math.abs(scaled) >= MAX_GAME_DELTA) return [Math.sign(scaled) * MAX_GAME_DELTA, 0];
      const total = scaled + remainder;
      // Tiny floating-point error must not defer the 20th 0.05-pixel sample.
      const whole = Math.trunc(total + Math.sign(total) * 1e-10);
      return [whole === 0 ? 0 : whole, total - whole];
    };
    const [dx, x] = axis(movementX, this.remainderX);
    const [dy, y] = axis(movementY, this.remainderY);
    this.remainderX = x; this.remainderY = y;
    return dx === 0 && dy === 0 ? null : {type: "mouse_relative", payload: {dx, dy}};
  }
}

/** Games consume held state; repeated DOM downs must not crowd out real edges. */
export function shouldForwardRemoteKey(type: "key_down" | "key_up", repeat: boolean, gamePointerLocked: boolean): boolean {
  return !(gamePointerLocked && type === "key_down" && repeat);
}

export function normalizedTouchpadDelta(previous: NormalizedGamePointer, current: NormalizedGamePointer, width:number, height:number, sensitivity=1.25):GameRelativeInput|null{
  if(![previous.x,previous.y,current.x,current.y,width,height,sensitivity].every(Number.isFinite)||width<=0||height<=0||sensitivity<0.25||sensitivity>4)return null;
  return relativeMouseSample((current.x-previous.x)*width,(current.y-previous.y)*height,sensitivity);
}
