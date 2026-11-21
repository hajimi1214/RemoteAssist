import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SettingsPage } from "../src/SettingsPage";
import { usePreferences } from "../src/preferences";
import { SignalingClient } from "../src/signaling";
import type { User, Device } from "../src/signaling";
import "../src/styles.css";
import "../src/workspaceChrome.css";
import "../src/mobile.css";
import "../src/settings.css";

// Isolated UI fixture; no authentication, system input or real service requests.
const service = new SignalingClient("https://assist.example.invalid");
const account = { username: "很长的测试账号".repeat(6), email: `${"long-address".repeat(15)}@example.invalid`, role: "user" } as User;
const device = { deviceName: "我的远程工作站与游戏电脑".repeat(12) } as Device;
function Preview() {
  const preferences = usePreferences();
  const [action, setAction] = useState("尚未操作");
  return <main className="workspace"><h1>设置交互验证</h1><p>此页面仅使用合成账号信息，不连接真实账号或设备。</p><SettingsPage user={account} device={device} auth={null} version="0.15.1-alpha" serviceStatus="Connected" preferences={preferences} signaling={service} onLogin={() => setAction("login")} onChangeServer={() => setAction("server")} onNavigate={view => setAction(view)} onFeedback={() => setAction("feedback")}/><output id="fixture-action">{action}</output></main>;
}
const root = createRoot(document.getElementById("root")!);
root.render(<Preview/>);
import.meta.hot?.dispose(() => root.unmount());
