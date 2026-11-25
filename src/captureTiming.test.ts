import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE_TIMING_WINDOW, CaptureTimingWindow, parseCaptureTiming } from "./captureTiming.ts";

test("capture timings report bounded p50, p95, p99 and maximum only after enough changed frames",()=>{
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
  assert.equal(result?.replyP99Ms,297);
  assert.equal(result?.replyMaxMs,300);
});

test("capture timing windows reset so idle windows cannot reuse stale frame timings",()=>{
  const timing=new CaptureTimingWindow();
  for(let value=0;value<10;value++)timing.add(value,value);
  assert.equal(timing.snapshot()?.samples,10);
  timing.reset();
  assert.equal(timing.snapshot(),undefined);
});

test("capture timing parser rejects malformed, inconsistent, or oversized host reports",()=>{
  const valid={samples:100,replyP50Ms:4,replyP95Ms:8,replyP99Ms:9,replyMaxMs:10,renderSubmitP50Ms:.4,renderSubmitP95Ms:1.2,renderSubmitP99Ms:1.4,renderSubmitMaxMs:1.5};
  assert.deepEqual(parseCaptureTiming(valid),valid);
  const legacy={samples:20,replyP50Ms:4,replyP95Ms:8,renderSubmitP50Ms:.4,renderSubmitP95Ms:1.2};
  assert.deepEqual(parseCaptureTiming(legacy),legacy);
  assert.equal(parseCaptureTiming({samples:0}),undefined);
  for(const value of [null,[],{...valid,samples:1},{...valid,samples:301},{...valid,replyP50Ms:9},{...valid,replyP95Ms:8,replyP99Ms:7},{...valid,renderSubmitP95Ms:Infinity},{...valid,replyMaxMs:10_001}])assert.equal(parseCaptureTiming(value),undefined);
  assert.equal(parseCaptureTiming({...valid,samples:50}),undefined);
});

test("capture runtime telemetry validates request classes, empty responses and failure counters",()=>{
  const summary={samples:0,capture:{windowMs:5000,requests:300,pixelFrames:80,fullFrames:2,deltaFrames:78,cursorPackets:10,emptyResponses:210,failedRequests:0,deltaRectangles:92,pixelFps:16,fullFramePercent:2.5}};
  assert.deepEqual(parseCaptureTiming(summary),summary);
  const failedResponse={samples:0,capture:{...summary.capture,requests:301,failedRequests:1}};
  assert.deepEqual(parseCaptureTiming(failedResponse),failedResponse);
  assert.equal(parseCaptureTiming({...summary,capture:{...summary.capture,failedRequests:1_000_001}}),undefined);
  assert.equal(parseCaptureTiming({...summary,capture:{...summary.capture,pixelFrames:79}}),undefined);
  assert.equal(parseCaptureTiming({...summary,capture:{...summary.capture,fullFramePercent:101}}),undefined);
  assert.equal(parseCaptureTiming({...summary,capture:{...summary.capture,requests:301}}),undefined);
  assert.equal(parseCaptureTiming({...summary,capture:{...summary.capture,deltaRectangles:1}}),undefined);
  assert.equal(parseCaptureTiming({...summary,capture:{...summary.capture,pixelFps:17}}),undefined);
  assert.equal(parseCaptureTiming({...summary,capture:{...summary.capture,deltaRectangles:5_000}}),undefined);
  assert.equal(parseCaptureTiming({...summary,capture:{...summary.capture,pixelFps:16.1}}),undefined);
});
