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

export function normalizedTouchpadDelta(previous: NormalizedGamePointer, current: NormalizedGamePointer, width:number, height:number, sensitivity=1.25):GameRelativeInput|null{
  if(![previous.x,previous.y,current.x,current.y,width,height,sensitivity].every(Number.isFinite)||width<=0||height<=0||sensitivity<0.25||sensitivity>4)return null;
  return relativeMouseSample((current.x-previous.x)*width,(current.y-previous.y)*height,sensitivity);
}
