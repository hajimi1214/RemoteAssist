import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DeviceWorkspace } from "../src/DeviceWorkspace";
import type { Device } from "../src/signaling";
import "../src/styles.css";
import "../src/workspaceChrome.css";
import "../src/mobile.css";
import "../src/workflowPages.css";

const accountId = "device-workspace-preview-account";
const timestamp = new Date().toISOString();
const devices: Device[] = [
  {
    id: "preview-controller",
    userId: accountId,
    deviceName: "Controller PC",
    deviceFingerprint: "preview-controller-fingerprint",
    osName: "Windows",
    appVersion: "0.15.1-alpha",
    note: "",
    lastSeenAt: timestamp,
    online: true,
    current: true,
  },
  {
    id: "preview-host",
    userId: accountId,
    deviceName: "Test Host",
    deviceFingerprint: "preview-host-fingerprint",
    osName: "Windows",
    appVersion: "0.15.1-alpha",
    note: "",
    lastSeenAt: timestamp,
    online: true,
    current: false,
  },
];

localStorage.setItem(`remoteassist.deviceLayout.${encodeURIComponent(accountId)}`, "focus");

function Preview() {
  const [connection, setConnection] = useState("尚未连接");
  const [connectionCount, setConnectionCount] = useState(0);
  return <main className="workspace">
    <h1>我的设备单击控制验证</h1>
    <output id="connect-result" role="status">连接次数 {connectionCount} · {connection}</output>
    <DeviceWorkspace
      devices={devices}
      currentDevice={devices[0]}
      onConnect={(device) => { setConnectionCount((count) => count + 1); setConnection(`已直接连接 ${device.id}`); }}
      onRefresh={() => undefined}
    />
  </main>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<Preview />);
import.meta.hot?.dispose(() => root.unmount());
