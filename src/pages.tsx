import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthResult, Device, SignalingClient, User } from "./signaling";
import { BrandMark, ConfirmDialog, Icon, StatusMessage } from "./ui";
import type { usePreferences } from "./ui";
import { friendlyError } from "./ux";

export function AuthShell({ mode, error, onError, onMode, onAuth, signaling }: {
  mode: "signin" | "register"; error: string; onError: (message: string) => void;
  onMode: (mode: "signin" | "register") => void;
  onAuth: (result: AuthResult, remember: boolean) => Promise<void>; signaling: SignalingClient;
}) {
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [form, setForm] = useState({ login:"", username:"", email:"", password:"", confirm:"", consent:false });
  async function submit() {
    if (busy) return;
    onError("");
    if (mode === "register" && form.password !== form.confirm) { onError("两次输入的密码不一致，请检查。"); return; }
    setBusy(true);
    try {
      const result = mode === "signin" ? await signaling.login(form.login.trim(), form.password) : await signaling.register(form.username.trim(), form.email.trim(), form.password);
      await onAuth(result, remember);
    } catch (err) { onError(friendlyError(err)); } finally { setBusy(false); }
  }
  function changeMode() { onError(""); setForm({...form,password:"",confirm:""}); onMode(mode === "signin" ? "register" : "signin"); }
  return <main className="auth-page">
    <header className="auth-topbar"><a className="brand-lockup" href="#auth-form"><BrandMark /><span className="brand-wordmark"><b>Remote</b><strong>Assist</strong></span></a><span className="version-tag">WINDOWS · 0.5 ALPHA</span></header>
    <section className="auth-layout">
      <div className="auth-showcase">
        <span className="eyebrow light-eyebrow">CONNECTED, WITH CONSENT</span>
        <h1>距离很远，<br /><em>协助很近。</em></h1>
        <p>把熟悉的桌面连接起来。每一次共享都清晰可见，每一次控制都由你确认。</p>
        <div className="auth-illustration" aria-hidden="true"><div className="mini-screen one"><span /><span /><span /></div><div className="illustration-link"><Icon name="shield" /></div><div className="mini-screen two"><span /><span /><span /></div></div>
        <div className="showcase-points"><span><Icon name="check" />临时连接码</span><span><Icon name="check" />主机明确授权</span><span><Icon name="check" />随时停止</span></div>
      </div>
      <div className="auth-panel">
        <span className="eyebrow">欢迎使用 REMOTEASSIST</span><h2>{mode === "signin" ? "登录你的工作空间" : "创建账号"}</h2><p className="auth-subtitle">{mode === "signin" ? "登录后管理设备，发起一次安全的协助。" : "只需几步，即可连接自己的设备。"}</p>
        <form id="auth-form" onSubmit={(ev) => { ev.preventDefault(); void submit(); }} aria-busy={busy}>
          {mode === "signin" ? <label>用户名或邮箱<input required autoComplete="username" value={form.login} onChange={(ev) => setForm({...form,login:ev.target.value})} placeholder="输入用户名或邮箱" disabled={busy} /></label> : <>
            <label>用户名<input required minLength={3} maxLength={40} pattern="[A-Za-z0-9_.-]+" autoComplete="username" value={form.username} onChange={(ev) => setForm({...form,username:ev.target.value})} aria-describedby="username-help" disabled={busy} /><span id="username-help" className="field-hint">3–40 位英文字母、数字、下划线、点或短横线。</span></label>
            <label>邮箱<input required type="email" autoComplete="email" value={form.email} onChange={(ev) => setForm({...form,email:ev.target.value})} disabled={busy} placeholder="you@example.com" /></label>
          </>}
          <label>密码<span className="password-field"><input required minLength={mode === "register" ? 8 : undefined} type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={form.password} onChange={(ev) => setForm({...form,password:ev.target.value})} disabled={busy} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword}>{showPassword ? "隐藏" : "显示"}</button></span>{mode === "register" && <span className="field-hint">至少 8 个字符，建议使用较长的密码短语。</span>}</label>
          {mode === "register" && <label>确认密码<input required type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.confirm} onChange={(ev) => setForm({...form,confirm:ev.target.value})} disabled={busy} /></label>}
          <label className="check-row"><input type="checkbox" checked={remember} onChange={(ev) => setRemember(ev.target.checked)} disabled={busy} />在这台电脑上记住登录</label>
          {mode === "register" && <label className="check-row"><input required type="checkbox" checked={form.consent} onChange={(ev) => setForm({...form,consent:ev.target.checked})} disabled={busy} />我只在设备所有者明确授权后使用远程协助。</label>}
          {error && <StatusMessage error>{error}</StatusMessage>}
          <button className="primary-action wide-action" type="submit" disabled={busy}>{busy ? "正在连接…" : mode === "signin" ? "登录" : "创建账号"}<Icon name="arrow" /></button>
          <p className="auth-switch">{mode === "signin" ? "还没有账号？" : "已经有账号？"}<button type="button" className="link-button" disabled={busy} onClick={changeMode}>{mode === "signin" ? "创建账号" : "返回登录"}</button></p>
        </form>
        <div className="auth-footnote"><Icon name="shield" /><span>登录不会自动开启共享或授予控制权限。</span></div>
      </div>
    </section>
    <footer className="auth-footer">让连接更简单，让控制权始终属于你。</footer>
  </main>;
}

