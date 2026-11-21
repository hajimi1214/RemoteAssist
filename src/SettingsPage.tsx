import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { AuthResult, Device, SignalingClient, User } from "./signaling";
import { ConfirmDialog, Icon, StatusMessage } from "./ui";
import type { IconName } from "./ui";
import { FloatingField } from "./forms";
import type { usePreferences } from "./preferences";
import { getPreferenceStorageState, readPreference, subscribePreferenceStorage, writePreference } from "./preferenceStore";
import { readQualityPreference } from "./qualityMode";
import type { QualityMode } from "./qualityMode";
import { androidClient, nativeDesktop } from "./platform";
import { friendlyError } from "./ux";
import type { View } from "./ux";

type Section = "general" | "streaming" | "connection" | "account" | "about";
const sections: { id: Section; label: string; hint: string; icon: IconName }[] = [
  { id: "general", label: "通用", hint: "外观与辅助功能", icon: "settings" },
  { id: "streaming", label: "远程体验", hint: "画质与操控偏好", icon: "monitor" },
  { id: "connection", label: "连接服务", hint: "服务地址与状态", icon: "grid" },
  { id: "account", label: "账号与设备", hint: "身份与设备管理", icon: "devices" },
  { id: "about", label: "关于", hint: "版本与使用反馈", icon: "info" },
];
const searchable: { section: Section; title: string; description: string; keywords: string; target?: string }[] = [
  { section: "general", title: "界面主题", description: "跟随系统、浅色或深色", keywords: "外观 夜间 颜色 theme dark light", target: "theme" },
  { section: "general", title: "更大的文字", description: "增大界面文字与控件", keywords: "字体 字号 阅读 高分辨率", target: "text" },
  { section: "general", title: "减少界面动画", description: "关闭界面过渡，保留操作反馈", keywords: "辅助功能 动效 motion", target: "motion" },
  { section: "streaming", title: "默认远程画质", description: "自动、清晰、流畅、省带宽或游戏", keywords: "分辨率 4k 60 fps 帧率 视频 quality", target: "quality" },
  { section: "streaming", title: "默认触控方式", description: "直触或触控板", keywords: "手机 平板 安卓 触屏 鼠标 touch", target: "touch" },
  { section: "streaming", title: "游戏鼠标灵敏度", description: "用滑块或精确数值调整", keywords: "游戏 速度 sensitivity", target: "sensitivity" },
  { section: "connection", title: "连接服务地址", description: "查看并更换登录和设备发现服务", keywords: "服务器 阿里云 ecs https ip 域名 网络", target: "server" },
  { section: "connection", title: "连接与隐私", description: "了解直连、中继和输入释放", keywords: "安全 turn p2p 权限" },
  { section: "account", title: "账号与设备", description: "查看邮箱、当前设备和账号角色", keywords: "用户名 登录 管理员 邮件 绑定" },
  { section: "account", title: "会话记录", description: "管理本机保存的连接摘要", keywords: "历史 清空 保留 存储" },
  { section: "about", title: "应用版本", description: "查看版本、运行环境和发布通道", keywords: "关于 版本号 alpha" },
  { section: "about", title: "使用反馈", description: "生成一份可复制的问题报告", keywords: "帮助 报错 建议 联系" },
];
const qualityDetails: Record<QualityMode, string> = {
  auto: "根据编码负载和网络状况自动调整，适合大多数连接。",
  sharp: "优先保留画面细节，最高 4K / 60 fps 目标。",
  smooth: "优先动态流畅度，必要时降低分辨率。",
  economy: "降低传输负载，适合带宽受限的网络。",
  game: "最高 1080p60 编码目标；主机不支持时会回退，实际游戏兼容性需实测。",
};

type Props = {
  user: User | null; device: Device | null; version: string; serviceStatus: string;
  preferences: ReturnType<typeof usePreferences>; auth: AuthResult | null; signaling: SignalingClient;
  onLogin: () => void; onChangeServer: () => void; onNavigate: (view: View) => void; onFeedback: () => void;
};

function Panel({ icon, title, description, children }: { icon: IconName; title: string; description: string; children: ReactNode }) {
  return <article className="settings-panel">
    <div className="settings-panel-heading"><span className="settings-panel-icon"><Icon name={icon}/></span><div><h3>{title}</h3><p>{description}</p></div></div>
    {children}
  </article>;
}

