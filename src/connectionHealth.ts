import type { VideoTelemetry } from "./videoTelemetry";

export interface HealthAdvice { severity:"pending"|"normal"|"warning"; title:string; detail:string }
export function connectionHealth(sample:VideoTelemetry):HealthAdvice {
  const receive=sample.direction==="receive";
  // Only use counters belonging to this side of the media path. This avoids
  // calling ordinary receive-side jitter a host send-queue problem, or vice versa.
  if(receive&&(sample.packetLossPercent??0)>=3)return{severity:"warning",title:"网络存在丢包",detail:"尝试有线网络或更稳定的 Wi‑Fi；画质会继续自动调整。"};
  if((!receive&&(sample.sendQueueMs??0)>50)||(receive&&(sample.jitterBufferMs??0)>120))return{severity:"warning",title:receive?"接收缓冲较高":"发送排队较高",detail:receive?"可能存在网络抖动或接收端处理压力；先观察缓冲与实际画面是否同时改善。":"发送端数据正在排队，可能增加画面延迟；先减少其他下载，再观察排队是否下降。"};
  if((!receive&&(sample.qualityLimitation==="cpu"||(sample.encodeMs??0)>50))||(receive&&(sample.decodeMs??0)>50))return{severity:"warning",title:receive?"接收端解码压力较高":"电脑端编码压力较高",detail:receive?"当前接收设备处理视频较慢；可先尝试流畅模式或关闭占用 GPU 的应用。":"电脑端编码处理较慢；可先尝试流畅模式或关闭占用 GPU/CPU 的应用。"};
  if((sample.rttMs??0)>250)return{severity:"warning",title:"网络往返较慢",detail:"长距离链路或中继可能增加延迟；此数值不是端到端操作延迟。"};
  if(sample.fps===0&&sample.bitrateKbps===0)return{severity:"normal",title:"当前画面更新较少",detail:"静止桌面可能没有新帧；仅凭低帧率无法判断是否卡顿。"};
  if(sample.bitrateKbps==null&&sample.fps==null&&sample.rttMs==null)return{severity:"pending",title:"正在收集连接数据",detail:"获得连续采样后将显示趋势与状态提示。"};
  return{severity:"normal",title:"当前采样未见明显压力",detail:"依据本机可用统计判断，仍以实际操作感受为准。"};
}

export interface TrendPoint { at:number; rttMs?:number; bitrateKbps?:number; fps?:number }
function safe(value:unknown):number|undefined{return typeof value==="number"&&Number.isFinite(value)&&value>=0?value:undefined;}
export function appendTrend(history:TrendPoint[],sample:VideoTelemetry,at:number):TrendPoint[]{
  return [...history.filter(p=>at-p.at<90_000&&p.at<=at).slice(-29),{at,rttMs:safe(sample.rttMs),bitrateKbps:safe(sample.bitrateKbps),fps:safe(sample.fps)}];
}
export function trendSegments(points:TrendPoint[],field:"rttMs"|"bitrateKbps"):string[] {
  const values=points.map(p=>p[field]);const maximum=Math.max(1,...values.filter((v):v is number=>v!=null));
  const segments:string[]=[];let segment:string[]=[];
  values.forEach((value,i)=>{
    if(value==null||(i>0&&points[i].at-points[i-1].at>10_000)){if(segment.length)segments.push(segment.join(" "));segment=[];}
    if(value!=null)segment.push(`${points.length<2?100:i*100/(points.length-1)},${36-(value/maximum)*30}`);
  });if(segment.length)segments.push(segment.join(" "));
  return segments;
}
