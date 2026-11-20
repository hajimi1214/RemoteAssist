import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { mapVideoPoint } from "./pointerMapping";
import { TouchController, validRemoteText } from "./mobileInput";
import type { MobileAction, TouchPoint } from "./mobileInput";
import { androidClient } from "./platform";

export function MobileControls({ videoRef, enabled, available, textSupported, onAction, onRelease, onSuspend }: {
  videoRef: RefObject<HTMLVideoElement | null>; enabled: boolean; available: boolean; textSupported: boolean;
  onAction: (action: MobileAction) => boolean; onRelease: () => void; onSuspend: () => void;
}) {
  const [visible, setVisible] = useState(androidClient || navigator.maxTouchPoints > 0);
  const [drag, setDrag] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const gesture = useRef(new TouchController());
  const lastPoint = useRef({ x: .5, y: .5 });
  const live = useRef({ enabled, drag, onAction, onRelease }); live.current = { enabled, drag, onAction, onRelease };
  useEffect(() => {
    if (!enabled) { gesture.current.cancel(); setDrag(false); setKeyboard(false); setText(""); }
  }, [enabled]);
  useEffect(() => {
    const video = videoRef.current; if (!video) return;
    const point = (event: PointerEvent): TouchPoint | null => {
      const xy = mapVideoPoint(video.getBoundingClientRect(), video.videoWidth, video.videoHeight, event.clientX, event.clientY);
      return xy ? { ...xy, id: event.pointerId, clientX: event.clientX, clientY: event.clientY, at: performance.now() } : null;
    };
    const send = (actions: MobileAction[]) => { if(live.current.enabled) for (const action of actions) live.current.onAction(action); };
    const handle = (kind: "down" | "move" | "up", event: PointerEvent) => {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      setVisible(true);
      if (!live.current.enabled) return;
      event.preventDefault();
      const p = point(event);
      if (!p) { if (kind === "up") { gesture.current.cancel(); live.current.onRelease(); } return; }
      lastPoint.current = { x: p.x, y: p.y };
      if (kind === "down") { video.setPointerCapture(event.pointerId); send(gesture.current.down(p, live.current.drag)); }
      else if (kind === "move") send(gesture.current.move(p));
      else { send(gesture.current.up(p)); if(video.hasPointerCapture(event.pointerId))video.releasePointerCapture(event.pointerId); }
    };
    const down = (event: PointerEvent) => handle("down", event), move = (event: PointerEvent) => handle("move", event), up = (event: PointerEvent) => handle("up", event);
    const cancel = () => { gesture.current.cancel(); live.current.onRelease(); };
    video.addEventListener("pointerdown", down); video.addEventListener("pointermove", move); video.addEventListener("pointerup", up); video.addEventListener("pointercancel", cancel);
    return () => { cancel(); video.removeEventListener("pointerdown",down);video.removeEventListener("pointermove",move);video.removeEventListener("pointerup",up);video.removeEventListener("pointercancel",cancel); };
  }, [videoRef]);
  const key = (key: string, code: string) => {
    if (!enabled) return;
    onAction({ type: "key_down", payload: { key, code } }); onAction({ type: "key_up", payload: { key, code } });
  };
  const click = (button: number) => {
    if (!enabled) return;
    onAction({ type: "mouse_down", payload: { ...lastPoint.current, button } });
    onAction({ type: "mouse_up", payload: { ...lastPoint.current, button } });
  };
  if (!visible) return <button className="touch-tools-toggle" onClick={() => setVisible(true)}>显示触屏工具</button>;
  return <section className="touch-controls" aria-label="触屏控制工具">
    <div className="touch-control-actions">
      <button disabled={!enabled} aria-pressed={drag} className={drag ? "touch-selected" : ""} onClick={() => { onRelease(); gesture.current.cancel(); setDrag(!drag); }}>{drag ? "拖拽：开启" : "拖拽：关闭"}</button>
      <button disabled={!enabled} onClick={() => click(2)}>右键</button>
      <button disabled={!enabled} onClick={() => onAction({type:"mouse_wheel",payload:{deltaX:0,deltaY:-120}})}>向上滚动</button>
      <button disabled={!enabled} onClick={() => onAction({type:"mouse_wheel",payload:{deltaX:0,deltaY:120}})}>向下滚动</button>
      <button disabled={!enabled} aria-expanded={keyboard} onClick={() => { onRelease(); setKeyboard(!keyboard); if(!keyboard)requestAnimationFrame(()=>textRef.current?.focus()); }}>键盘 / 文字</button>
      <button className="touch-stop" disabled={!enabled} onClick={onSuspend}>停止操作</button>
    </div>
    <p className="touch-instructions">{enabled ? "轻点点击 · 单指移动光标 · 双指上下滚动。开启拖拽后，可拖动窗口或选择内容。" : available ? "先点击「操作远程电脑」。查看模式下可拖动画面，或选择缩放比例查看细节。" : "电脑端同意并出现画面后，才能开启触屏操作。"}</p>
    {keyboard && enabled && <div className="mobile-keyboard-panel">
      <div className="mobile-key-row">{[{key:"Escape",code:"Escape",label:"Esc"},{key:"Tab",code:"Tab",label:"Tab"},{key:"Backspace",code:"Backspace",label:"退格"},{key:"Enter",code:"Enter",label:"回车"},{key:"ArrowLeft",code:"ArrowLeft",label:"←"},{key:"ArrowRight",code:"ArrowRight",label:"→"},{key:"ArrowUp",code:"ArrowUp",label:"↑"},{key:"ArrowDown",code:"ArrowDown",label:"↓"}].map(item=><button key={item.code} aria-label={`发送${item.key}`} onClick={()=>key(item.key,item.code)}>{item.label}</button>)}</div>
      <label htmlFor="remote-text-draft">发送到电脑当前输入位置</label><textarea ref={textRef} id="remote-text-draft" value={text} maxLength={128} disabled={!textSupported} autoComplete="off" autoCorrect="off" spellCheck={false} rows={2} onChange={event=>{setText(event.target.value.replace(/\r\n?/g,"\n"));setMessage("");}} aria-describedby="remote-text-help"/>
      <div className="mobile-text-send"><p id="remote-text-help">{textSupported ? "先在电脑画面点选输入框。支持中文，最多 128 个字符；点击发送后才传输。" : "电脑端需升级到支持文字输入的版本。正在检查对方能力。"}</p><button className="primary-action" disabled={!textSupported||!validRemoteText(text)} onClick={()=>{
        if(!validRemoteText(text))return;
        if(onAction({type:"text_input",payload:{text}})){setText("");setMessage("已发送到输入通道，请确认电脑上的显示结果。");}else setMessage("未发送，连接可能已断开。");
      }}>发送文字</button></div><p className="field-hint" role="status">{message}</p>
    </div>}
  </section>;
}