export function Dashboard({ user, device, devices, onShare, onControl }: { user: User; device: Device | null; devices: Device[]; onShare: () => void; onControl: () => void }) {
  const recent = useMemo(() => devices.slice(0,4),[devices]);
  return <section className="dashboard-page">
    <div className="welcome-hero"><div className="hero-copy"><span className="eyebrow light-eyebrow">YOUR CONNECTED WORKSPACE</span><h2>你好，{user.username}。<br /><em>今天想连接哪里？</em></h2><p>共享你的主屏，或输入对方的连接码。一次连接，一次确认。</p><div className="hero-actions"><button className="primary-action" onClick={onShare}><Icon name="monitor" />共享这台电脑</button><button className="hero-secondary" onClick={onControl}>连接另一台电脑<Icon name="arrow" /></button></div></div><div className="hero-visual" aria-hidden="true"><div className="orbit" /><div className="hero-computer"><Icon name="monitor" /><span>你的设备</span></div><div className="hero-link"><Icon name="shield" /></div><div className="hero-computer remote"><Icon name="devices" /><span>远程设备</span></div><div className="visual-caption">由你确认 · 随时结束</div></div></div>
    <div className="metric-grid"><article className="metric-card"><span className="metric-icon blue-icon"><Icon name="monitor" /></span><span>当前设备</span><strong>{device?.online ? "在线" : "正在登记"}</strong><small>{device?.deviceName ?? "等待连接到服务"}</small></article><article className="metric-card"><span className="metric-icon violet-icon"><Icon name="devices" /></span><span>已绑定设备</span><strong>{devices.length}<small>台</small></strong><small>{devices.filter((d) => d.online).length} 台设备在线</small></article><article className="metric-card"><span className="metric-icon green-icon"><Icon name="shield" /></span><span>授权方式</span><strong>每次确认</strong><small>共享和控制都由主机决定</small></article></div>
    <section className="table-card"><div className="section-head"><div><span className="eyebrow">YOUR DEVICES</span><h2>最近在线</h2></div><span className="count-chip">{devices.length} 台设备</span></div>{recent.length ? recent.map((item) => <div className="device-summary" key={item.id}><span className="device-symbol"><Icon name="monitor" /></span><div className="device-summary-copy"><strong>{item.deviceName}</strong><span>{item.current ? "本机" : item.osName} · {item.note || "未添加备注"}</span></div><span className={`presence ${item.online ? "online" : "offline"}`}><i />{item.online ? "在线" : "离线"}</span></div>) : <div className="empty-inline"><Icon name="devices" /><p>设备连接成功后会出现在这里。</p></div>}</section>
  </section>;
}

