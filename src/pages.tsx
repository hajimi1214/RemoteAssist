import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthResult, Device, SignalingClient, User } from "./signaling";
import { BrandMark, ConfirmDialog, Icon, StatusMessage } from "./ui";
import type { usePreferences } from "./preferences";
import { friendlyError } from "./ux";
import { sessionDuration } from "./sessionJournal";
import type { SessionSummary } from "./sessionJournal";
import { FloatingField, PasswordStrength, PasswordVisibility } from "./forms";
import { validateAuth, validateAuthField } from "./formRules";
import type { AuthErrors, AuthField } from "./formRules";

export function AuthShell({ mode, error, onError, onMode, onAuth, signaling }: {
  mode: "signin" | "register"; error: string; onError: (message: string) => void;
  onMode: (mode: "signin" | "register") => void;
  onAuth: (result: AuthResult, remember: boolean) => Promise<void>; signaling: SignalingClient;
}) {
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [registerStep, setRegisterStep] = useState<0 | 1>(0);
  const [focusField, setFocusField] = useState<AuthField | null>(null);
  const [form, setForm] = useState({ login:"", username:"", email:"", password:"", confirm:"", consent:false });
  const [fieldErrors, setFieldErrors] = useState<AuthErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (focusField) { formRef.current?.querySelector<HTMLInputElement>(`[name="${focusField}"]`)?.focus(); setFocusField(null); }
  }, [focusField, registerStep]);
  function changeField(field: AuthField, value: string | boolean) {
    setForm(previous => ({...previous, [field]: value}));
    setFieldErrors(previous => ({...previous, [field]: undefined, ...(field === "password" ? {confirm: undefined} : {})}));
  }
  function blurField(field: AuthField) {
    setFieldErrors(previous => ({...previous, [field]: validateAuthField(field, form, mode) || undefined}));
  }
  async function submit() {
    if (busy) return;
    onError("");
    const errors = validateAuth(form, mode);
    if (mode === "register" && registerStep === 0) {
      const accountErrors = { username: errors.username, email: errors.email };
      setFieldErrors(accountErrors);
      if (accountErrors.username || accountErrors.email) { setFocusField(accountErrors.username ? "username" : "email"); return; }
      setRegisterStep(1); setFocusField("password"); return;
    }
    setFieldErrors(errors);
    const firstField = Object.keys(errors)[0];
    if (firstField) { if (firstField === "username" || firstField === "email") setRegisterStep(0); setFocusField(firstField as AuthField); return; }
    setBusy(true);
    try {
      const result = mode === "signin" ? await signaling.login(form.login.trim(), form.password) : await signaling.register(form.username.trim(), form.email.trim(), form.password);
      await onAuth(result, remember);
    } catch (err) { onError(friendlyError(err)); } finally { setBusy(false); }
  }
  function changeMode() { onError(""); setFieldErrors({}); setRegisterStep(0); setShowPassword(false); setForm({...form,password:"",confirm:""}); onMode(mode === "signin" ? "register" : "signin"); }
  const passwordStep = mode === "signin" || registerStep === 1;
  return <main className={`auth-page${mode === "register" ? " auth-register" : ""}`}>
    <header className="auth-topbar"><a className="brand-lockup" href="#auth-form"><BrandMark /><span className="brand-wordmark"><b>Remote</b><strong>Assist</strong></span></a><span className="version-tag">WINDOWS · 0.7 ALPHA</span></header>
    <section className="auth-layout">
      <div className="auth-showcase">
        <span className="eyebrow light-eyebrow">CONNECTED, WITH CONSENT</span>
        <h1>距离很远，<br /><em>协助很近。</em></h1>
        <p>把熟悉的桌面连接起来。每一次共享都清晰可见，每一次控制都由你确认。</p>
        <div className="auth-illustration" aria-hidden="true"><div className="mini-screen one"><span /><span /><span /></div><div className="illustration-link"><Icon name="shield" /></div><div className="mini-screen two"><span /><span /><span /></div></div>
        <div className="showcase-points"><span><Icon name="check" />临时连接码</span><span><Icon name="check" />主机明确授权</span><span><Icon name="check" />随时停止</span></div>
      </div>
      <div className="auth-panel">
        <span className="eyebrow">{mode === "signin" ? "欢迎使用 REMOTEASSIST" : `第 ${registerStep + 1} 步，共 2 步 · 所有字段均需填写`}</span><h2>{mode === "signin" ? "登录你的工作空间" : registerStep === 0 ? "创建账号" : "设置你的密码"}</h2><p className="auth-subtitle">{mode === "signin" ? "登录后管理设备，发起一次安全的协助。" : registerStep === 0 ? "先填写用于登录的用户名和邮箱。" : "设置独立密码，保护你的工作空间。"}</p>
        <form ref={formRef} id="auth-form" noValidate onSubmit={(ev) => { ev.preventDefault(); void submit(); }} aria-busy={busy}>
          {mode === "signin" ? <FloatingField label="用户名或邮箱" help="使用注册时的用户名或邮箱登录。" name="login" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={form.login} onChange={ev => changeField("login", ev.target.value)} onBlur={() => blurField("login")} error={fieldErrors.login} disabled={busy} /> : registerStep === 0 && <>
            <FloatingField label="用户名" help="3–40 位英文字母、数字、下划线、点或短横线。" name="username" required minLength={3} maxLength={40} autoComplete="username" autoCapitalize="none" spellCheck={false} value={form.username} onChange={ev => changeField("username", ev.target.value)} onBlur={() => blurField("username")} error={fieldErrors.username} disabled={busy} />
            <FloatingField label="邮箱" help="例如 you@example.com，也可用于登录。" name="email" required type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={form.email} onChange={ev => changeField("email", ev.target.value)} onBlur={() => blurField("email")} error={fieldErrors.email} disabled={busy} />
          </>}
          {passwordStep && <>
          <FloatingField label="密码" help={mode === "register" ? "至少 8 个字符，建议使用较长的密码短语。" : "输入此账号的密码，可用右侧按钮查看。"} name="password" required minLength={mode === "register" ? 8 : undefined} type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={form.password} onChange={ev => changeField("password", ev.target.value)} onBlur={() => blurField("password")} error={fieldErrors.password} disabled={busy} trailing={<PasswordVisibility visible={showPassword} onToggle={() => setShowPassword(!showPassword)} disabled={busy}/>}>
            {mode === "register" && <PasswordStrength value={form.password}/>}
          </FloatingField>
          {mode === "register" && <FloatingField label="确认密码" help="再次输入相同密码，避免输入错误。" name="confirm" required type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.confirm} onChange={ev => changeField("confirm", ev.target.value)} onBlur={() => blurField("confirm")} error={fieldErrors.confirm} disabled={busy} />}
          <label className="check-row"><input type="checkbox" checked={remember} onChange={(ev) => setRemember(ev.target.checked)} disabled={busy} />在这台电脑上记住登录</label>
          {mode === "register" && <div><label className="check-row"><input name="consent" required type="checkbox" checked={form.consent} onChange={ev => changeField("consent", ev.target.checked)} onBlur={() => blurField("consent")} aria-invalid={fieldErrors.consent ? true : undefined} aria-describedby={fieldErrors.consent ? "auth-consent-error" : undefined} disabled={busy} />我只在设备所有者明确授权后使用远程协助。</label>{fieldErrors.consent && <p id="auth-consent-error" className="field-error" role="alert">{fieldErrors.consent}</p>}</div>}
          </>}
          {error && <StatusMessage error>{error}</StatusMessage>}
          <button className="primary-action wide-action" type="submit" disabled={busy} onPointerDown={ev=>{if(ev.button===0)ev.preventDefault();}}>{busy ? "正在连接…" : mode === "signin" ? "登录" : registerStep === 0 ? "下一步：设置密码" : "创建账号"}<Icon name="arrow" /></button>
          <p className="auth-switch">{mode === "register" && registerStep === 1 && <button type="button" className="link-button" disabled={busy} onClick={() => { setRegisterStep(0); setFieldErrors({}); setFocusField("username"); }}>上一步</button>}{mode === "signin" ? "还没有账号？" : "已经有账号？"}<button type="button" className="link-button" disabled={busy} onClick={changeMode}>{mode === "signin" ? "创建账号" : "返回登录"}</button></p>
        </form>
        <div className="auth-footnote"><Icon name="shield" /><span>登录不会自动开启共享或授予控制权限。</span></div>
      </div>
    </section>
    <footer className="auth-footer">让连接更简单，让控制权始终属于你。</footer>
  </main>;
}

