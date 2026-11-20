import assert from "node:assert/strict";
import test from "node:test";
import { appendTrend, connectionHealth, trendSegments } from "./connectionHealth.ts";
test("static desktop is not mislabeled as a dead or unhealthy connection",()=>{
  assert.equal(connectionHealth({direction:"receive",route:"P2P",fps:0,bitrateKbps:0}).severity,"normal");
  assert.equal(connectionHealth({direction:"receive",route:"Unknown"}).severity,"pending");
});
test("health advice distinguishes network buffering and processing pressure",()=>{
  assert.equal(connectionHealth({direction:"receive",route:"P2P",packetLossPercent:5}).title,"网络存在丢包");
  assert.equal(connectionHealth({direction:"send",route:"P2P",sendQueueMs:65}).title,"传输缓冲较高");
  assert.equal(connectionHealth({direction:"send",route:"P2P",qualityLimitation:"cpu"}).title,"画面处理压力较高");
});
test("trends retain only bounded numeric aggregates and age out stale data",()=>{
  let points=[] as ReturnType<typeof appendTrend>;
  for(let i=0;i<100;i++)points=appendTrend(points,{direction:"receive",route:"P2P",rttMs:i,bitrateKbps:Infinity},i*2000);
  assert.equal(points.length,30);assert.equal(points[29].bitrateKbps,undefined);assert.equal(trendSegments(points,"rttMs").join().includes("NaN"),false);
  points=appendTrend(points,{direction:"receive",route:"P2P"},400000);assert.equal(points.length,1);
});
test("missing telemetry leaves a visual gap rather than an invented trend",()=>{
  const segments=trendSegments([{at:0,rttMs:10},{at:2000},{at:4000,rttMs:20}],"rttMs");
  assert.equal(segments.length,2);
});
