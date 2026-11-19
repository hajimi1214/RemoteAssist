export interface ViewportRect { left: number; top: number; width: number; height: number }

// The video uses object-fit: contain. Coordinates must refer to the image,
// excluding pillarbox/letterbox bars, rather than the surrounding element.
export function mapVideoPoint(
  rect: ViewportRect, videoWidth: number, videoHeight: number, clientX: number, clientY: number
): { x: number; y: number } | null {
  if (![rect.left, rect.top, rect.width, rect.height, videoWidth, videoHeight, clientX, clientY].every(Number.isFinite) ||
      rect.width <= 0 || rect.height <= 0 || videoWidth <= 0 || videoHeight <= 0) return null;
  const scale = Math.min(rect.width / videoWidth, rect.height / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  const x = (clientX - rect.left - (rect.width - width) / 2) / width;
  const y = (clientY - rect.top - (rect.height - height) / 2) / height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}