export function Dashboard({ user, device, devices, onShare, onControl, recentSessions, onHistory }: { user: User; device: Device | null; devices: Device[]; onShare: () => void; onControl: () => void; recentSessions:SessionSummary[];onHistory:()=>void }) {
  const recent = useMemo(() => devices.slice(0,4),[devices]);
  return <section className="dashboard-page">
    <div className="welcome-hero"><div className="hero-copy"><span className="hero-kicker"><span/>YOUR CONNECTED WORKSPACE</span><h2>连接更近，<br/><em>控制权始终在你。</em></h2><p>你好，{user.username}。从一次清晰可见的共享开始，让远程协助自然发生。</p><div className="hero-actions"><button className="primary-action" onClick={onShare}><Icon name="monitor" />共享这台电脑</button><button className="hero-secondary" onClick={onControl}>输入连接码<Icon name="arrow" /></button></div><div className="hero-assurance"><Icon name="shield"/>每次连接需要主机确认</div></div><div className="hero-visual" aria-hidden="true"><div className="orbit"/><div className="orbit orbit-secondary"/><div className="hero-computer"><Icon name="monitor"/><span>你的设备</span><i/></div><div className="hero-link"><Icon name="shield"/></div><div className="hero-computer remote"><Icon name="devices"/><span>远程设备</span><i/></div><div className="floating-note"><span/>共享由你开启<b>随时可以停止</b></div></div></div>
    <div className="dashboard-actions"><button className="workflow-tile" onClick={onShare}><span className="workflow-icon"><Icon name="monitor"/></span><span><strong>我需要协助</strong><small>选择主屏，把临时连接码发给对方</small></span><Icon name="arrow"/></button><button className="workflow-tile" onClick={onControl}><span className="workflow-icon violet-icon"><Icon name="devices"/></span><span><strong>我要帮助别人</strong><small>输入连接码，等待对方允许控制</small></span><Icon name="arrow"/></button></div>
    <div className="metric-grid"><article className="metric-card"><span className="metric-icon blue-icon"><Icon name="monitor" /></span><span>当前设备</span><strong>{device?.online ? "在线" : "正在登记"}</strong><small>{device?.deviceName ?? "等待连接到服务"}</small></article><article className="metric-card"><span className="metric-icon violet-icon"><Icon name="devices" /></span><span>已绑定设备</span><strong>{devices.length}<small>台</small></strong><small>{devices.filter((d) => d.online).length} 台设备在线</small></article><article className="metric-card"><span className="metric-icon green-icon"><Icon name="shield" /></span><span>授权方式</span><strong>每次确认</strong><small>共享和控制都由主机决定</small></article></div>
    <section className="table-card"><div className="section-head"><div><span className="eyebrow">YOUR DEVICES</span><h2>最近在线</h2></div><span className="count-chip">{devices.length} 台设备</span></div>{recent.length ? recent.map((item) => <div className="device-summary" key={item.id}><span className="device-symbol"><Icon name="monitor" /></span><div className="device-summary-copy"><strong>{item.deviceName}</strong><span>{item.current ? "本机" : item.osName} · {item.note || "未添加备注"}</span></div><span className={`presence ${item.online ? "online" : "offline"}`}><i />{item.online ? "在线" : "离线"}</span></div>) : <div className="empty-inline"><Icon name="devices" /><p>设备连接成功后会出现在这里。</p></div>}</section>
    <section className="recent-journal table-card"><div className="section-head"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>最近协助</h2></div><button className="link-button" onClick={onHistory}>查看全部<Icon name="arrow"/></button></div>{recentSessions.length?recentSessions.slice(0,3).map(record=><SessionRow key={record.id} record={record}/>):<div className="empty-inline"><Icon name="history"/><p>完成协助后，这里会出现本机的会话摘要。</p></div>}</section>
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
  return <section className="table-card device-list-page"><div className="section-head"><div><span className="eyebrow">TRUSTED ENDPOINTS</span><h2>你的设备</h2></div><button className="secondary-action" disabled={!!busy} onClick={() => void action("refresh",async()=>{},"设备列表已更新。")}>刷新列表</button></div><p className="section-intro">发送请求后，对方仍需选择屏幕并同意控制。</p><FloatingField label="搜索设备" help="按设备名称、系统或备注筛选。" type="search" value={query} onChange={ev=>setQuery(ev.target.value)}/>
    {message && <StatusMessage>{message}</StatusMessage>}{error && <StatusMessage error>{error}</StatusMessage>}
    <div className="device-list">{filtered.map((item)=><article className="device-row" key={item.id}><div className="device-card-heading"><span className="device-symbol"><Icon name="monitor" /></span><div><h3>{item.deviceName}</h3><span>{item.osName}{item.current ? " · 本机" : ""}</span></div><span className={`presence ${item.online?"online":"offline"}`}><i />{item.online?"在线":"离线"}</span></div><p className="last-seen">最近连接：{new Date(item.lastSeenAt).toLocaleString("zh-CN")}</p><form className="note-form" onSubmit={(ev)=>{ev.preventDefault();const note=drafts[item.id]??item.note;void action(item.id,async()=>{await signaling.updateDevice(auth.accessToken,item.id,note);},"备注已保存。");}}><FloatingField label="设备备注（选填）" help="最多 256 个字符，例如：家里的电脑。" maxLength={256} value={drafts[item.id]??item.note} onChange={ev=>setDrafts({...drafts,[item.id]:ev.target.value})}/><button className="secondary-action" type="submit" disabled={!!busy||(drafts[item.id]??item.note)===item.note}>保存</button></form><div className="device-card-actions"><button className="primary-action" disabled={!!busy||item.current||!item.online} onClick={()=>void action(item.id,async()=>{await signaling.requestAssist(auth.accessToken,item.id,currentDevice.id);},"请求已发送。",()=>onRemoteAssist("协助请求已发送。请等待对方共享连接码。"))}>{busy===item.id?"正在处理…":item.current?"当前设备":"请求协助"}</button><button className="danger-quiet" disabled={!!busy||item.current} onClick={()=>setConfirm(item)}>解除绑定</button></div></article>)}</div>
    {!filtered.length&&<div className="empty-inline"><Icon name="devices" /><p>{query?"没有匹配的设备，试试其他关键词。":"还没有可显示的设备。"}</p></div>}
    {confirm&&<ConfirmDialog title={`解除「${confirm.deviceName}」的绑定？`} description="该设备会从列表中移除，账号的刷新登录凭据也会撤销，其他设备可能需要重新登录。" confirmLabel="解除绑定" onCancel={()=>setConfirm(null)} onConfirm={()=>{const item=confirm;setConfirm(null);void action(item.id,()=>signaling.revokeDevice(auth.accessToken,item.id),"已解除设备绑定。");}}/>}
  </section>;
}

