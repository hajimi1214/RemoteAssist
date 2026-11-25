import assert from "node:assert/strict";
import test from "node:test";
import { captureAcquireTimeoutMs } from "./framePacing.ts";

test("DXGI acquire timeout follows the requested sender frame interval", () => {
  assert.equal(captureAcquireTimeoutMs(60), 17);
  assert.equal(captureAcquireTimeoutMs(45), 23);
  assert.equal(captureAcquireTimeoutMs(30), 34);
  assert.equal(captureAcquireTimeoutMs(15), 67);
  assert.equal(captureAcquireTimeoutMs(0), 17);
  assert.equal(captureAcquireTimeoutMs(Number.NaN), 17);
});
