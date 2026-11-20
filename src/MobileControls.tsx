import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { mapVideoPoint } from "./pointerMapping";
import { TouchController, TouchpadController, dispatchKeyChord, validRemoteText } from "./mobileInput";
import type { MobileAction, NormalizedPoint, RemoteModifier, TouchMode, TouchPoint } from "./mobileInput";
import { androidClient } from "./platform";

function storedTouchMode():TouchMode {try{return localStorage.getItem("remoteassist.touchMode")==="touchpad"?"touchpad":"direct";}catch{return"direct";}}
export function MobileControls({ videoRef, enabled, available, textSupported, onAction, onRelease, onSuspend, open = true, resetKey = "", onModeChange }: {
  videoRef:RefObject<HTMLVideoElement|null>;enabled:boolean;available:boolean;textSupported:boolean;
  onAction:(action:MobileAction)=>boolean;onRelease:()=>void;onSuspend:()=>void;open?:boolean;resetKey?:string;onModeChange?:(mode:TouchMode)=>void;
}) {
  const [visible,setVisible]=useState(androidClient||navigator.maxTouchPoints>0);
  const [touchMode,setTouchMode]=useState<TouchMode>(storedTouchMode);
  const [drag,setDrag]=useState(false),[keyboard,setKeyboard]=useState(false),[text,setText]=useState(""),[message,setMessage]=useState("");
  const [modifiers,setModifiers]=useState<RemoteModifier[]>([]),[hasPoint,setHasPoint]=useState(false);
  const textRef=useRef<HTMLTextAreaElement>(null),gesture=useRef(new TouchController()),touchpad=useRef(new TouchpadController());
  const lastPoint=useRef<NormalizedPoint|undefined>(undefined);
  const live=useRef({enabled,drag,touchMode,onAction,onRelease});live.current={enabled,drag,touchMode,onAction,onRelease};
  const id=useId();
  useEffect(()=>{try{localStorage.setItem("remoteassist.touchMode",touchMode);}catch{/* Preference remains active in memory. */}onModeChange?.(touchMode);},[touchMode,onModeChange]);
  useEffect(()=>{if(!enabled){gesture.current.cancel();touchpad.current.cancel();setDrag(false);setKeyboard(false);setText("");setModifiers([]);}},[enabled]);
  useEffect(()=>{gesture.current.cancel();touchpad.current.cancel();live.current.onRelease();setModifiers([]);},[resetKey]);
  useEffect(()=>{if(!open){setKeyboard(false);setText("");setMessage("");setModifiers([]);}},[open]);
  useEffect(()=>{
    const video=videoRef.current;if(!video)return;
    const remember=(actions:MobileAction[])=>{for(const action of actions){const{x,y}=action.payload??{};if(typeof x==="number"&&typeof y==="number"){lastPoint.current={x,y};setHasPoint(true);}}};
    const send=(actions:MobileAction[])=>{if(!live.current.enabled)return;remember(actions);for(const action of actions)if(!live.current.onAction(action)){gesture.current.cancel();touchpad.current.cancel();live.current.onRelease();break;}};
    const handle=(kind:"down"|"move"|"up",event:PointerEvent)=>{
      if(event.pointerType!=="touch"&&event.pointerType!=="pen")return;
      setVisible(true);if(!live.current.enabled)return;event.preventDefault();
      const rect=video.getBoundingClientRect();
      const xy=mapVideoPoint(rect,video.videoWidth,video.videoHeight,event.clientX,event.clientY);
      const pad=live.current.touchMode==="touchpad";
      const captured=pad?touchpad.current.hasPointer(event.pointerId):gesture.current.hasPointer(event.pointerId);
      if(!xy&&!(pad&&captured)){if(kind==="up"){gesture.current.cancel();touchpad.current.cancel();live.current.onRelease();}return;}
      const position=xy??lastPoint.current;if(!position)return;
      const point:TouchPoint={...position,id:event.pointerId,clientX:event.clientX,clientY:event.clientY,at:performance.now()};
      if(kind==="down"){
        try{video.setPointerCapture(event.pointerId);}catch{gesture.current.cancel();touchpad.current.cancel();live.current.onRelease();return;}
        if(pad){if(lastPoint.current)touchpad.current.setPointer(lastPoint.current);send(touchpad.current.down(point,live.current.drag));}
        else send(gesture.current.down(point,live.current.drag));
      }else if(kind==="move")send(pad?touchpad.current.move(point,{width:rect.width,height:rect.height}):gesture.current.move(point));
      else{send(pad?touchpad.current.up(point):gesture.current.up(point));if(video.hasPointerCapture(event.pointerId))video.releasePointerCapture(event.pointerId);}
    };
    const down=(event:PointerEvent)=>handle("down",event),move=(event:PointerEvent)=>handle("move",event),up=(event:PointerEvent)=>handle("up",event);
    const cancel=()=>{gesture.current.cancel();touchpad.current.cancel();live.current.onRelease();};
    const lost=(event:PointerEvent)=>{if(gesture.current.hasPointer(event.pointerId)||touchpad.current.hasPointer(event.pointerId))cancel();};
    const hidden=()=>{if(document.hidden)cancel();};
    video.addEventListener("pointerdown",down);video.addEventListener("pointermove",move);video.addEventListener("pointerup",up);video.addEventListener("pointercancel",cancel);video.addEventListener("lostpointercapture",lost);
    window.addEventListener("blur",cancel);document.addEventListener("visibilitychange",hidden);
    return()=>{cancel();video.removeEventListener("pointerdown",down);video.removeEventListener("pointermove",move);video.removeEventListener("pointerup",up);video.removeEventListener("pointercancel",cancel);video.removeEventListener("lostpointercapture",lost);window.removeEventListener("blur",cancel);document.removeEventListener("visibilitychange",hidden);};
  },[videoRef]);
  function releaseGestures(){gesture.current.cancel();touchpad.current.cancel();onRelease();}
  function changeMode(mode:TouchMode){releaseGestures();setDrag(false);setTouchMode(mode);setMessage("");}
  function key(key:string,code:string,explicit?:RemoteModifier[]){
    if(!enabled)return;releaseGestures();
    const success=dispatchKeyChord(onAction,key,code,explicit??modifiers);setModifiers([]);
    setMessage(success?"按键已发送，组合修饰键已释放。":"按键未完整发送，已尝试释放全部输入。");
  }
  function click(button:number){
    if(!enabled||!lastPoint.current)return;
    releaseGestures();const payload={...lastPoint.current,button};
    const accepted=onAction({type:"mouse_down",payload});onAction({type:"mouse_up",payload});if(!accepted)onRelease();
  }
  if(!visible)return<button className="touch-tools-toggle" onClick={()=>setVisible(true)}>显示触屏工具</button>;
  return<section className="touch-controls" aria-label="触屏控制工具">
    <fieldset className="touch-mode-options"><legend>控制方式</legend>{([{value:"direct",label:"直触",detail:"点哪里，鼠标就到哪里"},{value:"touchpad",label:"触控板",detail:"滑动相对移动，抬手不跳位"}]as const).map(option=><label key={option.value} className={touchMode===option.value?"selected":""}><input type="radio" name={`${id}-touch-mode`} checked={touchMode===option.value} onChange={()=>changeMode(option.value)}/><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}</fieldset>
    <div className="touch-control-actions">
      <button disabled={!enabled} aria-pressed={drag} className={drag?"touch-selected":""} onClick={()=>{releaseGestures();setDrag(!drag);}}>{drag?"拖拽：开启":"拖拽：关闭"}</button>
      <button disabled={!enabled||!hasPoint} onClick={()=>click(0)}>左键</button><button disabled={!enabled||!hasPoint} onClick={()=>click(2)}>右键</button>
      <button disabled={!enabled} onClick={()=>onAction({type:"mouse_wheel",payload:{deltaX:0,deltaY:-120}})}>向上滚动</button><button disabled={!enabled} onClick={()=>onAction({type:"mouse_wheel",payload:{deltaX:0,deltaY:120}})}>向下滚动</button>
      <button disabled={!enabled} aria-expanded={keyboard} aria-controls={`${id}-keyboard`} onClick={()=>{releaseGestures();setModifiers([]);setKeyboard(!keyboard);if(!keyboard)requestAnimationFrame(()=>textRef.current?.focus());}}>键盘 / 文字</button>
    </div>
    <p className="touch-instructions">{enabled?touchMode==="touchpad"?"画面就是触控板：单指滑动移动光标，轻点点击，双指上下滚动。首次触点定位鼠标，后续抬手不跳位。":"轻点点击 · 单指移动光标 · 双指上下滚动。开启拖拽后可移动窗口或选择内容。":available?"输入已暂停，点击“恢复操作”继续。":"设备连接并出现画面后，即可触屏操作。"}</p>
    <button className="touch-stop compact-stop" disabled={!enabled} onClick={()=>{releaseGestures();setModifiers([]);onSuspend();}}>暂停全部输入</button>
    {keyboard&&enabled&&<div className="mobile-keyboard-panel" id={`${id}-keyboard`}>
      <div className="mobile-modifiers" role="group" aria-label="一次性组合修饰键">{(["Control","Alt","Shift"]as const).map(modifier=><button key={modifier} aria-pressed={modifiers.includes(modifier)} onClick={()=>setModifiers(previous=>previous.includes(modifier)?previous.filter(value=>value!==modifier):[...previous,modifier])}>{modifier==="Control"?"Ctrl":modifier}</button>)}</div>
      <p className="modifier-help">{modifiers.length?`${modifiers.map(value=>value==="Control"?"Ctrl":value).join(" + ")} + 下一个按键；发送后自动释放。`:"组合修饰键只用于下一个按键，不会持续按住。"}</p>
      <div className="mobile-shortcuts" role="group" aria-label="远端快捷键"><button onClick={()=>key("c","KeyC",["Control"])}>Ctrl+C</button><button onClick={()=>key("v","KeyV",["Control"])}>Ctrl+V</button><button onClick={()=>key("a","KeyA",["Control"])}>Ctrl+A</button><button onClick={()=>key("z","KeyZ",["Control"])}>Ctrl+Z</button><button onClick={()=>key("Tab","Tab",["Alt"])}>Alt+Tab</button><button onClick={()=>key("c","KeyC")}>C</button><button onClick={()=>key("v","KeyV")}>V</button><button onClick={()=>key("a","KeyA")}>A</button></div>
      <div className="mobile-key-row">{[{key:"Escape",code:"Escape",label:"Esc"},{key:"Tab",code:"Tab",label:"Tab"},{key:"Backspace",code:"Backspace",label:"退格"},{key:"Delete",code:"Delete",label:"Delete"},{key:"Enter",code:"Enter",label:"回车"},{key:" ",code:"Space",label:"空格"},{key:"ArrowLeft",code:"ArrowLeft",label:"←"},{key:"ArrowRight",code:"ArrowRight",label:"→"},{key:"ArrowUp",code:"ArrowUp",label:"↑"},{key:"ArrowDown",code:"ArrowDown",label:"↓"}].map(item=><button key={item.code} aria-label={`发送${item.key===" "?"空格":item.key}`} onClick={()=>key(item.key,item.code)}>{item.label}</button>)}</div>
      <p className="modifier-help">Ctrl+C / Ctrl+V 操作电脑当前选区与电脑剪贴板；不会读取手机剪贴板。</p>
      <label htmlFor={`${id}-draft`}>发送到电脑当前输入位置</label><textarea ref={textRef} id={`${id}-draft`} value={text} maxLength={128} disabled={!textSupported} autoComplete="off" autoCorrect="off" spellCheck={false} rows={2} onChange={event=>{setText(event.target.value.replace(/\r\n?/g,"\n"));setMessage("");}} aria-describedby={`${id}-help`}/>
      <div className="mobile-text-send"><p id={`${id}-help`}>{textSupported?"先在画面点选电脑输入框。支持中文，最多 128 个字符；点击发送后才传输。":"电脑端需升级后才支持文字发送；快捷按键仍可使用。"}</p><button className="primary-action" disabled={!textSupported||!validRemoteText(text)} onClick={()=>{if(!validRemoteText(text))return;releaseGestures();if(onAction({type:"text_input",payload:{text}})){setText("");setMessage("文字已发送，请确认电脑显示结果。");}else setMessage("未发送，连接可能已断开。");}}>发送文字</button></div>
    </div>}
    <p className="field-hint touch-operation-message" role="status">{message}</p>
  </section>;
}
