import assert from "node:assert/strict";
import test from "node:test";
import { isQualityMode, sessionEncoding } from "./qualityMode.ts";

test("quality controls accept only defined modes", () => {
  for (const value of ["auto","sharp","smooth","economy"]) assert.ok(isQualityMode(value));
  for (const value of ["4k", {}, null, 60, "SHARP"]) assert.equal(isQualityMode(value),false);
});
test("clear mode preserves 4K60 target with bounded bitrate", () => {
  const encoding=sessionEncoding("sharp","Sharp",{width:3840,height:2160});
  assert.equal(encoding.scaleResolutionDownBy,1);assert.equal(encoding.maxFramerate,60);assert.equal(encoding.maxBitrate,48_000_000);
  assert.equal(sessionEncoding("sharp","Economy",{width:3840,height:2160}).maxFramerate,15);
  assert.equal(sessionEncoding("sharp","Economy",{width:3840,height:2160}).scaleResolutionDownBy,2);
});
test("smooth mode trades some resolution for encoder headroom without upscaling", () => {
  const encoding=sessionEncoding("smooth","Sharp",{width:3840,height:2160});
  assert.equal(encoding.scaleResolutionDownBy,1.5);assert.equal(encoding.maxFramerate,60);assert.equal(encoding.maxBitrate,20_000_000);
  assert.equal(sessionEncoding("smooth","Sharp",{width:1280,height:720}).scaleResolutionDownBy,1);
});
test("economy mode caps resolution, frame rate and bitrate yet yields to congestion", () => {
  const encoding=sessionEncoding("economy","Sharp",{width:3840,height:2160});
  assert.equal(encoding.scaleResolutionDownBy,3);assert.equal(encoding.maxFramerate,30);assert.equal(encoding.maxBitrate,2_200_000);
  assert.equal(sessionEncoding("economy","Economy",{width:1280,height:720}).maxFramerate,15);
});
test("invalid source telemetry cannot produce invalid settings", () => {
  for(const mode of ["auto","sharp","smooth","economy"] as const) {
    const e=sessionEncoding(mode,"Sharp",{width:Infinity,height:NaN});
    assert.ok(Number.isFinite(e.maxBitrate)&&Number.isFinite(e.scaleResolutionDownBy)&&e.scaleResolutionDownBy>=1);
  }
});
