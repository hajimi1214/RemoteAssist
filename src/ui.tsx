import { useEffect, useId, useRef, useState } from "react";
import type { RefObject, ReactNode, KeyboardEvent, PointerEvent } from "react";
import { MobileControls } from "./MobileControls";
import { filledVideoLayout } from "./mobileInput";
import type { MobileAction, TouchMode } from "./mobileInput";
import { remoteLayout } from "./ux";
import type { VideoTelemetry } from "./videoTelemetry";
import type { VideoPreference } from "./connectionQuality";
import { appendTrend, connectionHealth, trendSegments } from "./connectionHealth";
import type { TrendPoint } from "./connectionHealth";
import { relativeMouseSample } from "./gameInput";
import type { QualityMode } from "./qualityMode";
import { readPreference, writePreference } from "./preferenceStore";

export function QualityPreference({value,onChange}: {value:VideoPreference;onChange:(value:VideoPreference)=>void}) {
  const options=[{id:"auto",title:"自动平衡",detail:"随网络调整清晰度与帧率",icon:"grid"},{id:"text",title:"文字优先",detail:"适合代码、文档与表格",icon:"monitor"},{id:"motion",title:"流畅优先",detail:"适合滚动、演示与动态画面",icon:"arrow"}] as const;
  return <fieldset className="quality-options"><legend>画质偏好</legend><div>{options.map(option=><label key={option.id} className={value===option.id?"selected":""}><input type="radio" name="quality-preference" value={option.id} checked={value===option.id} onChange={()=>onChange(option.id)}/><span className="quality-symbol"><Icon name={option.icon}/></span><span><strong>{option.title}</strong><small>{option.detail}</small></span><span className="quality-check" aria-hidden="true">{value===option.id&&<Icon name="check"/>}</span></label>)}</div><p>网络不足时仍会自动降级。偏好不会改变共享与控制权限。</p></fieldset>;
}

