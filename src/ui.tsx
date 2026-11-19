import { useEffect, useId, useRef, useState } from "react";
import type { RefObject, ReactNode, KeyboardEvent, PointerEvent } from "react";
import { remoteLayout } from "./ux";

export type IconName = "monitor" | "devices" | "shield" | "history" | "arrow" | "settings" | "grid" | "copy" | "expand" | "stop" | "check" | "sun" | "moon";
export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    devices: <><rect x="3" y="3" width="13" height="15" rx="2" /><path d="M8 21h11a2 2 0 0 0 2-2V8M7 15h5" /></>,
    shield: <><path d="m12 3 8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5M12 7v5l3 2" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    settings: <><path d="m12 3 2 3 4-.2.5 4L21 12l-2.5 2.2-.5 4-4-.2-2 3-2-3-4 .2-.5-4L3 12l2.5-2.2.5-4 4 .2Z" /><circle cx="12" cy="12" r="3" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" /></>,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
    check: <path d="m5 12 4 4L19 6" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>,
    moon: <path d="M20 15a9 9 0 0 1-11-11 9 9 0 1 0 11 11Z" />
  };
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="3.5" y="5.5" width="25" height="20" rx="5" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeWidth="2.5" /><path d="M10 32.5h12M16 25.5v7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><circle cx="30.5" cy="29.5" r="6" fill="#7566e8" stroke="white" strokeWidth="2" /><path d="M27 9.5h3.5a5 5 0 0 1 5 5v6" stroke="#7566e8" strokeWidth="2.5" strokeLinecap="round" /></svg>;
}

