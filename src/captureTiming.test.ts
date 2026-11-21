import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE_TIMING_WINDOW, CaptureTimingWindow, parseCaptureTiming } from "./captureTiming.ts";

test("capture timings report bounded p50 and p95 only after enough changed frames",()=>{
  const timing=new CaptureTimingWindow();
  for(let value=0;value<9;value++)timing.add(value,value*2);
  assert.equal(timing.snapshot(),undefined);
  timing.add(9,18);
  assert.deepEqual(timing.snapshot(),{samples:10,replyP50Ms:4,replyP95Ms:9,renderSubmitP50Ms:8,renderSubmitP95Ms:18});
});

test("capture timing history stays bounded and ignores invalid measurements",()=>{
  const timing=new CaptureTimingWindow();
  timing.add(Number.NaN,1);timing.add(1,Number.POSITIVE_INFINITY);timing.add(-1,1);
  for(let value=0;value<=CAPTURE_TIMING_WINDOW;value++)timing.add(value,value);
  const result=timing.snapshot();
  assert.equal(result?.samples,CAPTURE_TIMING_WINDOW);
  assert.equal(result?.replyP50Ms,150);
  assert.equal(result?.replyP95Ms,285);
});

test("capture timing parser rejects malformed, inconsistent, or oversized host reports",()=>{
  const valid={samples:20,replyP50Ms:4,replyP95Ms:8,renderSubmitP50Ms:.4,renderSubmitP95Ms:1.2};
  assert.deepEqual(parseCaptureTiming(valid),valid);
  for(const value of [null,[],{...valid,samples:1},{...valid,samples:301},{...valid,replyP50Ms:9},{...valid,renderSubmitP95Ms:Infinity},{...valid,replyP95Ms:10_001}])assert.equal(parseCaptureTiming(value),undefined);
});
