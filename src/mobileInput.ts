import { allowsLanHttp } from "./lanTest.ts";

export type MobileAction = { type: "mouse_move" | "mouse_down" | "mouse_up" | "mouse_wheel" | "key_down" | "key_up" | "text_input" | "release_all"; payload?: Record<string, unknown> };
export type TouchPoint = { id: number; x: number; y: number; clientX: number; clientY: number; at: number };
export const TOUCH_TAP_SLOP = 14;
export const TOUCH_TAP_MAX_MS = 850;
export type TouchMode = "direct" | "touchpad";
export type RemoteModifier = "Control" | "Alt" | "Shift";
export type NormalizedPoint = { x: number; y: number };

/** A gesture never becomes a click after a second finger or a cancellation. */
export class TouchController {
  private points = new Map<number, TouchPoint>();
  private start?: TouchPoint;
  private dragging = false;
  private multiple = false;
  private moved = false;
  private scrollY = 0;
  down(point: TouchPoint, drag: boolean): MobileAction[] {
    this.points.set(point.id, point);
    if (this.points.size > 1) {
      this.multiple = true; this.dragging = false;
      this.scrollY = this.centroid();
      return [{ type: "release_all" }];
    }
    this.start = point; this.moved = false; this.multiple = false; this.dragging = drag;
    return [{ type: drag ? "mouse_down" : "mouse_move", payload: { x: point.x, y: point.y, button: 0 } }];
  }
  move(point: TouchPoint): MobileAction[] {
    if (!this.points.has(point.id)) return [];
    this.points.set(point.id, point);
    if (this.multiple) {
      if (this.points.size !== 2) return [];
      const y = this.centroid(), deltaY = this.scrollY - y; this.scrollY = y;
      return Math.abs(deltaY) >= 1 ? [{ type: "mouse_wheel", payload: { deltaX: 0, deltaY: Math.max(-120, Math.min(120, deltaY)) } }] : [];
    }
    if (this.start && Math.hypot(point.clientX - this.start.clientX, point.clientY - this.start.clientY) > TOUCH_TAP_SLOP) this.moved = true;
    return [{ type: "mouse_move", payload: { x: point.x, y: point.y, button: 0 } }];
  }
  up(point: TouchPoint): MobileAction[] {
    if (!this.points.has(point.id)) return [];
    this.points.delete(point.id);
    const payload = { x: point.x, y: point.y, button: 0 };
    const actions: MobileAction[] = this.multiple ? [] : this.dragging ? [{ type: "mouse_up", payload }] : !this.moved && this.start && point.at - this.start.at < TOUCH_TAP_MAX_MS && Math.hypot(point.clientX - this.start.clientX, point.clientY - this.start.clientY) <= TOUCH_TAP_SLOP ? [{ type: "mouse_down", payload }, { type: "mouse_up", payload }] : [];
    if (!this.points.size) { this.start = undefined; this.multiple = false; this.dragging = false; }
    return actions;
  }
  cancel(): MobileAction[] { this.points.clear(); this.start = undefined; this.multiple = false; this.dragging = false; return [{ type: "release_all" }]; }
  hasPointer(id: number): boolean { return this.points.has(id); }
  private centroid() { return [...this.points.values()].reduce((sum, point) => sum + point.clientY, 0) / this.points.size; }
}

