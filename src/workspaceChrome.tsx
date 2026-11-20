import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BrandMark, Icon, StatusMessage } from "./ui";
import type { AssistMode, View } from "./ux";

export const nativeWindow = isTauri();

export function WindowBar({ onClose, onError }: { onClose: () => void; onError: (message: string) => void }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!nativeWindow) return;
    let disposed = false; let unlisten: (() => void) | undefined;
    const win = getCurrentWindow();
    const update = () => { void win.isMaximized().then(value => { if (!disposed) setMaximized(value); }).catch(() => undefined); };
    update(); void win.onResized(update).then(fn => { if (disposed) fn(); else unlisten = fn; }).catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, []);
  if (!nativeWindow) return null;
  const run = (action: () => Promise<void>) => { void action().catch(() => onError("窗口操作未完成，请重试。")); };
  return <div className="window-bar">
    <div className="window-drag" data-tauri-drag-region><BrandMark/><span>RemoteAssist</span><span className="window-caption">让协助自然发生</span></div>
    <div className="window-controls">
      <button aria-label="最小化窗口" title="最小化" onClick={() => run(() => getCurrentWindow().minimize())}><svg viewBox="0 0 16 16"><path d="M3 8h10"/></svg></button>
      <button aria-label={maximized ? "还原窗口" : "最大化窗口"} title={maximized ? "还原" : "最大化"} onClick={() => run(() => getCurrentWindow().toggleMaximize())}><svg viewBox="0 0 16 16">{maximized ? <path d="M5 5V3h8v8h-2M3 5h8v8H3Z"/> : <rect x="3" y="3" width="10" height="10" rx="1"/>}</svg></button>
      <button className="window-close" aria-label="关闭软件" title="关闭" onClick={onClose}><svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>
    </div>
  </div>;
}

