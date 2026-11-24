import { useState } from "react";
import type { AuthResult, Device, SignalingClient } from "./signaling";
import { Icon, StatusMessage } from "./ui";
import { useCodeAssistHost } from "./useCodeAssistHost";
import type { SessionSummary } from "./sessionJournal";
import { nativeDesktop } from "./platform";

export function DashboardPage({ username, onlineDevices, onMyDevices, onRemoteAssist }: {
  username?: string;
  onlineDevices: number;
  onMyDevices: () => void;
  onRemoteAssist: () => void;
}) {
  return <section className="dashboard-page">
    <article className="welcome-hero">
      <div className="hero-copy">
        <span className="hero-kicker"><span/>REMOTEASSIST</span>
        <h2>{username ? `${username}，` : "欢迎使用，"}<br/><em>选择一种连接方式。</em></h2>
        <p>自己的设备可直接连接。帮助他人时，使用一次性操控码。</p>
        <div className="hero-actions"><button className="primary-action" onClick={onMyDevices}>打开我的设备<Icon name="arrow"/></button><button className="hero-secondary" onClick={onRemoteAssist}>开始远程协助</button></div>
        <div className="hero-assurance"><Icon name="shield"/>被控电脑始终显示连接状态，可随时结束协助。</div>
      </div>
      <div className="hero-visual" aria-hidden="true"><span className="orbit"/><span className="orbit orbit-secondary"/><div className="hero-computer"><i/><Icon name="monitor"/><span>我的电脑</span></div><span className="hero-link"><Icon name="arrow"/></span><div className="hero-computer remote"><i/><Icon name="devices"/><span>协助设备</span></div></div>
    </article>
    <div className="metric-grid"><article className="metric-card"><span className="metric-icon blue-icon"><Icon name="devices"/></span><span>同账号在线设备</span><strong>{onlineDevices}<small>台</small></strong><small>选择本人设备后直接进入桌面。</small></article><article className="metric-card"><span className="metric-icon green-icon"><Icon name="monitor"/></span><span>一次性远程协助</span><strong>操控码</strong><small>另一位用户输入本次有效的 8 位码。</small></article></div>
  </section>;
}

export function RemoteAssistWorkspace({ auth, device, signaling, onLogin, onJoin, onActivity, onHostActive, onRecord }: {
  auth: AuthResult | null;
  device: Device | null;
  signaling: SignalingClient;
  onLogin: () => void;
  onJoin: (code: string) => void;
  onActivity: (active: boolean) => void;
  onHostActive: (active: boolean) => void;
  onRecord: (record: SessionSummary) => void;
}) {
  if (!auth || !device) return <RemoteAssistGuest onLogin={onLogin}/>;
  return <SignedInRemoteAssist auth={auth} device={device} signaling={signaling} onJoin={onJoin} onActivity={onActivity} onHostActive={onHostActive} onRecord={onRecord}/>;
}

function RemoteAssistGuest({ onLogin }: { onLogin: () => void }) {
  return <section className="remote-assist-page"><div className="assist-intro"><span className="eyebrow">ONE-TIME REMOTE ASSISTANCE</span><h2>帮助另一位用户操作电脑</h2><p>两个人各用自己的设备。被协助者生成一次性操控码，协助者输入后连接。</p></div><article className="assist-auth-card"><span className="workflow-icon"><Icon name="devices"/></span><div><h3>登录后开始远程协助</h3><p>两端登录到同一个信令服务即可使用不同账号。自己的多台设备请到“我的设备”连接。</p></div><button className="primary-action" onClick={onLogin}>登录或注册<Icon name="arrow"/></button></article></section>;
}

function SignedInRemoteAssist({ auth, device, signaling, onJoin, onActivity, onHostActive, onRecord }: {
  auth: AuthResult;
  device: Device;
  signaling: SignalingClient;
  onJoin: (code: string) => void;
  onActivity: (active: boolean) => void;
  onHostActive: (active: boolean) => void;
  onRecord: (record: SessionSummary) => void;
}) {
  const [enteredCode, setEnteredCode] = useState("");
  const [copied, setCopied] = useState(false);
  const host = useCodeAssistHost(auth, device, signaling, onActivity, onHostActive, onRecord);
  const validCode = /^\d{8}$/.test(enteredCode);
  const copyCode = async () => {
    if (!host?.code) return;
    try { await navigator.clipboard.writeText(host.code.code); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { setCopied(false); }
  };

  return <section className="remote-assist-page">
    <div className="assist-intro"><span className="eyebrow">ONE-TIME REMOTE ASSISTANCE</span><h2>帮助另一位用户操作电脑</h2><p>两个人各用自己的设备。被协助者生成一次性操控码，协助者输入后连接。</p></div>
    <div className="assist-flow-grid">
      {nativeDesktop&&<article className="assist-flow-card assist-host-card">
        <div className="assist-flow-heading"><span className="workflow-icon"><Icon name="monitor"/></span><div><h3>我需要别人协助</h3><p>在这台 Windows 电脑生成本次操控码。</p></div></div>
        {host?.error&&<StatusMessage error>{host.error}</StatusMessage>}
        {host?.code ? <div className="share-active"><div className="code-row"><span className="code-box" aria-label={`操控码 ${host.code.code}`}>{host.code.code}</span><button className="secondary-action" onClick={()=>void copyCode()}><Icon name="copy"/>{copied?"已复制":"复制操控码"}</button></div><p>{host.controllerName||"等待协助者输入操控码"} · {new Date(host.code.expiresAt).toLocaleTimeString("zh-CN")} 前有效。输入即表示允许本次控制。</p><button className="danger-quiet" onClick={()=>host.stop()}>结束本次远程协助</button></div> : <div className="share-start"><div className="large-monitor"><Icon name="monitor"/></div><div><strong>生成一次性操控码</strong><p>把 8 位码告诉正在协助你的人。码被使用后立即失效，本次连接可随时结束。</p><button className="primary-action" disabled={host?.busy} onClick={()=>void host?.start()}>{host?.busy?"正在生成…":"生成操控码"}<Icon name="arrow"/></button></div></div>}
      </article>}
      <article className="assist-flow-card assist-controller-card">
        <div className="assist-flow-heading"><span className="workflow-icon green-icon"><Icon name="devices"/></span><div><h3>我来协助别人</h3><p>输入对方电脑上显示的一次性操控码。</p></div></div>
        <form className="join-form" noValidate onSubmit={event=>{event.preventDefault();if(validCode)onJoin(enteredCode);}}>
          <label htmlFor="assist-code">8 位操控码</label>
          <div><input id="assist-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={enteredCode} onChange={event=>setEnteredCode(event.target.value.replace(/\D/g,"").slice(0,8))} placeholder="输入 8 位数字"/><button className="primary-action" disabled={!validCode}>连接电脑<Icon name="arrow"/></button></div>
          <small>操控码只对本次连接有效，过期或使用后需要对方重新生成。</small>
        </form>
      </article>
    </div>
  </section>;
}