export function ConnectionDiagnostics({sample}: {sample:VideoTelemetry|null}) {
  const [history,setHistory]=useState<TrendPoint[]>([]);
  const [updated,setUpdated]=useState(0);
  useEffect(()=>{if(!sample){setHistory([]);setUpdated(0);return;}const at=Date.now();setHistory(previous=>appendTrend(previous,sample,at));setUpdated(at);},[sample]);
  if(!sample)return null;
  const advice=connectionHealth(sample);
  const metric=(value:number|undefined,unit:string)=>value==null?"暂不可用":`${value} ${unit}`;
  const limits:Record<string,string>={none:"未报告限制",cpu:"编码处理压力",bandwidth:"带宽压力",other:"其他限制"};
  return <section className="diagnostics-card"><div className={`health-summary ${advice.severity}`}><span className="health-icon"><Icon name="shield"/></span><div><strong>{advice.title}</strong><p>{advice.detail}</p></div><span className="health-route">{sample.route==="P2P"?"设备直连":sample.route==="TURN Relay"?"中继连接":"检测路径"}</span></div>
    <details className="connection-diagnostics"><summary><span>连接与画质详情</span><small>{sample.width&&sample.height?`${sample.width} × ${sample.height}`:"等待画面"}{updated?` · ${new Date(updated).toLocaleTimeString("zh-CN")} 采样`:""}</small></summary>
    <div className="trend-grid">{(["rttMs","bitrateKbps"] as const).map(field=><figure key={field}><figcaption><span>{field==="rttMs"?"网络往返趋势":"视频码率趋势"}</span><strong>{metric(field==="rttMs"?sample.rttMs==null?undefined:Math.round(sample.rttMs):sample.bitrateKbps,field==="rttMs"?"ms":"kbps")}</strong></figcaption><svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`${field==="rttMs"?"网络往返":"视频码率"}最近 ${history.length} 个采样，缺测不连线`}><path d="M0 36H100M0 20H100" className="trend-guide"/>{trendSegments(history,field).map((points,index)=><polyline key={index} points={points} className="trend-line"/>)}</svg><small>最近最多 30 个采样 · 自适应纵轴</small></figure>)}</div>
    <p>最近采样间隔的统计，仅保留在本机内存。编解码耗时为单帧平均值，不等于端到端操作延迟。</p><dl>
    <div><dt>编码格式</dt><dd>{sample.codec??"协商中"}</dd></div>
    <div><dt>实际分辨率</dt><dd>{sample.width&&sample.height?`${sample.width} × ${sample.height}`:"待测量"}</dd></div>
    <div><dt>{sample.direction==="send"?"编码帧率":"解码帧率"}</dt><dd>{metric(sample.fps,"fps")}</dd></div>
    <div><dt>{sample.direction==="send"?"视频发送码率":"视频接收码率"}</dt><dd>{metric(sample.bitrateKbps,"kbps")}</dd></div>
    <div><dt>网络往返时间</dt><dd>{metric(sample.rttMs==null?undefined:Math.round(sample.rttMs),"ms")}</dd></div>
    {sample.direction==="send"?<><div><dt>平均编码耗时</dt><dd>{metric(sample.encodeMs,"ms")}</dd></div><div><dt>平均发送排队</dt><dd>{metric(sample.sendQueueMs,"ms")}</dd></div><div><dt>编码器限制</dt><dd>{sample.qualityLimitation?limits[sample.qualityLimitation]??"未知":"暂不可用"}</dd></div></>:<>
      <div><dt>间隔丢包率</dt><dd>{metric(sample.packetLossPercent,"%")}</dd></div>
      <div><dt>网络抖动</dt><dd>{metric(sample.jitterMs==null?undefined:Math.round(sample.jitterMs*10)/10,"ms")}</dd></div>
      <div><dt>平均解码耗时</dt><dd>{metric(sample.decodeMs,"ms")}</dd></div>
      <div><dt>平均缓冲停留</dt><dd>{metric(sample.jitterBufferMs,"ms")}</dd></div>
      <div><dt>间隔丢弃帧数</dt><dd>{metric(sample.framesDropped,"帧")}</dd></div>
      <div><dt>累计画面冻结</dt><dd>{metric(sample.freezes,"次")}</dd></div>
    </>}
  </dl><p>静止桌面可能几乎不产生新帧，低 fps 或低码率不一定代表连接故障。</p></details></section>;
}

export type IconName = "monitor" | "devices" | "shield" | "history" | "arrow" | "settings" | "grid" | "copy" | "expand" | "shrink" | "pause" | "play" | "stop" | "check" | "sun" | "moon" | "info" | "alert" | "search";
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
    shrink: <path d="M3 8h5V3m13 5h-5V3M3 16h5v5m13-5h-5v5" />,
    pause: <><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></>,
    play: <path d="m8 5 12 7-12 7Z" />,
    stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
    check: <path d="m5 12 4 4L19 6" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>,
    moon: <path d="M20 15a9 9 0 0 1-11-11 9 9 0 1 0 11 11Z" />,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></>,
    alert: <><path d="M10.3 4.4 2.8 17.5A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.5L13.7 4.4a2 2 0 0 0-3.4 0Z"/><path d="M12 9v5m0 3v.1"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>
  };
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="3.5" y="5.5" width="25" height="20" rx="5" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeWidth="2.5" /><path d="M10 32.5h12M16 25.5v7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><circle cx="30.5" cy="29.5" r="6" fill="#7566e8" stroke="white" strokeWidth="2" /><path d="M27 9.5h3.5a5 5 0 0 1 5 5v6" stroke="#7566e8" strokeWidth="2.5" strokeLinecap="round" /></svg>;
}

export function ConnectionIllustration() {
  return <div className="connection-art" aria-hidden="true">
    <div className="connection-art-orbit"/>
    <div className="illustrated-desktop"><div className="illustrated-toolbar"><span className="illustrated-dots"><i/><i/><i/></span><span>你的工作空间</span><Icon name="shield"/></div><div className="illustrated-content"><div className="illustrated-sidebar"><i/><i/><i/><i/></div><div className="illustrated-workspace"><div className="illustrated-heading"/><div className="illustrated-cards"><span><Icon name="monitor"/></span><span><Icon name="devices"/></span></div><div className="illustrated-lines"><i/><i/><i/></div></div></div></div>
    <span className="illustrated-connector"><Icon name="arrow"/></span>
    <div className="illustrated-endpoint"><span><Icon name="devices"/></span><div><strong>远方的设备</strong><small>一次邀请，让距离更近</small></div><Icon name="shield"/></div>
  </div>;
}

