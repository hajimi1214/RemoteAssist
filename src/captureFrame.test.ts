import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE_DELTA_V1, CAPTURE_FULL_V1, parseCaptureFrame } from "./captureFrame.ts";
function full(sequence = 1, width = 8, height = 6) {
  const raw = new ArrayBuffer(20 + width * height * 4), d = new DataView(raw);
  d.setUint32(0, CAPTURE_FULL_V1 | width, true); d.setUint32(4, height, true); d.setInt32(8, -1, true); d.setInt32(12, -1, true); d.setUint32(16, sequence, true);
  return raw;
}
function delta(rects = [{ x: 2, y: 1, width: 3, height: 2 }], sequence = 2, base = 1) {
  const size = 28 + rects.reduce((sum, rect) => sum + 16 + rect.width * rect.height * 4, 0), raw = new ArrayBuffer(size), d = new DataView(raw);
  d.setUint32(0, CAPTURE_DELTA_V1 | 8, true); d.setUint32(4, 6, true); d.setUint32(16, sequence, true); d.setUint32(20, base, true); d.setUint32(24, rects.length, true);
  let offset = 28;
  for (const rect of rects) { [rect.x, rect.y, rect.width, rect.height].forEach((n, i) => d.setUint32(offset + i * 4, n, true)); offset += 16; new Uint8Array(raw, offset, rect.width * rect.height * 4).fill(173); offset += rect.width * rect.height * 4; }
  return raw;
}
test("full baseline, dirty patch and cursor update retain dimensions and frame order", () => {
  const initial = parseCaptureFrame(full(), null, 16384)!; assert.equal(initial.kind, "full"); assert.equal(initial.sequence, 1);
  const patch = parseCaptureFrame(delta(), initial, 16384)!; assert.equal(patch.kind, "delta"); assert.deepEqual([patch.rects[0].x, patch.rects[0].y, patch.rects[0].width, patch.rects[0].height], [2, 1, 3, 2]); assert.equal(patch.rects[0].pixels[0], 173);
  const cursor = new ArrayBuffer(16), header = new DataView(cursor); header.setUint32(0, 8, true); header.setUint32(4, 6, true);
  assert.equal(parseCaptureFrame(cursor, patch, 16384)?.sequence, 2);
  assert.equal(parseCaptureFrame(new ArrayBuffer(0), initial, 16384), null);
});
test("delta is rejected without its exact baseline and stale full frames cannot rewind it", () => {
  const base = parseCaptureFrame(full(), null, 16384)!;
  assert.throws(() => parseCaptureFrame(delta(), null, 16384));
  assert.throws(() => parseCaptureFrame(delta(), { width: 7, height: 6, sequence: 1 }, 16384));
  assert.throws(() => parseCaptureFrame(delta(undefined, 3, 2), base, 16384));
  assert.throws(() => parseCaptureFrame(delta(undefined, 4, 1), base, 16384));
  assert.throws(() => parseCaptureFrame(full(), base, 16384));
});
test("a later full frame replaces a delta baseline and permits clean recovery and resizing", () => {
  const initial=parseCaptureFrame(full(),null,16384)!;
  const patched=parseCaptureFrame(delta(),initial,16384)!;
  const replacement=parseCaptureFrame(full(3),patched,16384)!;
  assert.equal(replacement.kind,"full");assert.equal(replacement.sequence,3);
  assert.equal(parseCaptureFrame(delta(undefined,4,3),replacement,16384)?.sequence,4);
  // A full image is self-contained, so it may bridge a lost intermediate image.
  const recovered=parseCaptureFrame(full(8),patched,16384)!;
  assert.equal(recovered.sequence,8);
  assert.throws(()=>parseCaptureFrame(delta(undefined,3,2),recovered,16384));
  const resized=parseCaptureFrame(full(9,4,3),recovered,16384)!;
  assert.deepEqual([resized.width,resized.height,resized.rects[0].pixels.length],[4,3,48]);
  assert.throws(()=>parseCaptureFrame(delta(undefined,10,9),resized,16384));
});
test("patch bounds, overlaps, truncation, unknown op and trailing bytes fail before texture update", () => {
  const base = parseCaptureFrame(full(), null, 16384)!;
  for (const raw of [delta([{ x: 7, y: 1, width: 3, height: 2 }]), delta([{ x: 1, y: 1, width: 2, height: 2 }, { x: 2, y: 2, width: 2, height: 2 }]), delta().slice(0, -1), new Uint8Array([...new Uint8Array(delta()), 0]).buffer]) assert.throws(() => parseCaptureFrame(raw, base, 16384));
  const unknown = full(); new DataView(unknown).setUint32(0, 0xc0000008, true); assert.throws(() => parseCaptureFrame(unknown, base, 16384));
  assert.throws(() => parseCaptureFrame(full(), null, 7));
  const zero = full(); new DataView(zero).setUint32(4, 0, true); assert.throws(() => parseCaptureFrame(zero, null, 16384));
});
test("a small patch reconstructs the same pixels as the full desktop", () => {
  const baseline = parseCaptureFrame(full(), null, 16384)!, patch = parseCaptureFrame(delta(), baseline, 16384)!;
  const pixels = new Uint8Array(baseline.rects[0].pixels), expected = new Uint8Array(pixels.length);
  for (let y = 1; y < 3; y++) for (let x = 2; x < 5; x++) expected.fill(173, (y * 8 + x) * 4, (y * 8 + x + 1) * 4);
  for (const rect of patch.rects) for (let row = 0; row < rect.height; row++) pixels.set(rect.pixels.subarray(row * rect.width * 4, (row + 1) * rect.width * 4), ((rect.y + row) * 8 + rect.x) * 4);
  assert.deepEqual(pixels, expected);
});
