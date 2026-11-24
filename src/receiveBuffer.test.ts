import assert from "node:assert/strict";
import test from "node:test";
import { receiveJitterBufferTarget } from "./receiveBuffer.ts";

test("receiver buffer asks for low latency when the path is healthy",()=>{
  assert.equal(receiveJitterBufferTarget(false),15);
  assert.equal(receiveJitterBufferTarget(false,{packetLossPercent:0.5,jitterMs:4}),15);
  assert.equal(receiveJitterBufferTarget(true),10);
  assert.equal(receiveJitterBufferTarget(true,{packetLossPercent:0.5,jitterMs:4}),10);
});

test("receiver buffer requests more headroom under measured jitter or loss",()=>{
  assert.equal(receiveJitterBufferTarget(true,{packetLossPercent:2}),40);
  assert.equal(receiveJitterBufferTarget(true,{jitterMs:12}),40);
  assert.equal(receiveJitterBufferTarget(false,{packetLossPercent:2}),30);
  assert.equal(receiveJitterBufferTarget(false,{packetLossPercent:10,jitterMs:50}),30);
});
