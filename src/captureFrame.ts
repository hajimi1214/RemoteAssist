// Private native-to-WebView packet protocol. Pixels are uncompressed BGRA8;
// every packet is validated before the caller mutates an existing GPU texture.
export const CAPTURE_FULL_V1 = 0x40000000;
export const CAPTURE_DELTA_V1 = 0x80000000;
const maximumPixels = 33_177_600;
const maximumRects = 64;

export type CaptureBaseline = { width: number; height: number; sequence?: number };
export type CaptureRect = { x: number; y: number; width: number; height: number; pixels: Uint8Array };
export type CaptureFrame = CaptureBaseline & { kind: "full" | "delta" | "cursor"; cursorX: number; cursorY: number; rects: CaptureRect[] };

export function parseCaptureFrame(raw: ArrayBuffer, previous: CaptureBaseline | null, maximumTexture: number): CaptureFrame | null {
  if (raw.byteLength === 0) return null;
  if (raw.byteLength < 16 || raw.byteLength > 28 + maximumRects * 16 + maximumPixels * 4) throw new Error("invalid_capture_packet");
  const header = new DataView(raw), taggedWidth = header.getUint32(0, true);
  const flag = (taggedWidth & 0xc0000000) >>> 0, width = taggedWidth & 0x3fffffff, height = header.getUint32(4, true);
  if (!width || !height || width > maximumTexture || height > maximumTexture || width * height > maximumPixels) throw new Error("invalid_capture_dimensions");
  const common = { width, height, cursorX: header.getInt32(8, true), cursorY: header.getInt32(12, true) };
  if (flag === 0) {
    if (raw.byteLength === 16) {
      if (!previous || previous.width !== width || previous.height !== height) throw new Error("cursor_without_capture_baseline");
      return { ...common, kind: "cursor", sequence: previous.sequence, rects: [] };
    }
    if (raw.byteLength !== 16 + width * height * 4) throw new Error("invalid_capture_full_length");
    return { ...common, kind: "full", rects: [{ x: 0, y: 0, width, height, pixels: new Uint8Array(raw, 16) }] };
  }
  if (flag !== CAPTURE_FULL_V1 && flag !== (CAPTURE_DELTA_V1 >>> 0)) throw new Error("unknown_capture_packet");
  if (raw.byteLength < 20) throw new Error("invalid_capture_packet");
  const sequence = header.getUint32(16, true);
  if (sequence === 0 || (previous?.sequence != null && sequence <= previous.sequence)) throw new Error("stale_capture_packet");
  if (flag === CAPTURE_FULL_V1) {
    if (raw.byteLength !== 20 + width * height * 4) throw new Error("invalid_capture_full_length");
    return { ...common, sequence, kind: "full", rects: [{ x: 0, y: 0, width, height, pixels: new Uint8Array(raw, 20) }] };
  }
  if (raw.byteLength < 28 || !previous || previous.width !== width || previous.height !== height || previous.sequence == null) throw new Error("delta_without_capture_baseline");
  const baseSequence = header.getUint32(20, true), count = header.getUint32(24, true);
  if (baseSequence !== previous.sequence || sequence !== baseSequence + 1 || count === 0 || count > maximumRects) throw new Error("invalid_capture_delta_sequence");
  const rects: CaptureRect[] = [];
  let offset = 28;
  for (let index = 0; index < count; index++) {
    if (offset + 16 > raw.byteLength) throw new Error("truncated_capture_rect");
    const x = header.getUint32(offset, true), y = header.getUint32(offset + 4, true), w = header.getUint32(offset + 8, true), h = header.getUint32(offset + 12, true);
    offset += 16;
    const length = w * h * 4;
    if (!w || !h || x >= width || y >= height || w > width - x || h > height - y || length > raw.byteLength - offset) throw new Error("invalid_capture_rect");
    if (rects.some(rect => x < rect.x + rect.width && x + w > rect.x && y < rect.y + rect.height && y + h > rect.y)) throw new Error("overlapping_capture_rects");
    rects.push({ x, y, width: w, height: h, pixels: new Uint8Array(raw, offset, length) }); offset += length;
  }
  if (offset !== raw.byteLength) throw new Error("trailing_capture_bytes");
  return { ...common, sequence, kind: "delta", rects };
}