export function ButtonSpinner() { return <span className="button-spinner" aria-hidden="true"/>; }

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
  return <div className={`${error ? "error-box" : "info-box"} status-message`} role={error ? "alert" : "status"}><Icon name={error ? "alert" : "info"}/><div>{children}</div></div>;
}

const screenTools = [
  {id:"picture",label:"画面",icon:"monitor"},
  {id:"input",label:"操控",icon:"devices"},
  {id:"link",label:"连接",icon:"history"},
] as const;
type ScreenTool = (typeof screenTools)[number]["id"];

export function RemoteScreen({ videoRef, connected, status, onPointer, onKey, onWheel, onRelease, onDisconnect, onMobileAction, textSupported, gameInputSupported = false, onGameMouse = () => false, autoControl = false, autoFullscreen = autoControl, deviceName = "远程桌面", telemetry = null, latency = null, qualityMode = "auto", onQualityModeChange }: {
  onMobileAction: (action: MobileAction) => boolean; textSupported: boolean; autoControl?: boolean; autoFullscreen?: boolean; deviceName?: string;
  gameInputSupported?: boolean; onGameMouse?: (action:{type:"mouse_relative"|"mouse_down"|"mouse_up";payload:Record<string,unknown>})=>boolean;
  videoRef: RefObject<HTMLVideoElement | null>; connected: boolean; status: string; telemetry?: VideoTelemetry | null; latency?: number | null;
  qualityMode?: QualityMode; onQualityModeChange?: (mode:QualityMode)=>void;
  onPointer: (type: "mouse_move" | "mouse_down" | "mouse_up", ev: PointerEvent<HTMLVideoElement>) => void;
  onKey: (type: "key_down" | "key_up", ev: KeyboardEvent<HTMLVideoElement>) => void;
  onWheel: (ev: WheelEvent) => void; onRelease: () => void; onDisconnect: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const toolToggle = useRef<HTMLButtonElement>(null);
  const toolContent = useRef<HTMLDivElement>(null);
  const nativeFullscreen = useRef(false);
  const explicitFullscreenExit = useRef(false);
  const autoOpened = useRef(false);
  const compactTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [source, setSource] = useState({ width: 0, height: 0 });
  const [mode, setMode] = useState<"fit" | "fill" | "100" | "150">("fit");
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [tool, setTool] = useState<ScreenTool>("picture");
  const [gamePointerLocked,setGamePointerLocked]=useState(false);
  const [gameMouseNotice,setGameMouseNotice]=useState("");
  const [gameSensitivity,setGameSensitivity]=useState(()=>{const v=Number(readPreference("remoteassist.gameSensitivity"));return Number.isFinite(v)&&v>=.25&&v<=4?v:1;});
  const [touchMode,setTouchMode]=useState<TouchMode>("direct");
  const [compact,setCompact]=useState(false),[autoCompact,setAutoCompact]=useState(true);
  const [inputEnabled, setInputEnabled] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [backgroundPaused, setBackgroundPaused] = useState(false);
  const helpId = useId();
  const releaseRef = useRef(onRelease); releaseRef.current = onRelease;
  const wheelRef = useRef(onWheel); wheelRef.current = onWheel;
  const inputRef = useRef(false); inputRef.current = inputEnabled&&!toolsOpen;
  const live = useRef({connected,autoControl,manualPaused,source}); live.current={connected,autoControl,manualPaused,source};
  const hasVideo = connected && source.width > 0 && source.height > 0;
  const immersive = fullscreen || expanded;
  useEffect(()=>{
    clearTimeout(compactTimer.current);setCompact(false);
    if(autoCompact&&immersive&&connected&&!toolsOpen)compactTimer.current=setTimeout(()=>setCompact(true),3500);
    return()=>clearTimeout(compactTimer.current);
  },[autoCompact,immersive,connected,toolsOpen]);
  function revealBar(){setCompact(false);clearTimeout(compactTimer.current);if(autoCompact&&immersive&&connected&&!toolsOpen)compactTimer.current=setTimeout(()=>setCompact(true),3500);}

  useEffect(()=>{if(toolContent.current)toolContent.current.scrollTop=0;},[tool,toolsOpen]);

  useEffect(() => {
    const video=videoRef.current;
    const wheel=(event:WheelEvent)=>{if(inputRef.current){event.preventDefault();wheelRef.current(event);}};
    video?.addEventListener("wheel",wheel,{passive:false});
    return()=>video?.removeEventListener("wheel",wheel);
  },[videoRef]);
  useEffect(() => {
    const element=viewport.current;if(!element)return;
    const observer=new ResizeObserver(([entry])=>{
      releaseRef.current();
      setSize(previous=>previous.width===entry.contentRect.width&&previous.height===entry.contentRect.height?previous:{width:entry.contentRect.width,height:entry.contentRect.height});
    });
    observer.observe(element);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    let wasLocked=false;
    const change=()=>{
      const locked=document.pointerLockElement===videoRef.current;
      setGamePointerLocked(locked);
      if(wasLocked&&!locked)releaseRef.current();
      wasLocked=locked;
    };
    const blur=()=>{if(document.pointerLockElement===videoRef.current)document.exitPointerLock();};
    document.addEventListener("pointerlockchange",change);
    window.addEventListener("blur",blur);
    return()=>{document.removeEventListener("pointerlockchange",change);window.removeEventListener("blur",blur);if(document.pointerLockElement===videoRef.current)document.exitPointerLock();};
  },[videoRef]);
  useEffect(() => {
    const video=videoRef.current;if(!video)return;
    const update=()=>{const next={width:video.videoWidth,height:video.videoHeight};setSource(previous=>{
      if(previous.width===next.width&&previous.height===next.height)return previous;
      releaseRef.current();return next;
    });};
    video.addEventListener("resize",update);video.addEventListener("loadedmetadata",update);update();
    return()=>{video.removeEventListener("resize",update);video.removeEventListener("loadedmetadata",update);};
  },[videoRef]);
  useEffect(() => {
    const change=()=>{
      const next=document.fullscreenElement===surface.current;
      if(nativeFullscreen.current===next)return;
      nativeFullscreen.current=next;
      setFullscreen(next);
      releaseRef.current();
      if(!next){
        setExpanded(false);
        if(!explicitFullscreenExit.current&&live.current.connected){
          setInputEnabled(false);setManualPaused(true);setTool("input");setToolsOpen(true);
        }
        explicitFullscreenExit.current=false;
      }
    };
    document.addEventListener("fullscreenchange",change);return()=>document.removeEventListener("fullscreenchange",change);
  },[]);
  useEffect(() => {
    if(!connected){
      autoOpened.current=false;setSource({width:0,height:0});setInputEnabled(false);setManualPaused(false);setBackgroundPaused(false);setExpanded(false);setToolsOpen(false);
      if(document.pointerLockElement===videoRef.current)document.exitPointerLock();
      if(document.fullscreenElement===surface.current)void document.exitFullscreen().catch(()=>{});
      return;
    }
    if(hasVideo&&autoFullscreen&&!autoOpened.current){autoOpened.current=true;setExpanded(true);setToolsOpen(false);if(autoControl)videoRef.current?.focus({preventScroll:true});}
    if(hasVideo&&autoControl&&!manualPaused&&!backgroundPaused&&!document.hidden)setInputEnabled(true);
    if(!hasVideo)setInputEnabled(false);
  },[connected,hasVideo,autoControl,autoFullscreen,manualPaused,backgroundPaused]);
  useEffect(() => {
    const suspend=()=>{releaseRef.current();setInputEnabled(false);setBackgroundPaused(true);};
    const resume=()=>{
      if(document.hidden)return;
      setBackgroundPaused(false);
      const current=live.current;
      if(current.connected&&current.source.width>0&&current.autoControl&&!current.manualPaused)setInputEnabled(true);
    };
    const visibility=()=>document.hidden?suspend():resume();
    const geometry=()=>releaseRef.current();
    window.addEventListener("blur",suspend);window.addEventListener("focus",resume);document.addEventListener("visibilitychange",visibility);window.addEventListener("orientationchange",geometry);
    return()=>{window.removeEventListener("blur",suspend);window.removeEventListener("focus",resume);document.removeEventListener("visibilitychange",visibility);window.removeEventListener("orientationchange",geometry);};
  },[]);
  function suspendInput(){onRelease();if(document.pointerLockElement===videoRef.current)document.exitPointerLock();setManualPaused(true);setInputEnabled(false);}
  function toggleInput(){if(inputEnabled){suspendInput();return;}onRelease();setManualPaused(false);setBackgroundPaused(false);setInputEnabled(hasVideo);setToolsOpen(false);videoRef.current?.focus({preventScroll:true});}
  function toggleTools(){onRelease();if(document.pointerLockElement===videoRef.current)document.exitPointerLock();setToolsOpen(open=>!open);}
  async function toggleGamePointer(){
    const video=videoRef.current as (HTMLVideoElement & {requestPointerLock: (options?:{unadjustedMovement?:boolean})=>Promise<void>|void}) | null;
    if(!video||!gameInputSupported||!hasVideo||!inputEnabled)return;
    if(document.pointerLockElement===video){document.exitPointerLock();return;}
    onRelease();setToolsOpen(false);video.focus({preventScroll:true});setGameMouseNotice("");
    try { await video.requestPointerLock({unadjustedMovement:true}); }
    catch {
      try { await video.requestPointerLock();setGameMouseNotice("浏览器未提供未加速移动，已使用标准指针锁定模式。"); }
      catch { setGameMouseNotice("无法捕获游戏鼠标，请点“启动游戏鼠标”再试。"); }
    }
  }
  async function exitFullscreen(){
    onRelease();setExpanded(false);
    if(document.pointerLockElement===videoRef.current)document.exitPointerLock();
    if(document.fullscreenElement===surface.current){
      explicitFullscreenExit.current=true;
      await document.exitFullscreen().catch(()=>{explicitFullscreenExit.current=false;});
    }
  }
  async function enterFullscreen(){onRelease();setExpanded(true);setToolsOpen(false);try{await surface.current?.requestFullscreen();}catch{/* The fixed application surface fills WebViews without native fullscreen. */}}
  useEffect(()=>{
    const escape=(event:globalThis.KeyboardEvent)=>{if(event.key!=="Escape"||!live.current.connected)return;if(document.pointerLockElement===videoRef.current){event.preventDefault();event.stopPropagation();document.exitPointerLock();return;}event.preventDefault();event.stopPropagation();releaseRef.current();setInputEnabled(false);setManualPaused(true);setExpanded(false);setTool("input");setToolsOpen(true);toolToggle.current?.focus({preventScroll:true});if(document.fullscreenElement===surface.current)void document.exitFullscreen().catch(()=>{});};
    document.addEventListener("keydown",escape,true);return()=>document.removeEventListener("keydown",escape,true);
  },[]);
  function key(type:"key_down"|"key_up",event:KeyboardEvent<HTMLVideoElement>){if(event.key!=="Escape"&&inputEnabled&&!toolsOpen)onKey(type,event);}
  function gameButton(type:"mouse_down"|"mouse_up",event:PointerEvent<HTMLVideoElement>){onGameMouse({type,payload:{button:event.button,relative:true}});}
  function selectToolWithKey(event:KeyboardEvent<HTMLButtonElement>,index:number){
    const count=screenTools.length;
    const next=event.key==="ArrowRight"?(index+1)%count:event.key==="ArrowLeft"?(index+count-1)%count:event.key==="Home"?0:event.key==="End"?count-1:-1;
    if(next<0)return;
    event.preventDefault();
    setTool(screenTools[next].id);
    event.currentTarget.parentElement?.querySelectorAll("button")[next]?.focus();
  }
  const layout=mode==="fill"?filledVideoLayout(size,source):remoteLayout(size,source,mode);
  const layoutReset=`${size.width}:${size.height}:${source.width}:${source.height}:${mode}:${immersive}:${toolsOpen}`;
  const measured=(value:number|null|undefined,unit:string,decimals=0)=>typeof value==="number"&&Number.isFinite(value)&&value>=0?`${Number(value.toFixed(decimals))} ${unit}`:"待测";
  const measuredRtt=telemetry?.rttMs??latency;
  const actualWidth=telemetry?.width??source.width,actualHeight=telemetry?.height??source.height;
  const actualResolution=actualWidth>0&&actualHeight>0?`${actualWidth} × ${actualHeight}`:"待测";
  const controlLabel=inputEnabled?"暂停操作":"恢复操作";
  const controlState=inputEnabled?"正在操作":manualPaused||backgroundPaused?"已暂停":"仅观看";
  const fullscreenLabel=immersive?"退出全屏":"全屏显示";
  const advice=telemetry?connectionHealth(telemetry):null;
  const route=telemetry?.route==="P2P"?"设备直连":telemetry?.route==="TURN Relay"?"中继连接":"检测路径";
  return <div ref={surface} className={`remote-screen modern-screen touch-mode-${touchMode}${inputEnabled&&!toolsOpen?" input-active":""}${connected?" session-present":""}${expanded?" expanded-screen":""}${toolsOpen?" tools-open":""}`}>
    <div className={`screen-floating-bar${compact?" bar-compact":""}`} role="group" aria-label="远程桌面快捷操作" onPointerEnter={revealBar} onFocusCapture={revealBar}>
      <span className="screen-floating-name" title={deviceName}><i className={inputEnabled?"control-ready":""}/><span>{deviceName}<small>{controlState} · 解码 {measured(telemetry?.fps,"fps",1)} · {measured(measuredRtt,"ms")}</small></span></span>
      <button ref={toolToggle} className="screen-menu-toggle" aria-label={toolsOpen?"收起工具":"工具"} title={toolsOpen?"收起工具":"工具"} aria-expanded={toolsOpen} aria-controls={`${helpId}-tools`} onClick={toggleTools}><Icon name="settings"/></button>
      {connected&&<button disabled={!hasVideo} aria-label={controlLabel} title={controlLabel} onClick={toggleInput}><Icon name={inputEnabled?"pause":"play"}/></button>}
      <button className="screen-floating-exit" aria-label={fullscreenLabel} title={fullscreenLabel} onClick={()=>void (immersive?exitFullscreen():enterFullscreen())}><Icon name={immersive?"shrink":"expand"}/></button>
      {connected&&<button className="screen-floating-disconnect" aria-label="断开" title="断开连接" onClick={()=>{onRelease();onDisconnect();}}><Icon name="stop"/></button>}
    </div>
    <div ref={viewport} className={`remote-viewport ${mode==="fit"?"fit":mode==="fill"?"fill":"zoomed"}`}>
      <div className="video-space" style={hasVideo?{width:mode==="fill"?size.width:Math.max(size.width,layout.width),height:mode==="fill"?size.height:Math.max(size.height,layout.height)}:undefined}>
        <video ref={videoRef} autoPlay playsInline tabIndex={hasVideo&&!toolsOpen?0:-1} aria-label="远程桌面画面" aria-describedby={helpId}
          style={hasVideo?{width:layout.width,height:layout.height}:{width:"100%",height:"100%"}}
          onPointerMove={event=>{if(inputEnabled&&!toolsOpen&&gamePointerLocked){const sample=relativeMouseSample(event.movementX,event.movementY,gameSensitivity);if(sample)onGameMouse(sample);}else if(inputEnabled&&!toolsOpen&&event.pointerType!=="touch"&&event.pointerType!=="pen")onPointer("mouse_move",event);}}
          onPointerDown={event=>{if(inputEnabled&&!toolsOpen&&gamePointerLocked){event.preventDefault();gameButton("mouse_down",event);}else if(inputEnabled&&!toolsOpen&&event.pointerType!=="touch"&&event.pointerType!=="pen")onPointer("mouse_down",event);}}
          onPointerUp={event=>{if(inputEnabled&&!toolsOpen&&gamePointerLocked){event.preventDefault();gameButton("mouse_up",event);}else if(inputEnabled&&!toolsOpen&&event.pointerType!=="touch"&&event.pointerType!=="pen")onPointer("mouse_up",event);}}
          onPointerCancel={()=>onRelease()} onBlur={()=>onRelease()} onContextMenu={event=>{if(inputEnabled)event.preventDefault();}} onKeyDown={event=>key("key_down",event)} onKeyUp={event=>key("key_up",event)}/>
      </div>
      {!hasVideo&&<div className="screen-empty"><span className="screen-empty-icon"><Icon name="monitor"/></span><strong>{connected?"正在准备电脑画面":"远程画面将在这里显示"}</strong><p>{status}</p></div>}
      {hasVideo&&inputEnabled&&touchMode==="touchpad"&&<span className="touchpad-mode-badge">触控板 · 单指移动 / 双指滚动</span>}
    </div>
    {toolsOpen&&<div className="screen-tools-backdrop" aria-hidden="true" onContextMenu={event=>event.preventDefault()} onClick={()=>{setToolsOpen(false);toolToggle.current?.focus({preventScroll:true});}}/>}
    <aside id={`${helpId}-tools`} className="screen-tools-panel" aria-label="远程桌面工具" hidden={!toolsOpen}>
      <header className="screen-tools-header">
        <div className="screen-title"><span title={deviceName}>{deviceName}</span><span className={`screen-control-chip${inputEnabled?" control-ready":""}`}>{controlState}</span></div>
        <div role="tablist" className="screen-tool-tabs" aria-label="工具分类">
          {screenTools.map(({id,label,icon},index)=><button key={id} type="button" role="tab" id={`${helpId}-tab-${id}`} aria-selected={tool===id} aria-controls={`${helpId}-pane-${id}`} tabIndex={tool===id?0:-1} onClick={()=>setTool(id)} onKeyDown={event=>selectToolWithKey(event,index)}><Icon name={icon}/>{label}</button>)}
        </div>
      </header>
      <div ref={toolContent} className="screen-tools-content">
      <section id={`${helpId}-pane-picture`} role="tabpanel" aria-labelledby={`${helpId}-tab-picture`} tabIndex={0} className="screen-tool-pane" hidden={tool!=="picture"}>
        {onQualityModeChange&&<fieldset className="screen-quality-options"><legend>画质与流畅度</legend>{([{value:"auto",label:"自动",detail:"智能调节"},{value:"sharp",label:"清晰",detail:"最高 4K / 60 fps 目标"},{value:"smooth",label:"流畅",detail:"动态优先"},{value:"economy",label:"省带宽",detail:"降低传输负载"},...(gameInputSupported?[{value:"game" as const,label:"游戏",detail:"最高1080p60目标"}]:[])]as const).map(option=><label key={option.value} className={qualityMode===option.value?"selected":""}><input type="radio" name={`${helpId}-quality`} checked={qualityMode===option.value} onChange={()=>onQualityModeChange(option.value)}/><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}</fieldset>}
        <fieldset className="zoom-options"><legend>画面显示</legend>{([{value:"fit",label:"完整画面"},{value:"fill",label:"铺满裁边"},{value:"100",label:"100%"},{value:"150",label:"150%"}]as const).map(option=><label key={option.value} className={mode===option.value?"selected":""}><input type="radio" name={`${helpId}-zoom`} value={option.value} checked={mode===option.value} onChange={()=>{onRelease();setMode(option.value);}}/><span>{option.label}</span></label>)}</fieldset>
        <label className="screen-compact-setting"><input type="checkbox" checked={autoCompact} onChange={event=>setAutoCompact(event.target.checked)}/><span>全屏时淡化悬浮栏</span></label>
      </section>
      <section id={`${helpId}-pane-input`} role="tabpanel" aria-labelledby={`${helpId}-tab-input`} tabIndex={0} className="screen-tool-pane" hidden={tool!=="input"}>
        <button className="secondary-action screen-input-toggle" disabled={!hasVideo} onClick={toggleInput}><Icon name={inputEnabled?"pause":"play"}/>{controlLabel}</button>
        <MobileControls videoRef={videoRef} enabled={inputEnabled} available={hasVideo} textSupported={textSupported} open={toolsOpen&&tool==="input"} resetKey={layoutReset} onModeChange={setTouchMode} onAction={action=>inputEnabled&&hasVideo?onMobileAction(action):false} onRelease={onRelease} onSuspend={suspendInput}/>
        {gameInputSupported&&<section className="game-pointer-control" aria-label="游戏鼠标相对控制"><div><strong>游戏视角控制</strong><small>手动捕获鼠标以控制视角。按 Esc 退出；失焦、暂停或断开会释放。兼容模式使用 Windows 标准输入模拟，不等同物理鼠标 Raw Input，部分游戏可能不接受。</small></div><button type="button" disabled={!hasVideo||!inputEnabled} aria-pressed={gamePointerLocked} onClick={()=>void toggleGamePointer()}>{gamePointerLocked?"退出游戏鼠标":"启动游戏鼠标"}</button><label><span>灵敏度 {gameSensitivity.toFixed(2)}×</span><input aria-label="游戏鼠标灵敏度" type="range" min="0.25" max="4" step="0.05" value={gameSensitivity} onChange={event=>{const value=Number(event.target.value);setGameSensitivity(value);writePreference("remoteassist.gameSensitivity",String(value));}}/></label>{gameMouseNotice&&<small role="status">{gameMouseNotice}</small>}</section>}{backgroundPaused&&<div className="screen-help"><Icon name="shield"/><span>应用已离开前台，输入已释放。</span></div>}
      </section>
      <section id={`${helpId}-pane-link`} role="tabpanel" aria-labelledby={`${helpId}-tab-link`} tabIndex={0} className="screen-tool-pane" hidden={tool!=="link"}>
        <div className="screen-stream-summary"><Icon name="monitor"/><span><strong>{actualResolution}</strong><small>{route} · {telemetry?.codec??"编码协商中"}</small></span></div>
        <dl className="screen-live-metrics" aria-label="连接与画面统计">
          <div><dt>解码帧率</dt><dd>{measured(telemetry?.fps,"fps",1)}</dd></div>
          <div><dt>实际码率</dt><dd>{measured(telemetry?.bitrateKbps,"kbps")}</dd></div><div><dt>网络往返</dt><dd>{measured(measuredRtt,"ms")}</dd></div>
          <div><dt>间隔丢弃帧</dt><dd>{measured(telemetry?.framesDropped,"帧")}</dd></div><div><dt>间隔丢包率</dt><dd>{measured(telemetry?.packetLossPercent,"%",1)}</dd></div>
          <div><dt>平均解码</dt><dd>{measured(telemetry?.decodeMs,"ms",1)}</dd></div><div><dt>平均接收缓冲</dt><dd>{measured(telemetry?.jitterBufferMs,"ms",1)}</dd></div>
        </dl>
        {advice&&<section className={`screen-health-summary ${advice.severity}`} aria-label="连接健康提示"><span className="screen-health-mark"><Icon name={advice.severity==="warning"?"alert":advice.severity==="pending"?"info":"check"}/></span><span className="screen-health-copy"><strong>{advice.title}</strong><small>{advice.detail}</small></span></section>}
        <p className="screen-stat-note">帧率来自 WebRTC 解码计数，不等于屏幕实际呈现帧率；网络往返时间也不包含采集、编码或显示耗时。</p>
      </section>
      </div>
    </aside>
    <p id={helpId} className="sr-only">{toolsOpen?"工具面板已打开，画面不会接收操作。":inputEnabled?"远程输入已开启。":"远程输入未开启。"}</p>
  </div>;
}