export function ModalFrame({ title, children, onClose, className = "", closeLabel = "关闭弹窗" }: { title: string; children: ReactNode; onClose: () => void; className?: string; closeLabel?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); queueMicrotask(() => { if (trigger?.isConnected && (!document.activeElement || document.activeElement === document.body || dialog?.contains(document.activeElement))) trigger.focus({ preventScroll: true }); }); };
  }, []);
  return <dialog ref={ref} className={`workspace-dialog ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <button className="dialog-close" type="button" aria-label={closeLabel} title="关闭" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    <div className="dialog-body">{children}</div>
  </dialog>;
}

export function GuestWorkspace({ onUse }: { onUse: (mode: AssistMode) => void }) {
  return <section className="guest-workspace">
    <div className="guest-hero"><div className="guest-intro"><span className="guest-kicker"><i/> YOUR SPACE, CONNECTED</span><h2>远一点，<br/><em>也能在身边。</em></h2><p>打开熟悉的桌面，及时解决眼前的问题。<br/>先看看，需要连接时再登录。</p><div className="guest-assurance"><Icon name="shield"/>对方同意后连接，随时结束。</div></div>
      <div className="guest-connection-art" aria-hidden="true"><div className="guest-orbit"/><div className="guest-device local"><Icon name="monitor"/><span>你的桌面</span><i/></div><span className="guest-link"><Icon name="arrow"/></span><div className="guest-device remote"><Icon name="devices"/><span>远方的设备</span><i/></div><span className="guest-art-caption">A LITTLE CLOSER.</span></div>
    </div>
    <div className="guest-action-grid"><button className="guest-action" onClick={() => onUse("share")}><span className="guest-action-icon"><Icon name="monitor"/></span><span><small>我需要帮助</small><strong>共享这台电脑</strong><span>登录 · 选择主屏 · 邀请对方</span></span><Icon name="arrow"/></button><button className="guest-action" onClick={() => onUse("control")}><span className="guest-action-icon mint"><Icon name="devices"/></span><span><small>我来帮忙</small><strong>连接另一台电脑</strong><span>登录 · 输入连接码 · 等待同意</span></span><Icon name="arrow"/></button></div>
    <div className="guest-detail-grid"><article><span>01</span><div><strong>画质随网络调整</strong><p>按场景选择文字清晰或动态流畅。</p></div></article><article><span>02</span><div><strong>连接状态看得见</strong><p>查看往返延迟、丢包和画面统计。</p></div></article><article><span>03</span><div><strong>控制权始终在你</strong><p>每次明确同意，断开即停止输入。</p></div></article></div>
  </section>;
}

export function GuestFeature({ view, onLogin, onUse }: { view: View; onLogin: () => void; onUse: (mode: AssistMode) => void }) {
  if (view === "Remote Assist") return <section className="guest-feature table-card"><span className="eyebrow">START A CONNECTION</span><h2>这次，谁来帮助谁？</h2><p>选好方向后登录。共享屏幕和远程控制都需要你再次确认。</p><div className="guest-action-grid"><button className="guest-action" onClick={() => onUse("share")}><Icon name="monitor"/><span><strong>共享这台电脑</strong><span>让信任的人帮助你</span></span><Icon name="arrow"/></button><button className="guest-action" onClick={() => onUse("control")}><Icon name="devices"/><span><strong>连接另一台电脑</strong><span>使用对方的临时连接码</span></span><Icon name="arrow"/></button></div><div className="guest-feature-tip"><Icon name="shield"/>登录不会自动开启共享。</div></section>;
  return <section className="guest-feature table-card"><span className="guest-feature-icon"><Icon name={view === "Sessions" ? "history" : "devices"}/></span><h2>{view === "Sessions" ? "每次协助，都有一份小结" : "把常用设备放在一起"}</h2><p>{view === "Sessions" ? "登录后查看本机的协助时间、方向与连接结果，按需保留记录。" : "登录后查看已绑定设备，添加备注，向在线设备发送协助请求。"}</p><button className="primary-action" onClick={onLogin}>登录后使用<Icon name="arrow"/></button><p className="field-hint">你可以继续浏览，随时再登录。</p></section>;
}

export function FeedbackDialog({ version, page, connection, onClose }: { version: string; page: string; connection: string; onClose: () => void }) {
  const [category, setCategory] = useState("画面与流畅度");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState("");
  const [copied, setCopied] = useState(false);
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const invalid = () => detail.trim().length < 10 ? "请至少填写 10 个字，说明做了什么、出现了什么问题。" : "";
  return <ModalFrame title="使用反馈" onClose={onClose} className="feedback-dialog"><span className="eyebrow">HELP US IMPROVE</span><h2>哪里还可以更好？</h2><p>描述你的体验，生成一份可复制的反馈。当前版本不会自动发送。</p>
    {!report ? <form noValidate onSubmit={event => { event.preventDefault(); const message = invalid(); setError(message); if (message) { field.current?.focus(); return; } setReport(`RemoteAssist 使用反馈\n版本：${version}\n页面：${page}\n连接状态：${connection}\n问题类型：${category}\n\n${detail.trim()}`); }}>
      <fieldset className="feedback-types"><legend>反馈类型</legend>{["画面与流畅度", "连接问题", "界面体验", "功能建议"].map(item => <label key={item}><input type="radio" name="feedback-type" checked={category === item} onChange={() => setCategory(item)}/>{item}</label>)}</fieldset>
      <label htmlFor={id}>具体描述</label><textarea ref={field} id={id} value={detail} maxLength={2000} rows={5} onChange={event => { setDetail(event.target.value); setError(""); }} onBlur={() => setError(invalid())} aria-invalid={error ? true : undefined} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}/><p id={`${id}-help`} className="field-hint">10–2000 个字。请勿填写密码、连接码或其他敏感信息。</p>{error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}<button className="primary-action wide-action" type="submit" onPointerDown={event => { if (event.button === 0) event.preventDefault(); }}>生成反馈<Icon name="arrow"/></button>
    </form> : <><label htmlFor={`${id}-report`}>反馈预览</label><textarea id={`${id}-report`} readOnly value={report} rows={10}/><p className="field-hint">只包含上面显示的内容，没有附加账号、令牌、设备标识或日志。</p>{error && <StatusMessage error>{error}</StatusMessage>}<div className="feedback-actions"><button className="secondary-action" onClick={() => { setReport(""); setCopied(false); setError(""); }}>继续编辑</button><button className="primary-action" onClick={() => { void navigator.clipboard.writeText(report).then(() => { setCopied(true); setError(""); }).catch(() => setError("复制失败，请在预览中手动选择并复制。")); }}><Icon name={copied ? "check" : "copy"}/>{copied ? "已复制" : "复制反馈"}</button></div><p role="status">{copied ? "已复制到剪贴板，可粘贴给维护者。尚未发送。" : "关闭弹窗后不会保存这份反馈。"}</p></>}
  </ModalFrame>;
}
