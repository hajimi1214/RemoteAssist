import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConfirmDialog, RemoteScreen } from "../src/ui";
import { usePreferences } from "../src/preferences";
import "../src/styles.css";
import "../src/workspaceChrome.css";
import "../src/mobile.css";
import "../src/workflowPages.css";

function Preview() {
  usePreferences();
  const videoRef=useRef<HTMLVideoElement>(null);
  const [dimensions,setDimensions]=useState({width:1920,height:1080});
  const [connected,setConnected]=useState(true);
  const [releases,setReleases]=useState(0);
  const [keys,setKeys]=useState(0);
  const [gameInputs,setGameInputs]=useState(0);
  const [quality,setQuality]=useState<"auto"|"sharp"|"smooth"|"economy"|"game">("game");
  const [confirm,setConfirm]=useState(false);
  useEffect(()=>{
    const canvas=document.createElement("canvas"); canvas.width=dimensions.width;canvas.height=dimensions.height;
    const ctx=canvas.getContext("2d")!;let frame=0;
    const draw=()=>{ctx.fillStyle="#142745";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle="#a4c5ff";ctx.lineWidth=4;ctx.strokeRect(8,8,canvas.width-16,canvas.height-16);ctx.font="40px sans-serif";ctx.fillStyle="#e7efff";ctx.fillText(`${canvas.width} × ${canvas.height} · frame ${++frame}`,40,90);};
    draw();const stream=canvas.captureStream(10);if(videoRef.current)videoRef.current.srcObject=stream;const timer=setInterval(draw,100);
    return()=>{clearInterval(timer);stream.getTracks().forEach(t=>t.stop());};
  },[dimensions]);
  return <main className="workspace"><h1>画面适配验证</h1><p>使用生成的测试图，不采集屏幕、不发送任何系统输入。</p><div className="row"><button className="secondary-action" onClick={()=>setDimensions({width:1080,height:1920})}>载入竖屏</button><button className="secondary-action" onClick={()=>setDimensions({width:3840,height:1080})}>载入超宽屏</button><button className="secondary-action" onClick={()=>setConfirm(true)}>测试离开确认</button></div><output id="telemetry">已释放 {releases} 次，已接收 {keys} 次测试按键，游戏相对输入 {gameInputs} 次</output><RemoteScreen videoRef={videoRef} connected={connected} status="测试连接" gameInputSupported qualityMode={quality} onQualityModeChange={setQuality} onGameMouse={()=>{setGameInputs(n=>n+1);return true;}} onRelease={()=>setReleases(n=>n+1)} onKey={()=>setKeys(n=>n+1)} onPointer={()=>{}} onWheel={()=>{}} onMobileAction={()=>true} textSupported={false} onDisconnect={()=>setConnected(false)} />{confirm&&<ConfirmDialog title="结束当前测试？" description="这里只验证对话框与焦点恢复，不会操作真实会话。" confirmLabel="结束测试" onCancel={()=>setConfirm(false)} onConfirm={()=>{setConfirm(false);setConnected(false);}}/>}</main>;
}
const root=createRoot(document.getElementById("root")!);
root.render(<Preview />);
import.meta.hot?.dispose(()=>root.unmount());
