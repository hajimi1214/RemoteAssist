export type View = "Dashboard" | "My Devices" | "Remote Assist" | "Sessions" | "Settings";
export type AssistMode = "share" | "control";
export type Theme = "system" | "light" | "dark";

export const pages: Record<View, { title: string; description: string }> = {
  Dashboard: { title: "工作台", description: "设备、连接和协助入口，都在这里。" },
  "My Devices": { title: "我的设备", description: "管理设备备注，向在线设备发送协助请求。" },
  "Remote Assist": { title: "远程协助", description: "连接前获得同意，结束时立即停止共享与控制。" },
  Sessions: { title: "会话记录", description: "了解当前版本的会话记录能力。" },
  Settings: { title: "偏好设置", description: "调整外观与阅读大小，查看账号和设备信息。" }
};

export function normalizeConnectionCode(value: string): string {
  return value.replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10)).replace(/\D/g, "").slice(0, 8);
}

export function remainingTime(expiresAt: number, now: number): string {
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return "00:00";
  const seconds = Math.ceil((expiresAt - now) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function friendlyError(error: unknown): string {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (status === 401) return "登录已过期或账号密码不正确，请重新登录。";
  if (status === 404) return "未找到对应的设备或连接码，请确认后重试。";
  if (status === 409) return "当前状态已改变，或账号已存在。请刷新后重试。";
  if (status === 410) return "连接码或会话已过期，请让对方重新发起共享。";
  if (status === 429) return "操作有些频繁，请稍候再试。";
  if (typeof status === "number" && status >= 500) return "服务器暂时不可用，请稍后重试。";
  if (status === 400) return "请检查填写内容后再试。";
  if (name === "TimeoutError" || name === "AbortError") return "连接超时，请检查网络后重试。";
  if (name === "NotAllowedError") return "你取消了屏幕共享，尚未向对方共享画面。";
  if (message.includes("signaling_service_not_configured")) return "尚未配置服务地址，请使用已配置服务器域名的客户端。";
  if (message.includes("signaling_service") || message.includes("requires_tls")) return "服务地址无效，请使用 HTTPS 服务地址。";
  if (message.includes("primary full display")) return "请选择主显示器的整个屏幕。当前暂不支持窗口、标签页或副屏控制。";
  if (name === "TypeError") return "无法连接服务器，请检查网络与服务地址。";
  return "操作未完成，请检查连接后重试。";
}

export function connectionLabel(status: string): string {
  const labels: Record<string, string> = {
    Idle: "尚未连接", Closed: "会话已关闭", connected: "已连接", connecting: "正在建立连接",
    new: "等待连接", failed: "连接失败", disconnected: "连接已中断", closed: "会话已关闭",
    Disconnected: "已断开", "Connection failed": "连接失败", "Connection lost": "连接已中断",
    "Session ended": "会话已结束", "Session expired": "会话已到期", "Connection code expired": "连接码已到期",
    "Capture stopped": "屏幕共享已停止", "Stopped by host": "已停止共享", "Stopped by controller": "已断开连接",
    "Waiting for host authorization": "等待对方确认", "Controller is waiting for authorization": "对方正在等待授权",
    Rejected: "已拒绝请求", "signaling error": "连接协商失败"
  };
  return labels[status] ?? (status.startsWith("Code expires at ") ? "等待对方输入连接码" : "正在连接");
}

export function transportFailure(reason:string):string {
  const messages:Record<string,string>={
    negotiation_timeout:"画面连接超时，请检查双方网络或中继服务，再重新发起协助。",
    heartbeat_timeout:"对方响应中断，已安全结束控制。请检查网络后重新连接。",
    input_congested:"输入通道积压，已停止控制以避免延迟操作。请等待网络恢复后重试。",
    input_authorization_lost:"本机输入授权已失效，已停止控制。请重新发起并确认授权。",
    negotiation_failed:"画面协商未完成，请检查服务与网络后重试。",
    connection_lost:"网络连接已中断，远程输入已停止。",
    signaling_unavailable:"信令连接已断开，协助已停止。"
  };
  return messages[reason]??"通信通道不可用，已安全结束本次协助。请重新连接。";
}

export function remoteLayout(container: { width: number; height: number }, source: { width: number; height: number }, mode: "fit" | "100" | "150") {
  if (![container.width, container.height, source.width, source.height].every((n) => Number.isFinite(n) && n > 0)) return { width: 0, height: 0, scale: 1 };
  const scale = mode === "fit" ? Math.min(container.width / source.width, container.height / source.height) : mode === "150" ? 1.5 : 1;
  return { width: mode === "fit" ? Math.min(container.width,source.width * scale) : source.width*scale, height: mode === "fit" ? Math.min(container.height,source.height * scale) : source.height*scale, scale };
}
