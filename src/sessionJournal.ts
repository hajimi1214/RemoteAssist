export type SessionRole = "share" | "control";
export type SessionOutcome = "completed" | "interrupted" | "cancelled" | "expired";
export interface SessionSummary {
  id: string;
  role: SessionRole;
  startedAt: number;
  connectedAt: number | null;
  endedAt: number;
  outcome: SessionOutcome;
  route: "P2P" | "TURN Relay" | "Unknown";
}
const retentionMs=30*24*60*60*1000;
const maxEntries=50;

// Whitelist fields when loading or saving: never persist connection codes,
// session/access tokens, SDP, addresses, screen contents, or input events.
export function sanitizeSummaries(value: unknown, now=Date.now()): SessionSummary[] {
  if(!Array.isArray(value))return[];
  const unique=new Set<string>();
  return value.slice(0,500).flatMap((item):SessionSummary[]=>{
    if(!item||typeof item!=="object")return[];
    const {id,role,startedAt,connectedAt,endedAt,outcome,route}=item as SessionSummary;
    if(typeof id!=="string"||!/^local-[a-zA-Z0-9-]{8,80}$/.test(id)||unique.has(id))return[];
    if(!["share","control"].includes(role)||!["completed","interrupted","cancelled","expired"].includes(outcome)||!["P2P","TURN Relay","Unknown"].includes(route))return[];
    if(!Number.isSafeInteger(startedAt)||!Number.isSafeInteger(endedAt)||startedAt<0||endedAt>8.64e15||endedAt<startedAt||endedAt>now+60_000||endedAt<now-retentionMs)return[];
    if(connectedAt!==null&&(!Number.isFinite(connectedAt)||connectedAt<startedAt||connectedAt>endedAt))return[];
    unique.add(id);
    return[{id,role,startedAt,connectedAt,endedAt,outcome,route}];
  }).sort((a,b)=>b.endedAt-a.endedAt).slice(0,maxEntries);
}

export function sessionOutcome(reason:string, connected:boolean):SessionOutcome {
  if(/expired/i.test(reason))return"expired";
  if(["Connection lost","Connection failed","Disconnected","failed","Invalid signaling message"].includes(reason))return"interrupted";
  return connected?"completed":"cancelled";
}

export function sessionDuration(summary:SessionSummary):string {
  if(summary.connectedAt==null)return"未建立连接";
  const total=Math.max(0,Math.floor((summary.endedAt-summary.connectedAt)/1000));
  const minutes=Math.floor(total/60);
  return minutes>=60?`${Math.floor(minutes/60)} 小时 ${minutes%60} 分钟`:`${minutes} 分 ${total%60} 秒`;
}

export function createSessionRecorder(role:SessionRole,emit:(summary:SessionSummary)=>void,now=()=>Date.now(),id=()=>`local-${crypto.randomUUID()}`) {
  const startedAt=now();const localId=id();let connectedAt:number|null=null;let ended=false;
  let route:SessionSummary["route"]="Unknown";
  return {
    connected(){if(!ended&&connectedAt==null)connectedAt=Math.max(startedAt,now());},
    route(next:SessionSummary["route"]){if(!ended)route=next;},
    finish(reason:string){if(ended)return;ended=true;const endedAt=Math.max(startedAt,connectedAt??0,now());emit({id:localId,role,startedAt,connectedAt,endedAt,outcome:sessionOutcome(reason,connectedAt!=null),route});}
  };
}