function Note({ children }: { children: ReactNode }) {
  return <div className="settings-note"><Icon name="info"/><span>{children}</span></div>;
}

export function SettingsPage({ user, device, version, serviceStatus, preferences, auth, signaling, onLogin, onChangeServer, onNavigate, onFeedback }: Props) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const [section, setSection] = useState<Section>("general");
  const [query, setQuery] = useState("");
  const [quality, setQuality] = useState<QualityMode>(readQualityPreference);
  const [touchMode, setTouchMode] = useState(() => readPreference("remoteassist.touchMode") === "touchpad" ? "touchpad" : "direct");
  const [sensitivity, setSensitivity] = useState(() => {
    const value = Number(readPreference("remoteassist.gameSensitivity"));
    return Number.isFinite(value) && value >= .25 && value <= 4 ? value : 1;
  });
  const [sensitivityDraft, setSensitivityDraft] = useState(() => String(sensitivity));
  const [sensitivityError, setSensitivityError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetNotice, setResetNotice] = useState("");
  const [adminState, setAdminState] = useState<{ status: string; identityStorage: string; requiresHostConsent: boolean } | null>(null);
  const [adminError, setAdminError] = useState("");
  const storageState = useSyncExternalStore(subscribePreferenceStorage, getPreferenceStorageState, getPreferenceStorageState);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = normalizedQuery ? searchable.filter(item => `${item.title} ${item.description} ${item.keywords}`.toLocaleLowerCase().includes(normalizedQuery)) : [];
  const active = sections.find(item => item.id === section)!;
  const serviceURL = (() => { try { return new URL(signaling.serviceURL()).origin; } catch { return "尚未配置"; } })();
  const serviceLabel = !user ? "登录后检查连接状态" : serviceStatus === "Connected" ? "服务在线" : serviceStatus === "Connecting" ? "正在连接…" : "暂时无法连接";

  useEffect(() => {
    let cancelled = false;
    setAdminState(null); setAdminError("");
    if (user?.role === "admin" && auth) void signaling.adminStatus(auth.accessToken)
      .then(value => { if (!cancelled) setAdminState(value); })
      .catch(error => { if (!cancelled) setAdminError(friendlyError(error)); });
    return () => { cancelled = true; };
  }, [user?.role, auth?.accessToken, signaling]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null || normalizedQuery) return;
    pendingFocus.current = null;
    const control = target ? document.getElementById(`${id}-${target}`) : null;
    (control ?? heading.current)?.focus({ preventScroll: true });
    if (control) control.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [section, normalizedQuery, id]);

  function openSection(next: Section, target = "") {
    pendingFocus.current = target;
    setSection(next); setQuery("");
    if (next === section && !normalizedQuery) { pendingFocus.current = null; heading.current?.focus({ preventScroll: true }); }
  }

  function saveSensitivity(value: number) {
    setSensitivity(value); setSensitivityDraft(String(value)); setSensitivityError("");
    writePreference("remoteassist.gameSensitivity", String(value));
  }

  function validateSensitivity() {
    const value = sensitivityDraft.trim() === "" ? NaN : Number(sensitivityDraft);
    if (!Number.isFinite(value) || value < .25 || value > 4) { setSensitivityError("请输入 0.25 到 4 之间的数值，例如 1.25。"); return; }
    if (Math.abs(value * 20 - Math.round(value * 20)) > .000001) { setSensitivityError("请以 0.05 为步长填写，例如 1.20 或 1.25。"); return; }
    saveSensitivity(value);
  }

  function restoreDefaults() {
    preferences.setTheme("system"); preferences.setLargeText(false); preferences.setReducedMotion(false);
    setQuality("auto"); writePreference("remoteassist.qualityMode", "auto");
    setTouchMode("direct"); writePreference("remoteassist.touchMode", "direct");
    saveSensitivity(1); setConfirmReset(false);
    setResetNotice("已恢复界面与远程体验默认值。服务地址、登录信息和会话记录保持不变。");
  }

  return <section className="settings-experience" aria-label="设置中心">
    <aside className="settings-sidebar">
      <div className="settings-sidebar-heading"><h2>设置中心</h2><p>按你的设备和习惯调整。</p></div>
      <div className="settings-search">
        <FloatingField id={`${id}-search`} label="搜索设置" help="可搜索画质、鼠标、服务地址等。" type="search" name="settings-search" autoComplete="off" value={query}
          onChange={event => setQuery(event.target.value)} onKeyDown={event => {
            if (event.key === "Escape") { setQuery(""); event.stopPropagation(); }
            if (event.key === "Enter" && results[0]) { event.preventDefault(); openSection(results[0].section, results[0].target); }
          }}/>
      </div>
      <nav className="settings-sidebar-nav" aria-label="设置分类">{sections.map(item =>
        <button key={item.id} type="button" className={section === item.id && !normalizedQuery ? "settings-nav-selected" : ""} aria-current={section === item.id && !normalizedQuery ? "page" : undefined} onClick={() => openSection(item.id)}>
          <span className="settings-nav-icon"><Icon name={item.icon}/></span><span><strong>{item.label}</strong><small>{item.hint}</small></span>
        </button>)}</nav>
      <div className="settings-sidebar-foot"><Icon name="shield"/><span>个人偏好仅存于本机<br/><small>远程设置用于下一次连接</small></span></div>
    </aside>

    <div className="settings-main">
      <header className="settings-page-heading"><div><h2 ref={heading} tabIndex={-1}>{normalizedQuery ? "搜索设置" : active.label}</h2><p>{normalizedQuery ? "找到选项后可直接跳转调整。" : active.hint}</p></div>
        <span className={`settings-save-indicator ${storageState === "memory" ? "storage-warning" : ""}`} role="status" aria-live="polite"><Icon name={storageState === "memory" ? "alert" : storageState === "saved" ? "check" : "settings"}/>{storageState === "memory" ? "仅本次运行有效" : storageState === "saved" ? "已保存到本机" : "更改后自动保存"}</span>
      </header>
      {storageState === "memory" && <StatusMessage error>本地存储不可用。选项已在本次运行中生效，关闭软件后可能丢失；请允许应用使用本地存储。</StatusMessage>}
      {resetNotice && <div className="settings-reset-notice" role="status"><Icon name="check"/><span>{resetNotice}</span><button type="button" className="link-button" onClick={() => setResetNotice("")}>关闭</button></div>}

      {normalizedQuery ? <article className="settings-panel settings-search-results">
        <p className="settings-results-count" role="status" aria-live="polite">找到 {results.length} 项设置</p>
        {results.length ? <ul>{results.map(item => <li key={item.title}><button type="button" onClick={() => openSection(item.section, item.target)}><span><strong>{item.title}</strong><small>{sections.find(group => group.id === item.section)!.label} · {item.description}</small></span><Icon name="arrow"/></button></li>)}</ul>
          : <div className="settings-search-empty"><Icon name="search"/><h3>没有匹配的设置</h3><p>试试“画质”“鼠标”或“服务地址”。</p><button type="button" className="secondary-action" onClick={() => { setQuery(""); document.getElementById(`${id}-search`)?.focus(); }}>清除搜索</button></div>}
      </article> : <>
        {section === "general" && <Panel icon="sun" title="外观与辅助功能" description="调整显示方式，减少阅读和操作负担。">
          <fieldset className="theme-options"><legend>界面主题</legend><p className="field-hint" id={`${id}-theme-help`}>选择跟随系统，或固定使用浅色、深色外观。</p><div>{([{ value: "system", label: "跟随系统", icon: "monitor" }, { value: "light", label: "浅色", icon: "sun" }, { value: "dark", label: "深色", icon: "moon" }] as const).map((option, index) =>
            <label key={option.value} className={preferences.theme === option.value ? "selected" : ""}><input id={index === 0 ? `${id}-theme` : undefined} type="radio" name="settings-theme" value={option.value} checked={preferences.theme === option.value} onChange={() => preferences.setTheme(option.value)} aria-describedby={`${id}-theme-help`}/><Icon name={option.icon}/><span>{option.label}</span></label>)}</div></fieldset>
          <label className="check-row setting-row"><span><strong>更大的文字</strong><small>放大文字与控件，适合高分辨率屏幕。</small></span><input id={`${id}-text`} type="checkbox" role="switch" name="large-text" checked={preferences.largeText} onChange={event => preferences.setLargeText(event.target.checked)}/></label>
          <label className="check-row setting-row"><span><strong>减少界面动画</strong><small>减少过渡效果；系统开启减少动画时也会遵循。</small></span><input id={`${id}-motion`} type="checkbox" role="switch" name="reduced-motion" checked={preferences.reducedMotion} onChange={event => preferences.setReducedMotion(event.target.checked)}/></label>
        </Panel>}

        {section === "streaming" && <>
          <Panel icon="monitor" title="默认远程画质" description="新连接优先使用此档位，连接中也可单独调整。">
            <div className="settings-field"><span><label htmlFor={`${id}-quality`}>画质档位</label><small id={`${id}-quality-help`}>{qualityDetails[quality]}</small></span><select id={`${id}-quality`} name="quality-mode" value={quality} aria-describedby={`${id}-quality-help`} onChange={event => { const mode = event.target.value as QualityMode; setQuality(mode); writePreference("remoteassist.qualityMode", mode); }}><option value="auto">自动平衡（推荐）</option><option value="sharp">清晰优先</option><option value="smooth">流畅优先</option><option value="economy">省带宽</option><option value="game">游戏（1080p60 目标）</option></select></div>
            <Note>画质和帧率取决于两端设备与网络。拥塞时会自动调整，设定目标不代表实测性能。</Note>
          </Panel>
          <Panel icon="devices" title="触控与游戏视角" description="选择适合手机、平板和鼠标的默认行为。">
            <fieldset className="settings-choice-group"><legend>默认触控方式</legend><div className="settings-choice-grid">{([{ value: "direct", label: "直触", detail: "点击位置映射到远程鼠标" }, { value: "touchpad", label: "触控板", detail: "滑动相对移动，抬手不跳位" }] as const).map((option, index) =>
              <label key={option.value} className={touchMode === option.value ? "selected" : ""}><input id={index === 0 ? `${id}-touch` : undefined} type="radio" name="settings-touch-mode" value={option.value} checked={touchMode === option.value} onChange={() => { setTouchMode(option.value); writePreference("remoteassist.touchMode", option.value); }}/><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}</div></fieldset>
            <div className="settings-field settings-range-field"><span><strong id={`${id}-sensitivity-title`}>游戏鼠标灵敏度</strong><small id={`${id}-sensitivity-help`}>0.25× 至 4×，以 0.05 递增。输入数值后离开输入框应用。</small></span><div className="settings-exact-control"><input type="range" aria-label="游戏鼠标灵敏度滑块" aria-describedby={`${id}-sensitivity-help`} name="sensitivity-slider" min="0.25" max="4" step="0.05" value={sensitivity} onChange={event => saveSensitivity(Number(event.target.value))}/><div className="settings-number-wrap"><label htmlFor={`${id}-sensitivity`} className="sr-only">游戏鼠标灵敏度数值</label><input id={`${id}-sensitivity`} type="number" name="sensitivity-value" inputMode="decimal" autoComplete="off" min="0.25" max="4" step="0.05" value={sensitivityDraft} aria-invalid={sensitivityError ? true : undefined} aria-describedby={`${id}-sensitivity-help${sensitivityError ? ` ${id}-sensitivity-error` : ""}`} onChange={event => setSensitivityDraft(event.target.value)} onBlur={validateSensitivity} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}/><span aria-hidden="true">×</span></div></div></div>
            {sensitivityError && <p id={`${id}-sensitivity-error`} className="field-error" role="alert">{sensitivityError}</p>}
            <Note>游戏视角控制需要手动开启鼠标捕获。按 Esc 退出捕获，再按 Esc 暂停操作；部分游戏可能不接受标准模拟输入。</Note>
          </Panel>
        </>}

        {section === "connection" && <>
          <Panel icon="grid" title="连接服务" description="手机、平板和电脑需要使用同一个服务地址。">
            <div className="settings-service-card"><span className={`settings-service-mark ${user && serviceStatus === "Connected" ? "online" : ""}`}><i/></span><div className="settings-service-copy"><strong>{serviceLabel}</strong><small>{serviceURL}</small></div><button id={`${id}-server`} className="secondary-action" type="button" onClick={onChangeServer}>修改服务地址</button></div>
            <Note>切换服务将退出当前账号并重新载入。请先结束正在进行的远程连接。</Note>
          </Panel>
          <Panel icon="shield" title="连接与隐私" description="访问状态保持可见，电脑端可随时暂停远程访问。">
            <ul className="settings-feature-list"><li><Icon name="check"/><span>同账号设备按设备归属校验，连接时无需临时连接码。</span></li><li><Icon name="check"/><span>优先使用设备直连，无法直连时才使用 TURN 中继。</span></li><li><Icon name="check"/><span>失焦、会话过期或断开时释放远程输入。</span></li><li><Icon name="check"/><span>会话摘要只保存时间、结果和传输路径，不保存画面与键盘内容。</span></li></ul>
          </Panel>
        </>}

        {section === "account" && <>
          <Panel icon="devices" title="账号与设备" description="账号信息和设备归属由当前服务维护。">
            {user ? <><div className="settings-profile"><span className="settings-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span><span><strong>{user.username}</strong><small>{user.role === "admin" ? "管理员账号" : "RemoteAssist 账号"}</small></span></div><dl className="settings-account-details"><div className="setting-row"><dt>邮箱</dt><dd>{user.email}</dd></div><div className="setting-row"><dt>账号角色</dt><dd>{user.role === "admin" ? "管理员" : "普通用户"}</dd></div><div className="setting-row"><dt>当前设备</dt><dd>{device?.deviceName ?? "等待设备登记"}</dd></div></dl><div className="settings-action-row"><button type="button" className="secondary-action" onClick={() => onNavigate("My Devices")}>管理我的设备</button><button type="button" className="secondary-action" onClick={() => onNavigate("Sessions")}>管理会话记录</button></div></>
              : <div className="settings-empty-account"><span className="settings-panel-icon"><Icon name="shield"/></span><div><strong>登录后管理账号</strong><p>未登录时也能调整本机外观和远程体验偏好。</p><button type="button" className="primary-action" onClick={onLogin}>登录账号</button></div></div>}
          </Panel>
          {user?.role === "admin" && <Panel icon="settings" title="管理员服务检查" description="只读检查当前服务角色和账号存储类型。">{adminError && <StatusMessage error>{adminError}</StatusMessage>}<div className="setting-row"><span>服务端角色校验</span><strong>{adminState ? "已通过" : adminError ? "检查失败" : "正在检查…"}</strong></div><div className="setting-row"><span>账号存储</span><strong>{adminState?.identityStorage === "memory" ? "本机预览（内存）" : adminState?.identityStorage === "postgresql" ? "PostgreSQL" : "待检查"}</strong></div><Note>管理员身份不改变设备归属校验。</Note></Panel>}
        </>}

        {section === "about" && <>
          <Panel icon="monitor" title="RemoteAssist" description="连接你的设备，访问状态始终可见。"><div className="setting-row"><span>版本</span><strong>{version}</strong></div><div className="setting-row"><span>运行环境</span><strong>{androidClient ? "Android 控制端" : nativeDesktop ? "Windows 桌面端" : "浏览器 / WebView"}</strong></div><div className="setting-row"><span>发布通道</span><strong>{version.includes("alpha") ? "Alpha 预览版" : "正式版本"}</strong></div><Note>当前版本未接入自动更新与系统声音传输。具体游戏控制和跨网体验仍需实机验证。</Note></Panel>
          <article className="settings-panel settings-feedback-panel"><div><h3>反馈问题，帮助改进体验</h3><p>生成包含版本和当前状态的反馈报告，由你复制并发送。</p></div><button type="button" className="secondary-action" onClick={onFeedback}>生成反馈报告</button></article>
        </>}
        {(section === "general" || section === "streaming") && <footer className="settings-defaults"><p>需要重新开始？只重置界面和远程体验偏好。</p><button type="button" className="link-button" onClick={() => setConfirmReset(true)}>恢复默认设置</button></footer>}
      </>}
    </div>
    {confirmReset && <ConfirmDialog title="恢复默认设置？" description="主题、字号、动画、画质、触控和鼠标灵敏度将恢复默认。不会修改服务地址、登录信息、设备绑定或会话记录。" confirmLabel="恢复默认设置" onCancel={() => setConfirmReset(false)} onConfirm={restoreDefaults}/>}
  </section>;
}
