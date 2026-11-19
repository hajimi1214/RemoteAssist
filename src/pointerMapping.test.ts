import assert from "node:assert/strict";
import test from "node:test";
import { mapVideoPoint } from "./pointerMapping.ts";

test("excludes letterbox bars when displaying a widescreen desktop", () => {
  const rect = { left: 50, top: 100, width: 800, height: 800 };
  assert.deepEqual(mapVideoPoint(rect, 1920, 1080, 450, 500), { x: .5, y: .5 });
  assert.equal(mapVideoPoint(rect, 1920, 1080, 450, 110), null);
  assert.deepEqual(mapVideoPoint(rect, 1920, 1080, 50, 275), { x: 0, y: 0 });
});

test("maps portrait display bounds without including side bars", () => {
  const rect = { left: 10, top: 20, width: 1000, height: 600 };
  assert.equal(mapVideoPoint(rect, 600, 1200, 20, 320), null);
  assert.deepEqual(mapVideoPoint(rect, 600, 1200, 360, 20), { x: 0, y: 0 });
  assert.deepEqual(mapVideoPoint(rect, 600, 1200, 660, 620), { x: 1, y: 1 });
});

test("rejects unavailable video dimensions and non-finite pointer values", () => {
  const rect = { left: 0, top: 0, width: 800, height: 600 };
  assert.equal(mapVideoPoint(rect, 0, 0, 100, 100), null);
  assert.equal(mapVideoPoint(rect, 1920, 1080, NaN, 100), null);
});
