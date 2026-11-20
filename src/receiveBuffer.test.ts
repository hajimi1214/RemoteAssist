import assert from "node:assert/strict";
import test from "node:test";
import { receiveJitterBufferTarget } from "./receiveBuffer.ts";

test("game buffer asks for low latency when the path is healthy",()=>{
  assert.equal(receiveJitterBufferTarget(true),20);
  assert.equal(receiveJitterBufferTarget(true,{packetLossPercent:0.5,jitterMs:4}),20);
});

test("game buffer requests more headroom under measured jitter or loss",()=>{
  assert.equal(receiveJitterBufferTarget(true,{packetLossPercent:2}),45);
  assert.equal(receiveJitterBufferTarget(true,{jitterMs:12}),45);
  assert.equal(receiveJitterBufferTarget(false,{packetLossPercent:10,jitterMs:50}),30);
});
