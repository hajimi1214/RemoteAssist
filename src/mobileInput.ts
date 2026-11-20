export type MobileAction = { type: "mouse_move" | "mouse_down" | "mouse_up" | "mouse_wheel" | "key_down" | "key_up" | "text_input" | "release_all"; payload?: Record<string, unknown> };
export type TouchPoint = { id: number; x: number; y: number; clientX: number; clientY: number; at: number };
export const TOUCH_TAP_SLOP = 14;
export const TOUCH_TAP_MAX_MS = 850;

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
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("请输入 HTTPS 服务根地址，例如 https://assist.example.com，不包含账号、路径或参数。");
  return url.origin;
}
