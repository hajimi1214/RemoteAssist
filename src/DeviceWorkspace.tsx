import { useEffect, useRef, useState } from "react";
import type { Device } from "./signaling";
import { Icon } from "./ui";
import { activateDeviceFromList, canDirectControl, supportsDirectControlClient } from "./deviceActivation";

type Layout = "focus" | "grid" | "list";
type DeviceFilter = "all" | "online" | "offline" | "windows";
function FavoriteIcon({ filled = false }: { filled?: boolean }) {
  return <svg className="ui-icon" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/></svg>;
}
function PlatformIcon({ device }: { device: Device }) {
  return <span className={`device-platform-icon ${device.osName === "Windows" ? "windows-platform" : ""}`}>{device.osName === "Windows" ? <svg className="device-windows-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg> : <Icon name="devices"/>}</span>;
}
function LayoutIcon({ value }: { value: Layout }) {
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">{value === "focus" ? <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18"/></> : value === "grid" ? <><rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="15" width="7" height="5" rx="1"/><rect x="14" y="15" width="7" height="5" rx="1"/></> : <><path d="M9 6h12M9 12h12M9 18h12"/><rect x="3" y="5" width="2" height="2" rx=".3"/><rect x="3" y="11" width="2" height="2" rx=".3"/><rect x="3" y="17" width="2" height="2" rx=".3"/></>}</svg>;
}
function readFavorites(owner: string): string[] {
  if (!owner) return [];
  try { const raw = localStorage.getItem(`remoteassist.favoriteDevices.${encodeURIComponent(owner)}`); if (!raw || raw.length > 10000) return []; const value: unknown = JSON.parse(raw); return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length <= 128))].slice(0,50) : []; } catch { return []; }
}
function readLayout(owner: string): Layout {
  if (!owner) return "focus";
  try { const value = localStorage.getItem(`remoteassist.deviceLayout.${encodeURIComponent(owner)}`); return value === "grid" || value === "list" ? value : "focus"; } catch { return "focus"; }
}
function deviceTitle(item: Device) { return item.note || item.deviceName; }
function readyToConnect(item: Device, currentDevice: Device | null) { return canDirectControl(item,currentDevice); }
function stateLabel(item: Device) { return item.current ? "当前设备" : item.osName !== "Windows" ? item.osName === "Android" ? "移动控制端" : "浏览器控制端" : !supportsDirectControlClient(item) ? "需要升级" : item.online ? "可连接" : "离线"; }
function DesktopArtwork({ compact = false, platform = "Windows" }: { compact?: boolean; platform?: string }) {
  return <div className={`device-desktop-scenery${compact ? " compact-scenery" : ""}`} aria-hidden="true"><span className="desktop-orb"/><span className="desktop-orb small-orb"/><span className="desktop-wallpaper-ribbon"/><div className="device-preview-monitor"><div className="preview-monitor-top"><i/><i/><i/><span/></div><div className="preview-monitor-workspace"><span className="preview-window-nav"/><div><b/><section><i/><i/></section><em/><em/></div></div><div className="preview-monitor-dock"><i/><i/><i/><i/></div></div><div className="preview-device-accent"><Icon name={platform === "Windows" ? "monitor" : "devices"}/><span>{platform}<span>{platform === "Windows" ? "远程电脑" : "控制端设备"}</span></span></div></div>;
}