export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onCancel }: { title: string; description: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog=ref.current;
    const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
    dialog?.showModal();
    return () => { dialog?.close(); queueMicrotask(()=>{if(trigger?.isConnected&&(!document.activeElement||document.activeElement===document.body||dialog?.contains(document.activeElement)))trigger.focus();}); };
  }, []);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={onCancel}>
    <span className="dialog-symbol"><Icon name="shield" /></span><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-description`}>{description}</p>
    <div className="dialog-actions"><button autoFocus className="secondary-action" onClick={onCancel}>取消</button><button className="danger-action" onClick={onConfirm}>{confirmLabel}</button></div>
  </dialog>;
}

export function StatusMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={error ? "error-box" : "info-box"} role={error ? "alert" : "status"}>{children}</div>;
}

export function RemoteScreen({ videoRef, connected, status, onPointer, onKey, onWheel, onRelease, onDisconnect }: {
  videoRef: RefObject<HTMLVideoElement | null>; connected: boolean; status: string;
  onPointer: (type: "mouse_move" | "mouse_down" | "mouse_up", ev: PointerEvent<HTMLVideoElement>) => void;
  onKey: (type: "key_down" | "key_up", ev: KeyboardEvent<HTMLVideoElement>) => void;
  onWheel: (ev: WheelEvent) => void; onRelease: () => void; onDisconnect: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const inputToggle = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [source, setSource] = useState({ width: 0, height: 0 });
  const [mode, setMode] = useState<"fit" | "100" | "150">("fit");
  const [fullscreen, setFullscreen] = useState(false);
  const [inputEnabled, setInputEnabled] = useState(false);
  const [error, setError] = useState("");
  const helpId = useId();
  const releaseRef = useRef(onRelease); releaseRef.current = onRelease;
  const wheelRef=useRef(onWheel); wheelRef.current=onWheel;
  const inputRef=useRef(inputEnabled); inputRef.current=inputEnabled;

  useEffect(()=>{
    const video=videoRef.current;
    const wheel=(ev:WheelEvent)=>{if(inputRef.current){ev.preventDefault();wheelRef.current(ev);}};
    video?.addEventListener("wheel",wheel,{passive:false});
    return()=>video?.removeEventListener("wheel",wheel);
  },[videoRef]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      releaseRef.current(); setInputEnabled(false);
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => { releaseRef.current(); setInputEnabled(false); setSource({ width: video.videoWidth, height: video.videoHeight }); };
    video.addEventListener("resize", update); video.addEventListener("loadedmetadata", update); update();
    return () => { video.removeEventListener("resize", update); video.removeEventListener("loadedmetadata", update); };
  }, [videoRef]);
  useEffect(() => {
    const update = () => { setFullscreen(document.fullscreenElement === surface.current); releaseRef.current(); setInputEnabled(false); };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  useEffect(() => { if (!connected) { setSource({width:0,height:0}); setInputEnabled(false); } }, [connected]);

  const layout = remoteLayout(size, source, mode);
  const hasVideo = connected && source.width > 0;
  function suspendInput() { onRelease(); setInputEnabled(false); }
  function key(type: "key_down" | "key_up", ev: KeyboardEvent<HTMLVideoElement>) {
    if (ev.key === "Escape" || ev.key === "Tab") { suspendInput(); if(ev.key==="Escape") inputToggle.current?.focus(); return; }
    if (inputEnabled) onKey(type, ev);
  }
  async function toggleFullscreen() {
    suspendInput(); setError("");
    try { if (document.fullscreenElement === surface.current) await document.exitFullscreen(); else await surface.current?.requestFullscreen(); }
    catch { setError("当前窗口不支持全屏，你仍可拖动窗口边缘调整大小。"); }
  }
  return <div ref={surface} className="remote-screen">
    <div className="screen-toolbar" aria-label="远程画面工具栏">
      <div className="screen-title"><span className={`presence ${hasVideo ? "online" : "offline"}`}><i />{hasVideo ? "实时画面" : "等待画面"}</span><span>{hasVideo ? `${source.width} × ${source.height}` : "连接后自动适配"}</span></div>
      <div className="screen-actions">
        <label className="select-field"><span className="sr-only">画面缩放</span><select aria-label="画面缩放" value={mode} onChange={(ev) => { suspendInput(); setMode(ev.target.value as typeof mode); }}><option value="fit">适应窗口</option><option value="100">100%</option><option value="150">150%</option></select></label>
        <button ref={inputToggle} className="secondary-action" disabled={!hasVideo} aria-pressed={inputEnabled} onPointerDown={(ev)=>ev.preventDefault()} onClick={() => { onRelease(); setInputEnabled(!inputEnabled); if (!inputEnabled) videoRef.current?.focus(); }}>{inputEnabled ? "停止操作" : "操作远程电脑"}</button>
        <button className="icon-button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "退出全屏" : "全屏显示"} title={fullscreen ? "退出全屏" : "全屏显示"}><Icon name="expand" /></button>
        {connected && <button className="danger-action compact" onClick={onDisconnect}><Icon name="stop" />断开</button>}
      </div>
    </div>
    <div ref={viewport} className={`remote-viewport ${mode === "fit" ? "fit" : "zoomed"}`}>
      <div className="video-space" style={hasVideo ? { width:Math.max(size.width,layout.width), height:Math.max(size.height,layout.height) } : undefined}>
        <video ref={videoRef} autoPlay playsInline tabIndex={hasVideo ? 0 : -1} aria-label="远程桌面画面" aria-describedby={helpId}
          style={hasVideo ? {width:layout.width,height:layout.height} : {width:"100%",height:"100%"}}
          onPointerMove={(ev) => { if (inputEnabled) onPointer("mouse_move", ev); }} onPointerDown={(ev) => { if (inputEnabled) onPointer("mouse_down", ev); }} onPointerUp={(ev) => { if (inputEnabled) onPointer("mouse_up", ev); }}
          onPointerCancel={suspendInput} onBlur={suspendInput} onContextMenu={(ev) => { if (inputEnabled) ev.preventDefault(); }} onKeyDown={(ev) => key("key_down", ev)} onKeyUp={(ev) => key("key_up", ev)} />
      </div>
      {!hasVideo && <div className="screen-empty"><span className="screen-empty-icon"><Icon name="monitor" /></span><strong>{connected ? "等待对方授权与画面" : "远程画面将在这里显示"}</strong><p>{status}</p><span>适应窗口 · 原始比例 · 全屏查看</span></div>}
    </div>
    <div id={helpId} className="screen-help"><Icon name="shield" /><span>{inputEnabled ? "正在操作远程电脑。按 Esc 或 Tab 释放输入并返回本地。" : "当前仅查看画面。对方授权后，点击「操作远程电脑」开始输入。"}</span></div>
    {error && <StatusMessage error>{error}</StatusMessage>}
  </div>;
}
