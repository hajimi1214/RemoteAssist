import type { VideoTelemetry } from "./videoTelemetry.ts";

function number(value: number | undefined, unit: string, digits = 1): string {
  return value == null || !Number.isFinite(value) ? "不可用" : `${Number(value.toFixed(digits))} ${unit}`;
}

export function createDiagnosticReport(
  sample: VideoTelemetry,
  version: string,
  generatedAt: Date = new Date()
): string {
  const protocol = [sample.localProtocol, sample.remoteProtocol].filter(Boolean).join("/") || "未知";
  const route = sample.route === "TURN Relay"
    ? `中继 ${sample.relayProtocol?.toUpperCase() ?? "传输未知"} · 媒体 ${protocol}`
    : sample.route === "P2P" ? `直连 · ${protocol}` : "未知";
  const report = [
    `RemoteAssist ${version} 连接诊断`,
    `生成时间：${generatedAt.toISOString()}`,
    `采样方向：${sample.direction === "send" ? "发送端" : "接收端"}`,
    `传输路径：${route}`,
    `编码格式：${sample.codec ?? "不可用"}`,
    `编码实现：${sample.encoderImplementation ?? "不可用"}`,
    `解码实现：${sample.decoderImplementation ?? "不可用"}`,
    `画质模式：${sample.qualityMode ?? "不可用"}`,
    `编码器限制：${sample.qualityLimitation ?? "不可用"}`,
    `视频尺寸：${sample.width && sample.height ? `${sample.width}×${sample.height}` : "不可用"}`,
    `当前编码/解码帧率：${number(sample.fps, "fps")}`,
    `当前码率：${number(sample.bitrateKbps, "kbps")}`,
    `RTT：${number(sample.rttMs, "ms")}`,
    `丢包：${number(sample.packetLossPercent, "%")}`,
    `抖动：${number(sample.jitterMs, "ms")}`,
    `发送排队：${number(sample.sendQueueMs, "ms")}`,
    `编码耗时：${number(sample.encodeMs, "ms")}`,
    `解码耗时：${number(sample.decodeMs, "ms")}`,
    `接收缓冲停留：${number(sample.jitterBufferMs, "ms")}`,
    `间隔丢弃帧：${number(sample.framesDropped, "帧", 0)}`,
    `累计冻结次数：${number(sample.freezes, "次", 0)}`,
    `编码目标上限：${number(sample.targetFps, "fps", 0)} / ${number(sample.targetBitrateKbps, "kbps", 0)}`,
  ];
  if (sample.captureTiming) {
    report.push(`采集窗口样本：${sample.captureTiming.samples}`);
    report.push(`取帧响应 P50/P95/P99/最大：${number(sample.captureTiming.replyP50Ms, "ms")} / ${number(sample.captureTiming.replyP95Ms, "ms")} / ${number(sample.captureTiming.replyP99Ms, "ms")} / ${number(sample.captureTiming.replyMaxMs, "ms")}`);
    report.push(`绘制提交 P50/P95/P99/最大：${number(sample.captureTiming.renderSubmitP50Ms, "ms")} / ${number(sample.captureTiming.renderSubmitP95Ms, "ms")} / ${number(sample.captureTiming.renderSubmitP99Ms, "ms")} / ${number(sample.captureTiming.renderSubmitMaxMs, "ms")}`);
    const capture = sample.captureTiming.capture;
    if (capture) {
      report.push(`主机采集窗口：${number(capture.windowMs, "ms")} · 请求 ${capture.requests} · 像素帧 ${capture.pixelFrames} · 全帧 ${capture.fullFrames} · 增量 ${capture.deltaFrames} · 区域 ${capture.deltaRectangles} · 光标包 ${capture.cursorPackets} · 空响应 ${capture.emptyResponses} · 失败 ${capture.failedRequests}`);
      report.push(`主机采集帧率 / 全帧比例：${number(capture.pixelFps, "fps")} / ${number(capture.fullFramePercent, "%")}`);
    }
  }
  if (sample.presentation) {
    report.push(`WebView 呈现回调 FPS：${number(sample.presentation.fps, "fps")}`);
    report.push(`回调间隔 P50/P95/P99/最大：${number(sample.presentation.intervalP50Ms, "ms")} / ${number(sample.presentation.intervalP95Ms, "ms")} / ${number(sample.presentation.intervalP99Ms, "ms")} / ${number(sample.presentation.intervalMaxMs, "ms")}`);
    report.push(`呈现回调窗口帧数：${sample.presentation.presentedFrames}`);
  }
  report.push("RTT 和呈现回调均不代表鼠标输入到物理屏幕的端到端延迟。");
  return report.join("\n");
}