export function SettingsPage({ user, device, version, preferences, auth, signaling }: { user: User; device: Device | null; version: string; preferences: ReturnType<typeof usePreferences>;auth:AuthResult;signaling:SignalingClient }) {
  const [adminState,setAdminState]=useState<{status:string;identityStorage:string;requiresHostConsent:boolean}|null>(null);
  const [adminError,setAdminError]=useState("");
  useEffect(()=>{let cancelled=false;setAdminState(null);setAdminError("");if(user.role==="admin")void signaling.adminStatus(auth.accessToken).then(value=>{if(!cancelled)setAdminState(value);}).catch(err=>{if(!cancelled)setAdminError(friendlyError(err));});return()=>{cancelled=true;};},[user.role,auth.accessToken,signaling]);
  return <section className="settings-grid">
    <article className="table-card settings-card"><span className="eyebrow">PERSONALIZE</span><h2>外观与阅读</h2>
      <fieldset className="theme-options"><legend>界面主题</legend><p className="field-hint" id="theme-help">跟随系统，或选择你喜欢的外观。</p><div>{([{value:"system",label:"跟随系统"},{value:"light",label:"浅色"},{value:"dark",label:"深色"}] as const).map(option => <label key={option.value} className={preferences.theme === option.value ? "selected" : ""}><input type="radio" name="theme" value={option.value} checked={preferences.theme === option.value} onChange={() => preferences.setTheme(option.value)} aria-describedby="theme-help"/><span>{option.label}</span></label>)}</div></fieldset>
      <label className="check-row setting-row"><span><strong>更大的文字</strong><small>增大文字与控件，适合高分辨率屏幕。</small></span><input type="checkbox" checked={preferences.largeText} onChange={ev => preferences.setLargeText(ev.target.checked)} /></label>
    </article>
    <article className="table-card settings-card"><span className="eyebrow">ACCOUNT</span><h2>账号与设备</h2><div className="setting-row"><span>用户名</span><strong>{user.username}</strong></div><div className="setting-row"><span>账号角色</span><strong>{user.role==="admin"?"管理员":"普通用户"}</strong></div><div className="setting-row"><span>邮箱</span><strong>{user.email}</strong></div><div className="setting-row"><span>当前设备</span><strong>{device?.deviceName??"等待设备登记"}</strong></div><div className="setting-row"><span>版本</span><strong>{version}</strong></div></article>
    {user.role==="admin"&&<article className="table-card settings-card"><span className="eyebrow">ADMINISTRATOR</span><h2>管理员服务检查</h2>{adminError&&<StatusMessage error>{adminError}</StatusMessage>}<div className="setting-row"><span>服务端角色校验</span><strong>{adminState?"已通过":adminError?"检查失败":"正在检查…"}</strong></div><div className="setting-row"><span>账号存储</span><strong>{adminState?.identityStorage==="memory"?"本机预览（内存）":adminState?.identityStorage==="postgresql"?"PostgreSQL":"待检查"}</strong></div><p className="field-hint">管理员身份不授予远程控制权。协助仍需主机逐次确认。</p></article>}
    <article className="settings-safety"><Icon name="shield" /><div><strong>登录不等于授权</strong><p>每次共享都需要主机选择屏幕并确认控制。关闭共享或断开连接后，远程输入立即停止。</p></div></article>
  </section>;
}

