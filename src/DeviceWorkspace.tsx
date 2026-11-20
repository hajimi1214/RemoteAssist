import { useEffect, useRef, useState } from "react";
import type { Device } from "./signaling";
import { Icon } from "./ui";

function FavoriteIcon({ filled = false }: { filled?: boolean }) {
  return <svg className="ui-icon" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/></svg>;
}
function WindowsIcon() {
  return <svg className="device-windows-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>;
}
function readFavorites(owner: string): string[] {
  if (!owner) return [];
  try { const raw = localStorage.getItem(`remoteassist.favoriteDevices.${encodeURIComponent(owner)}`); if (!raw || raw.length > 10000) return []; const value: unknown = JSON.parse(raw); return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length <= 128))].slice(0,50) : []; } catch { return []; }
}
function supportsDirect(item: Device) { const [major,minor] = item.appVersion.split(".").map(Number); return major > 0 || major === 0 && minor >= 10; }

export function DeviceWorkspace({ devices, currentDevice, onConnect, onRefresh }: { devices: Device[]; currentDevice: Device | null; onConnect: (device: Device, viewOnly?: boolean) => void; onRefresh: () => void }) {
  const owner = currentDevice?.userId ?? devices[0]?.userId ?? "";
  const [favoriteState,setFavoriteState] = useState(() => ({owner,ids:readFavorites(owner)}));
  const favorites = favoriteState.owner === owner ? favoriteState.ids : [];
  const [selected,setSelected] = useState("");
  const [query,setQuery] = useState("");
  const [group,setGroup] = useState<"all" | "favorites">("all");
  const [expanded,setExpanded] = useState(true);
  const [menuOpen,setMenuOpen] = useState(false);
  const [showDetails,setShowDetails] = useState(false);
  const [message,setMessage] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { setFavoriteState({owner,ids:readFavorites(owner)});setSelected("");setMenuOpen(false);setMessage(""); },[owner]);
  useEffect(() => { if (!menuOpen) return; const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setMenuOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false);menu.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus(); } }; document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);}; },[menuOpen]);
  const ownDevices = devices.filter(item => !owner || item.userId === owner);
  const favoriteDevices = ownDevices.filter(item => favorites.includes(item.id));
  const visible = ownDevices.filter(item => (group === "all" || favorites.includes(item.id)) && `${item.deviceName} ${item.note}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const target = visible.find(item => item.id === selected) ?? visible.find(item => !item.current && item.online && item.osName === "Windows") ?? visible.find(item => !item.current && item.osName === "Windows") ?? visible[0];
  const connectable = !!target && !target.current && target.online && target.osName === "Windows" && supportsDirect(target) && !!currentDevice;
  const name = target?.note || target?.deviceName || "";
  const toggleFavorite = () => {
    if (!target || !owner) return;
    const removing = favorites.includes(target.id);
    const ids = removing ? favorites.filter(id=>id!==target.id) : [...favorites,target.id].slice(-50);
    setFavoriteState({owner,ids});setMenuOpen(false);menu.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
    try { localStorage.setItem(`remoteassist.favoriteDevices.${encodeURIComponent(owner)}`,JSON.stringify(ids));setMessage(removing ? "已取消收藏。" : "已收藏此设备。"); } catch { setMessage("收藏已在本次运行更新，本机保存失败。"); }
  };
  const title = !target ? "" : target.current ? "这是当前设备" : target.osName !== "Windows" ? "移动与浏览器控制端" : !supportsDirect(target) ? "需要升级电脑端" : !target.online ? "设备已离线" : "进入桌面";
  const subtitle = !target ? "" : target.current ? "保持登录，即可从其他设备连接这台电脑" : target.osName !== "Windows" ? "使用此设备连接同账号的在线电脑" : !supportsDirect(target) ? "请将电脑客户端升级到 0.10 或更新版本" : !target.online ? "请在电脑上打开 RemoteAssist 并登录" : "同账号直连，无需连接码";
  return <section className="device-workspace">
    <aside className="device-sidebar" aria-label="设备列表与分组">
      <button className="device-group-heading" aria-expanded={expanded} aria-controls="my-device-items" onClick={()=>setExpanded(!expanded)}><Icon name="devices"/><span>我的设备</span><span className="device-group-count">{ownDevices.length}</span><svg className={expanded ? "device-chevron expanded" : "device-chevron"} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
      <label className="device-filter"><Icon name="search"/><input type="search" value={query} onChange={event=>{setQuery(event.target.value);setMenuOpen(false);}} placeholder="搜索设备" aria-label="搜索设备"/></label>
      <div id="my-device-items" className="device-nav-list" hidden={!expanded}>{visible.map(item=><button key={item.id} className={target?.id===item.id?"device-nav-active":""} aria-pressed={target?.id===item.id} title={item.note||item.deviceName} onClick={()=>{setSelected(item.id);setMenuOpen(false);setShowDetails(false);setMessage("");}}><i className={item.online?"online":"offline"} aria-label={item.online?"在线":"离线"}/><span className={`device-platform-icon ${item.osName==="Windows"?"windows-platform":""}`}>{item.osName==="Windows"?<WindowsIcon/>:<Icon name="devices"/>}</span><span className="device-nav-label">{item.note||item.deviceName}<small>{item.current?"本机":item.osName}</small></span>{favorites.includes(item.id)&&<span className="device-nav-favorite" aria-label="已收藏"><FavoriteIcon filled/></span>}</button>)}{!visible.length&&<p>{group==="favorites"?"暂无匹配的收藏设备":"没有匹配的设备"}</p>}</div>
      <nav className="device-collections" aria-label="设备分组"><button className={group==="all"?"collection-active":""} aria-pressed={group==="all"} onClick={()=>{setGroup("all");setExpanded(true);setMenuOpen(false);}}><Icon name="grid"/><span>全部设备</span><small>{ownDevices.length}</small></button><button className={group==="favorites"?"collection-active":""} aria-pressed={group==="favorites"} onClick={()=>{setGroup("favorites");setExpanded(true);setMenuOpen(false);}}><FavoriteIcon/><span>收藏设备</span><small>{favoriteDevices.length}</small></button></nav>
      <div className="device-sidebar-bottom"><button className="device-refresh" onClick={onRefresh}><Icon name="history"/>刷新设备</button><p className="device-account-note"><Icon name="shield"/>仅连接当前账号的设备</p></div>
    </aside>
    <div className="device-stage">{target ? <>
      <header className="device-stage-heading"><span className={`device-online-pill ${target.online?"is-online":""}`}><i/>{target.online?"在线":"离线"}</span><div><h2>{name}</h2><p>{target.osName}{target.current?" · 当前设备":" · 我的账号"}</p></div><div className="device-context" ref={menu}><button className="device-more" aria-label="设备更多选项" title="设备更多选项" aria-expanded={menuOpen} aria-controls="device-context-options" onClick={()=>setMenuOpen(!menuOpen)}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>{menuOpen&&<div className="device-context-menu" id="device-context-options" role="group" aria-label="设备选项"><button onClick={toggleFavorite}><FavoriteIcon filled={favorites.includes(target.id)}/>{favorites.includes(target.id)?"取消收藏":"收藏设备"}</button><button onClick={()=>{setShowDetails(!showDetails);setMenuOpen(false);}}><Icon name="info"/>{showDetails?"收起设备详情":"设备详情"}</button><button onClick={()=>{setMenuOpen(false);onRefresh();}}><Icon name="history"/>刷新状态</button></div>}</div></header>
      <article className="device-desktop-card"><button className="device-preview" disabled={!connectable} aria-label={`${title}${connectable?` ${name}`:""}`} onClick={()=>onConnect(target,false)}><div className="device-desktop-scenery" aria-hidden="true"><span className="desktop-orb"/><span className="desktop-orb small-orb"/><div className="device-preview-monitor"><div className="preview-monitor-top"><i/><i/><i/></div><div className="preview-monitor-workspace"><span/><span/><span/></div><Icon name={target.osName==="Windows"?"monitor":"devices"}/></div></div><span className="device-preview-caption">{target.current?"当前设备":"桌面预览示意"}</span><span className="device-enter"><strong>{title}</strong>{connectable&&<Icon name="arrow"/>}<small>{subtitle}</small></span></button><div className="device-actions-row"><button onClick={()=>onConnect(target,false)} disabled={!connectable}><Icon name="monitor"/>远程控制</button><button onClick={()=>onConnect(target,true)} disabled={!connectable}><Icon name="expand"/>观看模式</button><button onClick={toggleFavorite} aria-pressed={favorites.includes(target.id)}><FavoriteIcon filled={favorites.includes(target.id)}/>{favorites.includes(target.id)?"已收藏":"收藏设备"}</button></div></article>
      <div className="device-stage-footer"><p className="device-stage-note">连接后显示实时桌面，按原始屏幕比例播放。</p><span className="device-quality-target">最高 4K · 60 帧目标</span></div>
      {showDetails&&<dl className="device-details"><div><dt>系统</dt><dd>{target.osName}</dd></div><div><dt>客户端</dt><dd>{target.appVersion}</dd></div><div><dt>最近在线</dt><dd>{Number.isFinite(Date.parse(target.lastSeenAt))?new Date(target.lastSeenAt).toLocaleString("zh-CN"):"待更新"}</dd></div></dl>}
    </> : <div className="device-list-empty"><Icon name={group==="favorites"?"grid":"devices"}/><h2>{group==="favorites"?"还没有收藏设备":query?"没有匹配的设备":"还没有设备"}</h2><p>{group==="favorites"?"在设备右上角的菜单里收藏常用电脑。":query?"试试其他设备名称或备注。":"在电脑和平板登录同一个账号，设备就会出现在这里。"}</p><button className="primary-action" onClick={()=>{if(query)setQuery("");else if(group==="favorites")setGroup("all");else onRefresh();}}>{query?"清除搜索":group==="favorites"?"查看全部设备":"刷新设备"}</button></div>}
      <p className="device-workspace-status" role="status" aria-live="polite">{message}</p>
    </div>
  </section>;
}
