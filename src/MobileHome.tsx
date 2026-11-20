import { useState } from "react";
import { configuredServer } from "./platform";
import { normalizeServerAddress } from "./mobileInput";
import { FloatingField } from "./forms";
import { ModalFrame } from "./workspaceChrome";
import { Icon } from "./ui";

export function MobileHome({ signedIn, username, onConnect, onServer }: { signedIn: boolean; username?: string; onConnect: () => void; onServer: () => void }) {
  return <section className="mobile-home"><div className="mobile-welcome"><span className="eyebrow">REMOTEASSIST · 移动控制端</span><h2>电脑不在身边，<br/><em>操作依然顺手。</em></h2><p>{signedIn ? `${username}，准备好连接你的电脑了吗？` : "使用手机或平板，连接已授权的 Windows 电脑。"}</p><span className="mobile-welcome-icon"><Icon name="monitor"/></span></div>
    <button className="mobile-connect-card" onClick={onConnect}><span><Icon name="devices"/></span><div><strong>连接我的电脑</strong><small>{signedIn?"输入电脑上的 8 位临时连接码":"登录后输入 8 位临时连接码"}</small></div><Icon name="arrow"/></button>
    <ol className="mobile-start-steps"><li><b>1</b><span><strong>电脑开启共享</strong><small>运行新版 Windows 客户端，选择主显示器。</small></span></li><li><b>2</b><span><strong>输入临时连接码</strong><small>手机与电脑连接同一信令服务。</small></span></li><li><b>3</b><span><strong>电脑确认后操作</strong><small>点击、拖拽、滚动，也可以发送中文。</small></span></li></ol>
    <button className="mobile-server-link" onClick={onServer}><Icon name="settings"/><span>服务地址<small>{configuredServer()||"尚未配置，连接前请设置"}</small></span><Icon name="arrow"/></button>
  </section>;
}

export function MobileGuestPage({ page, onLogin, onServer }: { page: "My Devices" | "Sessions"; onLogin: () => void; onServer: () => void }) {
  const sessions = page === "Sessions";
  return <section className="mobile-guest-page"><span className="guest-feature-icon"><Icon name={sessions ? "history" : "devices"}/></span><h2>{sessions ? "登录后查看协助记录" : "登录后管理设备"}</h2><p>{sessions ? "登录后可以查看连接时间、方向、结果和传输路径。" : "登录后可以查看设备、添加备注并发起协助请求。"}</p><button className="primary-action" onClick={onLogin}>登录后使用<Icon name="arrow"/></button><button className="mobile-server-link" onClick={onServer}><Icon name="settings"/><span>服务地址<small>{configuredServer() || "尚未配置"}</small></span><Icon name="arrow"/></button></section>;
}

export function ServerDialog({ onSave, onClose }: { onSave: (url: string) => Promise<void>; onClose: () => void }) {
  const [url,setURL]=useState(configuredServer());const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  return <ModalFrame title="连接服务设置" onClose={onClose} className="server-dialog"><span className="eyebrow">连接你的服务</span><h2>手机和电脑用同一地址</h2><p>填写已部署的 RemoteAssist HTTPS 服务地址。服务需要可用的公网证书与 TURN 中继配置。</p><form noValidate onSubmit={event=>{event.preventDefault();if(busy)return;let next:string;try{next=normalizeServerAddress(url);}catch{setError("请输入有效的 HTTPS 根地址，不包含账号、路径或参数。");return;}setBusy(true);void onSave(next).catch(()=>{setError("保存失败，请重试。");setBusy(false);});}}>
    <FloatingField label="服务地址" help="例如 https://assist.example.com。此地址会接收你的登录与连接请求，请填写你信任的服务。" value={url} onChange={event=>{setURL(event.target.value);setError("");}} type="url" autoCapitalize="none" spellCheck={false} autoComplete="url" data-initial-focus required error={error} disabled={busy}/><p className="field-hint">切换地址将退出当前账号，需要重新登录。这里仅保存服务地址。</p><button type="submit" className="primary-action wide-action" disabled={busy}>{busy?"正在保存…":"保存并重新载入"}</button></form></ModalFrame>;
}