function SessionRow({record}:{record:SessionSummary}) {
  const outcomes={completed:"已结束",interrupted:record.connectedAt==null?"连接失败":"连接中断",cancelled:"已取消",expired:"会话到期"};
  return <article className="journal-row"><span className="device-symbol"><Icon name={record.role==="share"?"monitor":"devices"}/></span><div><strong>{record.role==="share"?"共享这台电脑":"连接另一台电脑"}</strong><time dateTime={new Date(record.startedAt).toISOString()}>{new Date(record.startedAt).toLocaleString("zh-CN")}</time></div><div className="journal-duration"><strong>{sessionDuration(record)}</strong><span>{record.route==="P2P"?"设备直连":record.route==="TURN Relay"?"中继连接":"未确定路径"}</span></div><span className={`outcome-badge ${record.outcome}`}>{outcomes[record.outcome]}</span></article>;
}

export function SessionsPage({ onStart,records,persist,storageError,onPersistence,onClear,onRetryStorage }: { onStart: () => void;records:SessionSummary[];persist:boolean;storageError:string;onPersistence:(enabled:boolean)=>void;onClear:()=>void;onRetryStorage:()=>void }) {
  const [filter,setFilter]=useState("all");const [confirm,setConfirm]=useState(false);
  const shown=records.filter(record=>filter==="all"||record.role===filter);
  const established=records.filter(r=>r.connectedAt!=null).length;
  return <section className="journal-page"><div className="journal-overview"><div><span className="eyebrow">SESSION ACTIVITY</span><h2>让每一次协助都有迹可循</h2><p>只记录时间、方向、结果和传输路径，不记录屏幕、键盘内容或连接码。</p></div><span className="journal-total"><b>{established}</b>次已建立连接</span></div><section className="table-card"><div className="section-head"><div className="journal-filter" role="group" aria-label="筛选会话">{[{id:"all",label:"全部"},{id:"share",label:"我共享的"},{id:"control",label:"我连接的"}].map(item=><button className={filter===item.id?"active":""} aria-pressed={filter===item.id} key={item.id} onClick={()=>setFilter(item.id)}>{item.label}</button>)}</div><button className="danger-quiet" disabled={!records.length} onClick={()=>setConfirm(true)}>清空摘要</button></div>{shown.length?shown.map(record=><SessionRow key={record.id} record={record}/>):<div className="empty-state"><span className="empty-icon large-empty"><Icon name="history"/></span><h2>还没有{filter==="all"?"":"这类"}会话摘要</h2><p>会话结束后会自动添加摘要。仅发起但未连接的尝试会单独标记。</p><button className="primary-action" onClick={onStart}>发起协助<Icon name="arrow"/></button></div>}<label className="journal-storage check-row"><input type="checkbox" checked={persist} onChange={ev=>onPersistence(ev.target.checked)}/><span><strong>在这台电脑上保留摘要</strong><small>{persist?"保留最近 30 天，最多 50 条。关闭后删除已保存副本，本次运行仍可查看。":"当前只在本次登录中显示，退出后不保存。"}</small></span></label>{storageError&&<StatusMessage error>{storageError}<button className="secondary-action" onClick={onRetryStorage}>重试本地存储操作</button></StatusMessage>}</section>{confirm&&<ConfirmDialog title="清空本机的会话摘要？" description="会删除此账号在这台电脑上的摘要，不影响设备绑定或正在进行的协助。" confirmLabel="清空摘要" onCancel={()=>setConfirm(false)} onConfirm={()=>{onClear();setConfirm(false);}}/>}</section>;
}
