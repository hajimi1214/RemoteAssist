import assert from "node:assert/strict";
import test from "node:test";
import { createDiagnosticReport } from "./diagnosticReport.ts";
import type { VideoTelemetry } from "./videoTelemetry.ts";

test("diagnostic export includes measured media, capture and presentation fields without identifiers", () => {
  const sample: VideoTelemetry = {
    direction: "receive", route: "TURN Relay", relayProtocol: "udp", localProtocol: "udp", remoteProtocol: "udp",
    codec: "H264", decoderImplementation: "D3D11VideoDecoder", width: 1920, height: 1080, fps: 59.8,
    bitrateKbps: 8000, rttMs: 24, packetLossPercent: 0.2, jitterMs: 4, decodeMs: 2.5,
    jitterBufferMs: 10, framesDropped: 1, freezes: 0, qualityMode: "sharp",
    captureTiming: { samples: 100, replyP50Ms: 4, replyP95Ms: 8, replyP99Ms: 9, replyMaxMs: 10,
      renderSubmitP50Ms: 1, renderSubmitP95Ms: 3, renderSubmitP99Ms: 4, renderSubmitMaxMs: 5,
      gpuImageTiming: { samples: 100, p50Ms: 0.8, p95Ms: 1.2, p99Ms: 1.8, maxMs: 2.4 },
      capture: { windowMs: 2000, requests: 120, pixelFrames: 110, fullFrames: 2, deltaFrames: 108,
        cursorPackets: 5, emptyResponses: 5, failedRequests: 0, deltaRectangles: 120, pixelFps: 55, fullFramePercent: 1.82 } },
    presentation: { samples: 99, presentedFrames: 100, fps: 59.9, intervalP50Ms: 16.7, intervalP95Ms: 18,
      intervalP99Ms: 20, intervalMaxMs: 22 }
  };
  const report = createDiagnosticReport(sample, "0.16.0-alpha", new Date("2026-11-25T00:00:00Z"));
  assert.match(report, /中继 UDP/);
  assert.match(report, /D3D11VideoDecoder/);
  assert.match(report, /全帧 2 · 增量 108/);
  assert.match(report, /GPU 图像更新 P50\/P95\/P99\/最大：0\.8 ms \/ 1\.2 ms \/ 1\.8 ms \/ 2\.4 ms/);
  assert.match(report, /WebView 呈现回调 FPS：59\.9 fps/);
  assert.match(report, /端到端延迟/);
  for (const sensitiveLabel of ["sessionToken", "Authorization", "candidateAddress", "画面像素", "键盘内容"]) assert.equal(report.includes(sensitiveLabel), false);
});

test("diagnostic export labels unavailable samples instead of inventing zero", () => {
  const report = createDiagnosticReport({ direction: "send", route: "Unknown" }, "0.16.0-alpha");
  assert.match(report, /RTT：不可用/);
  assert.match(report, /当前码率：不可用/);
  assert.match(report, /编码实现：不可用/);
});
