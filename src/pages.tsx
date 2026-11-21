import { useState } from "react";
import { ConfirmDialog, Icon, StatusMessage } from "./ui";
import { sessionDuration } from "./sessionJournal";
import type { SessionSummary } from "./sessionJournal";

export { SettingsPage } from "./SettingsPage";

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