export function DeviceWorkspace({ devices, currentDevice, onConnect, onRefresh }: { devices: Device[]; currentDevice: Device | null; onConnect: (device: Device) => void; onRefresh: () => void }) {
  const owner = currentDevice?.userId ?? devices[0]?.userId ?? "";
  const [favoriteState,setFavoriteState] = useState(() => ({owner,ids:readFavorites(owner)}));
  const favorites = favoriteState.owner === owner ? favoriteState.ids : [];
  const [layoutState,setLayoutState] = useState(() => ({owner,value:readLayout(owner)}));
  const layout = layoutState.owner === owner ? layoutState.value : "focus";
  const [selected,setSelected] = useState("");
  const [query,setQuery] = useState("");
  const [group,setGroup] = useState<"all" | "favorites">("all");
  const [filter,setFilter] = useState<DeviceFilter>("all");
  const [expanded,setExpanded] = useState(true);
  const [menuOpen,setMenuOpen] = useState(false);
  const [showDetails,setShowDetails] = useState(false);
  const [message,setMessage] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { setFavoriteState({owner,ids:readFavorites(owner)});setLayoutState({owner,value:readLayout(owner)});setSelected("");setQuery("");setFilter("all");setGroup("all");setMenuOpen(false);setShowDetails(false);setMessage(""); },[owner]);
  useEffect(() => { if (!menuOpen) return; const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setMenuOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false);menu.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus(); } }; document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);}; },[menuOpen]);
  const ownDevices = devices.filter(item => !!owner && item.userId === owner);
  const onlineCount = ownDevices.filter(item=>item.online).length;
  const favoriteDevices = ownDevices.filter(item => favorites.includes(item.id));
  const groupDevices = ownDevices.filter(item=>group === "all" || favorites.includes(item.id));
  const visible = groupDevices.filter(item => (filter === "all" || filter === "online" && item.online || filter === "offline" && !item.online || filter === "windows" && item.osName === "Windows") && `${item.deviceName} ${item.note} ${item.osName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const target = visible.find(item => item.id === selected) ?? visible.find(item => readyToConnect(item,currentDevice)) ?? visible.find(item => !item.current && item.osName === "Windows") ?? visible[0];
  const connectable = !!target && readyToConnect(target,currentDevice);
  const name = target ? deviceTitle(target) : "";
  const selectDevice = (item: Device) => { setSelected(item.id);setMenuOpen(false);setShowDetails(false);setMessage(""); };
  const activateDevice = (item: Device) => activateDeviceFromList(item,currentDevice,onConnect,selectDevice);
  const chooseLayout = (value: Layout) => { setLayoutState({owner,value});setMenuOpen(false);if(owner)try{localStorage.setItem(`remoteassist.deviceLayout.${encodeURIComponent(owner)}`,value);}catch{setMessage("布局已更新，本机保存失败。");} };
  const toggleFavorite = (item: Device = target!) => {
    if (!item || !owner) return;
    const removing = favorites.includes(item.id);
    const ids = removing ? favorites.filter(id=>id!==item.id) : [...favorites,item.id].slice(-50);
    setFavoriteState({owner,ids});setMenuOpen(false);menu.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
    try { localStorage.setItem(`remoteassist.favoriteDevices.${encodeURIComponent(owner)}`,JSON.stringify(ids));setMessage(removing ? "已取消收藏。" : "已收藏此设备。"); } catch { setMessage("收藏已在本次运行更新，本机保存失败。"); }
  };
  const title = !target ? "" : target.current ? "这是当前设备" : target.osName !== "Windows" ? "移动与浏览器控制端" : !supportsDirectControlClient(target) ? "需要升级电脑端" : !target.online ? "设备已离线" : "进入桌面";
  const subtitle = !target ? "" : target.current ? "保持登录，即可从其他设备连接这台电脑" : target.osName !== "Windows" ? "使用此设备连接同账号的在线电脑" : !supportsDirectControlClient(target) ? "请将电脑客户端升级到 0.10 或更新版本" : !target.online ? "请在电脑上打开 RemoteAssist 并登录" : "同账号直连，无需连接码";
  const resetFilters = () => { setQuery("");setFilter("all");if(group === "favorites" && !favoriteDevices.length)setGroup("all"); };
  const connectButton = (item: Device) => <button className="device-connect-button" disabled={!readyToConnect(item,currentDevice)} aria-label={`全屏操控 ${deviceTitle(item)}`} onClick={()=>onConnect(item)}><Icon name="monitor"/>进入桌面</button>;
  return <section className={`device-workspace layout-${layout}`}>
    <aside className="device-sidebar" aria-label="设备列表与分组">
      <div className="device-sidebar-label">DEVICE CENTER</div>
      <button className="device-group-heading" aria-expanded={expanded} aria-controls="my-device-items" onClick={()=>setExpanded(!expanded)}><Icon name="devices"/><span>我的设备</span><span className="device-group-count">{ownDevices.length}</span><svg className={expanded ? "device-chevron expanded" : "device-chevron"} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
      <label className="device-filter"><Icon name="search"/><input type="search" value={query} onChange={event=>{setQuery(event.target.value);setMenuOpen(false);}} placeholder="搜索名称、备注或系统" aria-label="搜索设备"/></label>
      <div id="my-device-items" className="device-nav-list" hidden={!expanded}>{visible.map(item=><button key={item.id} className={target?.id===item.id?"device-nav-active":""} aria-pressed={target?.id===item.id} title={readyToConnect(item,currentDevice)?`进入桌面并操控 ${deviceTitle(item)}`:deviceTitle(item)} onClick={()=>activateDevice(item)}><i className={item.online?"online":"offline"} aria-label={item.online?"在线":"离线"}/><PlatformIcon device={item}/><span className="device-nav-label">{deviceTitle(item)}<small>{item.current?"本机":item.osName}</small></span>{favorites.includes(item.id)&&<span className="device-nav-favorite" aria-label="已收藏"><FavoriteIcon filled/></span>}</button>)}{!visible.length&&<p>没有匹配的设备</p>}</div>
      <nav className="device-collections" aria-label="设备分组"><button className={group==="all"?"collection-active":""} aria-pressed={group==="all"} onClick={()=>{setGroup("all");setExpanded(true);setMenuOpen(false);}}><Icon name="grid"/><span>全部设备</span><small>{ownDevices.length}</small></button><button className={group==="favorites"?"collection-active":""} aria-pressed={group==="favorites"} onClick={()=>{setGroup("favorites");setExpanded(true);setMenuOpen(false);}}><FavoriteIcon/><span>收藏设备</span><small>{favoriteDevices.length}</small></button></nav>
      <div className="device-sidebar-bottom"><button className="device-refresh" onClick={onRefresh}><Icon name="history"/>刷新设备</button><p className="device-account-note"><Icon name="shield"/>仅连接当前账号的设备</p></div>
    </aside>
    <div className="device-main">
      <header className="device-workspace-toolbar"><div><span className="device-toolbar-eyebrow">YOUR CONNECTED DEVICES</span><h2>{group==="favorites"?"收藏设备":"全部设备"}<span>{groupDevices.length}</span></h2><p><i/>{onlineCount} 台在线<span>·</span>{favoriteDevices.length} 台收藏</p></div><div className="device-layout-switch" role="group" aria-label="设备布局">{([{value:"focus",label:"桌面布局"},{value:"grid",label:"网格布局"},{value:"list",label:"列表布局"}] as const).map(item=><button key={item.value} className={layout===item.value?"selected":""} aria-label={item.label} title={item.label} aria-pressed={layout===item.value} onClick={()=>chooseLayout(item.value)}><LayoutIcon value={item.value}/><span>{item.value==="focus"?"桌面":item.value==="grid"?"网格":"列表"}</span></button>)}</div></header>
      <div className="device-main-filters"><div className="device-status-filters" role="group" aria-label="筛选设备">{([{value:"all",label:"全部"},{value:"online",label:"在线"},{value:"offline",label:"离线"},{value:"windows",label:"Windows"}] as const).map(item=><button key={item.value} aria-pressed={filter===item.value} className={filter===item.value?"selected":""} onClick={()=>{setFilter(item.value);setMenuOpen(false);}}>{item.value==="online"&&<i/>}{item.label}</button>)}</div><p className="device-result-count" role="status" aria-live="polite">{query.trim()?`找到 ${visible.length} 台设备`:`${visible.length} 台设备`}</p></div>
      <div className="device-main-content">
      {!target ? <div className="device-list-empty"><Icon name="devices"/><h2>{group==="favorites"&&!favoriteDevices.length?"还没有收藏设备":query||filter!=="all"?"没有符合条件的设备":"还没有设备"}</h2><p>{group==="favorites"&&!favoriteDevices.length?"收藏常用电脑，在这里更快找到。":query||filter!=="all"?"试试其他关键词，或清除筛选。":"在电脑和平板登录同一个账号，设备就会出现在这里。"}</p><button className="primary-action" onClick={()=>{if(query||filter!=="all"||group==="favorites")resetFilters();else onRefresh();}}>{query||filter!=="all"?"清除筛选":group==="favorites"?"查看全部设备":"刷新设备"}</button></div> : layout === "focus" ? <div className="device-stage">
        <header className="device-stage-heading"><span className={`device-online-pill ${target.online?"is-online":""}`}><i/>{target.online?"在线":"离线"}</span><div><h2>{name}</h2><p>{target.osName}{target.current?" · 本机":" · 我的账号"}</p></div><div className="device-context" ref={menu}><button className="device-more" aria-label="设备更多选项" title="设备更多选项" aria-expanded={menuOpen} aria-controls="device-context-options" onClick={()=>setMenuOpen(!menuOpen)}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>{menuOpen&&<div className="device-context-menu" id="device-context-options" role="group" aria-label="设备选项"><button onClick={()=>toggleFavorite()}><FavoriteIcon filled={favorites.includes(target.id)}/>{favorites.includes(target.id)?"取消收藏":"收藏设备"}</button><button onClick={()=>{setShowDetails(!showDetails);setMenuOpen(false);menu.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus();}}><Icon name="info"/>{showDetails?"收起设备详情":"设备详情"}</button><button onClick={()=>{setMenuOpen(false);onRefresh();}}><Icon name="history"/>刷新状态</button></div>}</div></header>
        <article className="device-desktop-card"><button className="device-preview" disabled={!connectable} aria-label={connectable?`进入桌面并全屏操控 ${name}`:title} onClick={()=>onConnect(target)}><DesktopArtwork platform={target.osName}/><span className="device-preview-caption">{target.current?"当前设备":"远程电脑"}</span><span className="device-enter"><strong>{title}</strong>{connectable&&<Icon name="arrow"/>}<small>{connectable?"点击后直接全屏操控这台电脑":subtitle}</small></span><span className="device-art-platform"><Icon name={target.osName === "Windows" ? "monitor" : "devices"}/>{target.osName}</span></button></article>
        <div className="device-stage-footer"><p className="device-stage-note">连接后显示实时桌面，按原始屏幕比例播放。</p><span className="device-quality-target">最高 4K · 60 帧目标</span></div>
        {showDetails&&<dl className="device-details"><div><dt>系统</dt><dd>{target.osName}</dd></div><div><dt>客户端</dt><dd>{target.appVersion}</dd></div><div><dt>最近在线</dt><dd>{Number.isFinite(Date.parse(target.lastSeenAt))?new Date(target.lastSeenAt).toLocaleString("zh-CN"):"待更新"}</dd></div></dl>}
      </div> : <div className={layout === "grid" ? "device-card-grid" : "device-table-list"}>{visible.map(item=><article className={`device-overview-item${item.current?" current-device-item":""}`} key={item.id}>
        {layout === "grid"&&<button className="device-grid-preview" onClick={()=>activateDevice(item)} aria-label={readyToConnect(item,currentDevice)?`进入桌面并操控 ${deviceTitle(item)}`:`查看设备 ${deviceTitle(item)}`}><DesktopArtwork compact platform={item.osName}/><span className={`device-mini-presence ${item.online?"online":""}`}><i/>{item.online?"在线":"离线"}</span><span className="device-grid-preview-label">{readyToConnect(item,currentDevice)?"进入桌面 · 全屏操控":item.osName==="Windows"?"Windows 桌面":"控制端设备"}</span></button>}
        <div className="device-overview-heading"><PlatformIcon device={item}/><button className="device-overview-name" onClick={()=>activateDevice(item)} title={readyToConnect(item,currentDevice)?`进入桌面并操控 ${deviceTitle(item)}`:deviceTitle(item)}><strong>{deviceTitle(item)}</strong><small>{item.current?"本机":item.osName}</small></button><button className="device-quick-favorite" aria-label={`${favorites.includes(item.id)?"取消收藏":"收藏"} ${deviceTitle(item)}`} aria-pressed={favorites.includes(item.id)} onClick={()=>toggleFavorite(item)}><FavoriteIcon filled={favorites.includes(item.id)}/></button></div>
        <div className="device-overview-status"><span className={`device-state-label${item.online?" online":""}`}><i/>{stateLabel(item)}</span><span>{item.appVersion}</span></div><div className="device-overview-actions">{connectButton(item)}</div>
      </article>)}</div>}
      </div>
      <p className="device-workspace-status" role="status" aria-live="polite">{message}</p>
    </div>
  </section>;
}