/** Relative movement is derived only from contacts on the displayed video. */
export class TouchpadController {
  private points = new Map<number, TouchPoint>();
  private start?: TouchPoint;
  private pointer?: NormalizedPoint;
  private dragging = false;
  private multiple = false;
  private moved = false;
  private scrollY = 0;
  private scrollPending = 0;
  private readonly sensitivity:number;
  constructor(sensitivity = 1.25) {this.sensitivity=Number.isFinite(sensitivity)&&sensitivity>0?sensitivity:1.25;}
  setPointer(point: NormalizedPoint): void {
    if(Number.isFinite(point.x)&&Number.isFinite(point.y))this.pointer={x:Math.max(0,Math.min(1,point.x)),y:Math.max(0,Math.min(1,point.y))};
  }
  position(): NormalizedPoint | undefined { return this.pointer ? {...this.pointer} : undefined; }
  down(point:TouchPoint,drag:boolean):MobileAction[] {
    this.points.set(point.id,point);
    if(this.points.size>1){this.multiple=true;this.dragging=false;this.scrollY=this.centroid();this.scrollPending=0;return[{type:"release_all"}];}
    // The first deliberate contact establishes a real mapped location; later
    // contacts retain the cursor instead of jumping it to the finger.
    if(!this.pointer)this.setPointer(point);
    this.start=point;this.dragging=drag;this.multiple=false;this.moved=false;
    return[{type:drag?"mouse_down":"mouse_move",payload:{...this.pointer!,button:0}}];
  }
  move(point:TouchPoint,bounds:{width:number;height:number}):MobileAction[] {
    const previous=this.points.get(point.id);if(!previous)return[];
    this.points.set(point.id,point);
    if(this.multiple){
      if(this.points.size!==2)return[];
      const next=this.centroid();this.scrollPending+=this.scrollY-next;this.scrollY=next;
      if(Math.abs(this.scrollPending)<1)return[];
      const deltaY=Math.max(-120,Math.min(120,this.scrollPending));this.scrollPending=0;return[{type:"mouse_wheel",payload:{deltaX:0,deltaY}}];
    }
    if(!this.pointer||![bounds.width,bounds.height].every(value=>Number.isFinite(value)&&value>0))return[];
    if(this.start&&Math.hypot(point.clientX-this.start.clientX,point.clientY-this.start.clientY)>TOUCH_TAP_SLOP)this.moved=true;
    this.pointer={x:Math.max(0,Math.min(1,this.pointer.x+(point.clientX-previous.clientX)/bounds.width*this.sensitivity)),y:Math.max(0,Math.min(1,this.pointer.y+(point.clientY-previous.clientY)/bounds.height*this.sensitivity))};
    return[{type:"mouse_move",payload:{...this.pointer,button:0}}];
  }
  up(point:TouchPoint):MobileAction[] {
    if(!this.points.has(point.id))return[];this.points.delete(point.id);
    const payload=this.pointer?{...this.pointer,button:0}:undefined;
    const click=!this.moved&&this.start&&point.at-this.start.at<TOUCH_TAP_MAX_MS&&Math.hypot(point.clientX-this.start.clientX,point.clientY-this.start.clientY)<=TOUCH_TAP_SLOP;
    const actions:MobileAction[]=!payload||this.multiple?[]:this.dragging?[{type:"mouse_up",payload}]:click?[{type:"mouse_down",payload},{type:"mouse_up",payload}]:[];
    if(!this.points.size){this.start=undefined;this.multiple=false;this.dragging=false;this.scrollPending=0;}
    return actions;
  }
  cancel():MobileAction[]{this.points.clear();this.start=undefined;this.multiple=false;this.dragging=false;this.scrollPending=0;return[{type:"release_all"}];}
  hasPointer(id:number):boolean{return this.points.has(id);}
  private centroid(){return[...this.points.values()].reduce((sum,point)=>sum+point.clientY,0)/this.points.size;}
}

/** One-shot modifiers are never held between UI button taps. */
export function dispatchKeyChord(send:(action:MobileAction)=>boolean,key:string,code:string,modifiers:readonly RemoteModifier[]=[]):boolean {
  const selected=[...new Set(modifiers)].filter(value=>["Control","Alt","Shift"].includes(value));
  const keys=[...selected.map(value=>({key:value,code:`${value}Left`})),{key,code}];
  const pressed:Array<{key:string;code:string}>=[];let success=true;
  const flags={ctrlKey:selected.includes("Control"),altKey:selected.includes("Alt"),shiftKey:selected.includes("Shift"),metaKey:false};
  try{
    for(const item of keys){pressed.push(item);if(!send({type:"key_down",payload:{...item,...flags}})){success=false;break;}}
  }catch{success=false;}
  finally{
    for(const item of pressed.reverse())try{if(!send({type:"key_up",payload:{...item,...flags}}))success=false;}catch{success=false;}
    if(!success)try{send({type:"release_all"});}catch{/* A closed channel cannot retain a new key press. */}
  }
  return success;
}

/** Fill crops the source at the viewport edges and never stretches its ratio. */
export function filledVideoLayout(container: {width:number;height:number}, source: {width:number;height:number}) {
  if (![container.width,container.height,source.width,source.height].every(value=>Number.isFinite(value)&&value>0)) return {width:0,height:0,scale:1};
  const scale=Math.max(container.width/source.width,container.height/source.height);
  return {width:source.width*scale,height:source.height*scale,scale};
}

export function validRemoteText(text: string): boolean {
  return text.length > 0 && text.length <= 128 && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);
}

export function normalizeServerAddress(value: string): string {
  const url = new URL(value.trim());
  if (!(url.protocol === "https:" || allowsLanHttp(url)) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("请输入 HTTPS 服务根地址，例如 https://assist.example.com，不包含账号、路径或参数。");
  return url.origin;
}