export function MyDevices({ auth, currentDevice, devices, onDevices, onRemoteAssist, signaling }: { auth: AuthResult; currentDevice: Device; devices: Device[]; onDevices: (devices: Device[]) => void; onRemoteAssist: (notice?: string) => void; signaling: SignalingClient }) {
  const mounted = useRef(true); const currentAuth = useRef(auth); currentAuth.current = auth;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [message,setMessage] = useState(""); const [error,setError] = useState(""); const [busy,setBusy] = useState("");
  const [query,setQuery] = useState(""); const [confirm,setConfirm] = useState<Device | null>(null); const [drafts,setDrafts] = useState<Record<string,string>>({});
  const filtered = devices.filter((d) => `${d.deviceName} ${d.note} ${d.osName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  async function action(id: string, operation: () => Promise<void>, success: string, onSuccess?: () => void) {
    if (busy) return; setBusy(id); setError(""); setMessage("");
    const userId=auth.user.id;
    const current=()=>mounted.current&&currentAuth.current.user.id===userId;
    try { await operation(); if(!current())return; const listed=await signaling.devices(currentAuth.current.accessToken,currentDevice.id); if(!current())return; onDevices(listed); setMessage(success); onSuccess?.(); }
    catch(err) { if(current())setError(friendlyError(err)); } finally { if(current())setBusy(""); }
  }
  return <section className="table-card device-list-page"><div className="section-head"><div><span className="eyebrow">TRUSTED ENDPOINTS</span><h2>你的设备</h2></div><button className="secondary-action" disabled={!!busy} onClick={() => void action("refresh",async()=>{},"设备列表已更新。")}>刷新列表</button></div><p className="section-intro">发送请求后，对方仍需选择屏幕并同意控制。</p><label className="search-field"><span className="sr-only">搜索设备</span><input type="search" value={query} onChange={(ev)=>setQuery(ev.target.value)} placeholder="搜索设备名称、系统或备注" /></label>
    {message && <StatusMessage>{message}</StatusMessage>}{error && <StatusMessage error>{error}</StatusMessage>}
    <div className="device-list">{filtered.map((item)=><article className="device-row" key={item.id}><div className="device-card-heading"><span className="device-symbol"><Icon name="monitor" /></span><div><h3>{item.deviceName}</h3><span>{item.osName}{item.current ? " · 本机" : ""}</span></div><span className={`presence ${item.online?"online":"offline"}`}><i />{item.online?"在线":"离线"}</span></div><p className="last-seen">最近连接：{new Date(item.lastSeenAt).toLocaleString("zh-CN")}</p><form className="note-form" onSubmit={(ev)=>{ev.preventDefault();const note=drafts[item.id]??item.note;void action(item.id,async()=>{await signaling.updateDevice(auth.accessToken,item.id,note);},"备注已保存。");}}><label>设备备注<input maxLength={256} value={drafts[item.id]??item.note} onChange={(ev)=>setDrafts({...drafts,[item.id]:ev.target.value})} placeholder="例如：家里的电脑" /></label><button className="secondary-action" type="submit" disabled={!!busy||(drafts[item.id]??item.note)===item.note}>保存</button></form><div className="device-card-actions"><button className="primary-action" disabled={!!busy||item.current||!item.online} onClick={()=>void action(item.id,async()=>{await signaling.requestAssist(auth.accessToken,item.id,currentDevice.id);},"请求已发送。",()=>onRemoteAssist("协助请求已发送。请等待对方共享连接码。"))}>{busy===item.id?"正在处理…":item.current?"当前设备":"请求协助"}</button><button className="danger-quiet" disabled={!!busy||item.current} onClick={()=>setConfirm(item)}>解除绑定</button></div></article>)}</div>
    {!filtered.length&&<div className="empty-inline"><Icon name="devices" /><p>{query?"没有匹配的设备，试试其他关键词。":"还没有可显示的设备。"}</p></div>}
    {confirm&&<ConfirmDialog title={`解除「${confirm.deviceName}」的绑定？`} description="该设备会从列表中移除，账号的刷新登录凭据也会撤销，其他设备可能需要重新登录。" confirmLabel="解除绑定" onCancel={()=>setConfirm(null)} onConfirm={()=>{const item=confirm;setConfirm(null);void action(item.id,()=>signaling.revokeDevice(auth.accessToken,item.id),"已解除设备绑定。");}}/>}
  </section>;
}

export function SettingsPage({ user, device, version, preferences }: { user: User; device: Device | null; version: string; preferences: ReturnType<typeof usePreferences> }) {
  return <section className="settings-grid"><article className="table-card settings-card"><span className="eyebrow">PERSONALIZE</span><h2>外观与阅读</h2><label className="setting-row"><span><strong>界面主题</strong><small>跟随系统，或选择你喜欢的外观。</small></span><select aria-label="界面主题" value={preferences.theme} onChange={(ev)=>preferences.setTheme(ev.target.value as typeof preferences.theme)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label><label className="check-row setting-row"><span><strong>更大的文字</strong><small>增大文字与控件，适合高分辨率屏幕。</small></span><input type="checkbox" checked={preferences.largeText} onChange={(ev)=>preferences.setLargeText(ev.target.checked)} /></label></article><article className="table-card settings-card"><span className="eyebrow">ACCOUNT</span><h2>账号与设备</h2><div className="setting-row"><span>用户名</span><strong>{user.username}</strong></div><div className="setting-row"><span>邮箱</span><strong>{user.email}</strong></div><div className="setting-row"><span>当前设备</span><strong>{device?.deviceName??"等待设备登记"}</strong></div><div className="setting-row"><span>版本</span><strong>{version}</strong></div></article><article className="settings-safety"><Icon name="shield" /><div><strong>登录不等于授权</strong><p>每次共享都需要主机选择屏幕并确认控制。关闭共享或断开连接后，远程输入立即停止。</p></div></article></section>;
}

export function SessionsPage({ onStart }: { onStart: () => void }) {
  return <section className="panel empty-state"><span className="empty-icon large-empty"><Icon name="history" /></span><span className="eyebrow">SESSION ACTIVITY</span><h2>会话历史尚未开放</h2><p>当前版本暂不保存可浏览的历史会话。你可以随时发起新的协助，每次都需要主机重新确认。</p><button className="primary-action" onClick={onStart}>发起远程协助<Icon name="arrow" /></button></section>;
}
