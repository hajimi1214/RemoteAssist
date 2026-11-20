export type DamageRect = { x: number; y: number; width: number; height: number };
export type CaptureCursor = { x: number; y: number } | null;

export function visibleCaptureCursor(x: number, y: number, width: number, height: number): CaptureCursor {
  return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
}

/** The shader composites a 12×20 pointer over the unmodified desktop texture. */
export function captureDamage(patches: readonly DamageRect[], before: CaptureCursor, after: CaptureCursor, width: number, height: number): DamageRect[] {
  const pointerChanged = before?.x !== after?.x || before?.y !== after?.y;
  const rects: DamageRect[] = patches.map(({x, y, width, height}) => ({x, y, width, height}));
  if (pointerChanged) for (const point of [before, after]) {
    if (!point) continue;
    // One extra pixel on each side accommodates shader precision at the edge.
    const x = Math.max(0, point.x - 1), y = Math.max(0, point.y - 1);
    rects.push({x, y, width: Math.min(width, point.x + 13) - x, height: Math.min(height, point.y + 21) - y});
  }
  return rects;
}

export function damageScissor(rect: DamageRect, height: number): [number, number, number, number] {
  return [rect.x, height - rect.y - rect.height, rect.width, rect.height];
}
