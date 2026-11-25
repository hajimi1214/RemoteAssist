import { invoke } from "@tauri-apps/api/core";
import { mapVideoPoint } from "./pointerMapping.ts";
import { PointerOrder } from "./inputSequence.ts";
import { validRemoteText } from "./mobileInput.ts";
import { isQualityMode } from "./qualityMode.ts";
import { validGameDelta } from "./gameInput.ts";

export type InputEventType =
  | "mouse_move"
  | "mouse_relative"
  | "mouse_down"
  | "mouse_up"
  | "mouse_wheel"
  | "key_down"
  | "key_up"
  | "text_input"
  | "quality_mode"
  | "release_all"
  | "ping"
  | "pong"
  | "disconnect";

export interface RemoteInputEvent {
  type: InputEventType;
  sessionToken: string;
  ts: number;
  sequence?: number;
  payload?: Record<string, unknown>;
}

const maxInputMessageBytes = 16 * 1024;
const maxClockSkewMs = 30_000;
export const MAX_PENDING_NATIVE_EVENTS = 256;

export class InputEventGate {
  private hits: number[] = [];
  private readonly pointerOrder = new PointerOrder();
  private readonly expectedSessionToken: string;
  private readonly isAuthorized: () => boolean;
  private readonly maxPerSecond: number;
  private readonly deliver: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  private deliveryTail: Promise<void> = Promise.resolve();
  private pendingNativeEvents = 0;
  private overflowRevocationStarted = false;

  constructor(
    expectedSessionToken: string,
    isAuthorized: () => boolean,
    maxPerSecond = 120,
    deliver: (command: string, args?: Record<string, unknown>) => Promise<unknown> = invoke
  ) { this.expectedSessionToken=expectedSessionToken;this.isAuthorized=isAuthorized;this.maxPerSecond=maxPerSecond;this.deliver=deliver; }

  async accept(raw: unknown): Promise<void> {
    const event = this.parse(raw);
    if (event.type === "quality_mode") return;
    if (event.type === "ping") {
      await this.deliverInOrder("renew_input_lease", { sessionToken: event.sessionToken });
      return;
    }
    if (event.type === "pong") {
      return;
    }
    if (event.type === "disconnect") {
      await this.deliverInOrder("clear_input_authorization", undefined, false);
      return;
    }
    if (event.type === "release_all") {
      await this.deliverInOrder("release_remote_inputs", { sessionToken: event.sessionToken }, true, true);
      return;
    }
    await this.deliverInOrder("send_input_event", { event });
  }

  private deliverInOrder(command: string, args?: Record<string, unknown>, requiresLiveAuthorization = true, releaseBarrier = false): Promise<unknown> {
    const eventType = args?.event && typeof args.event === "object"
      ? (args.event as RemoteInputEvent).type
      : undefined;
    const releaseEdge = releaseBarrier || eventType === "key_up" || eventType === "mouse_up" || eventType === "release_all";
    if (this.pendingNativeEvents >= MAX_PENDING_NATIVE_EVENTS && releaseEdge) {
      // Under an extreme native IPC backlog, release all held inputs immediately
      // and revoke the lease instead of dropping a key/button release.
      if (this.overflowRevocationStarted) return Promise.reject(new Error("input_delivery_backlogged"));
      this.overflowRevocationStarted = true;
      return this.deliver("clear_input_authorization").then(() => {
        throw new Error("input_delivery_backlogged");
      });
    }
    if (this.pendingNativeEvents >= MAX_PENDING_NATIVE_EVENTS && command !== "clear_input_authorization") {
      return Promise.reject(new Error("input_delivery_backlogged"));
    }
    this.pendingNativeEvents++;
    const delivery = this.deliveryTail.catch(() => undefined).then(async () => {
      if (requiresLiveAuthorization && !this.isAuthorized()) throw new Error("input_not_authorized");
      return this.deliver(command, args);
    });
    this.deliveryTail = delivery.then(() => undefined, () => undefined);
    return delivery.finally(() => { this.pendingNativeEvents--; });
  }

  private parse(raw: unknown): RemoteInputEvent {
    const encoded = JSON.stringify(raw);
    if (!encoded || new TextEncoder().encode(encoded).byteLength > maxInputMessageBytes) {
      throw new Error("input_message_too_large");
    }
    if (!this.isAuthorized()) {
      throw new Error("input_not_authorized");
    }
    if (!raw || typeof raw !== "object") {
      throw new Error("invalid_input_event");
    }
    const event = raw as RemoteInputEvent;
    if (!validType(event.type) || event.sessionToken !== this.expectedSessionToken) {
      throw new Error("invalid_input_token_or_type");
    }
    if (!Number.isFinite(event.ts) || Math.abs(Date.now() - event.ts) > maxClockSkewMs) {
      throw new Error("invalid_input_timestamp");
    }
    validatePayload(event);
    if (!["key_up", "mouse_up", "release_all", "ping", "pong"].includes(event.type)) this.checkRate();
    if (!this.pointerOrder.accept(event.type, event.sequence)) throw new Error("stale_pointer_event");
    return event;
  }

  private checkRate(): void {
    const now = Date.now();
    this.hits = this.hits.filter((seen) => now - seen < 1000);
    if (this.hits.length >= this.maxPerSecond) {
      throw new Error("input_rate_limited");
    }
    this.hits.push(now);
  }
}

export function inputFromPointer(
  type: "mouse_move" | "mouse_down" | "mouse_up",
  sessionToken: string,
  element: HTMLVideoElement,
  ev: React.PointerEvent
): RemoteInputEvent | null {
  const rect = element.getBoundingClientRect();
  const point = mapVideoPoint(rect, element.videoWidth, element.videoHeight, ev.clientX, ev.clientY);
  if (!point) return null;
  return {
    type,
    sessionToken,
    ts: Date.now(),
    payload: {
      x: point.x,
      y: point.y,
      button: ev.button
    }
  };
}

export function wheelInput(sessionToken: string, ev: Pick<WheelEvent,"deltaX"|"deltaY">): RemoteInputEvent {
  return {
    type: "mouse_wheel",
    sessionToken,
    ts: Date.now(),
    payload: { deltaX: ev.deltaX, deltaY: ev.deltaY }
  };
}

export function keyInput(type: "key_down" | "key_up", sessionToken: string, ev: React.KeyboardEvent): RemoteInputEvent {
  return {
    type,
    sessionToken,
    ts: Date.now(),
    payload: {
      key: ev.key,
      code: ev.code,
      ctrlKey: ev.ctrlKey,
      altKey: ev.altKey,
      shiftKey: ev.shiftKey,
      metaKey: ev.metaKey
    }
  };
}

function validType(value: string): value is InputEventType {
  return [
    "mouse_move",
    "mouse_relative",
    "mouse_down",
    "mouse_up",
    "mouse_wheel",
    "key_down",
    "key_up",
    "text_input",
    "quality_mode",
    "release_all",
    "ping",
    "pong",
    "disconnect"
  ].includes(value);
}

function validatePayload(event: RemoteInputEvent): void {
  const payload = event.payload ?? {};
  if (event.type === "quality_mode" && !isQualityMode(payload.mode)) throw new Error("invalid_quality_mode");
  if (event.type === "text_input" && (typeof payload.text !== "string" || !validRemoteText(payload.text))) throw new Error("invalid_text_payload");
  if (event.type.startsWith("mouse_")) {
    if (event.type === "mouse_relative") {
      if (!validGameDelta(payload.dx) || !validGameDelta(payload.dy)) throw new Error("invalid_mouse_delta");
      return;
    }
    if ((event.type === "mouse_down" || event.type === "mouse_up") && payload.relative === true) {
      if (payload.button !== 0 && payload.button !== 1 && payload.button !== 2) throw new Error("invalid_mouse_button");
      return;
    }
    if (event.type === "mouse_wheel") {
      if (!Number.isFinite(payload.deltaX) || !Number.isFinite(payload.deltaY)) {
        throw new Error("invalid_wheel_payload");
      }
      return;
    }
    if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) {
      throw new Error("invalid_mouse_payload");
    }
  }
  if (event.type.startsWith("key_") && (typeof payload.key !== "string" || typeof payload.code !== "string")) {
    throw new Error("invalid_key_payload");
  }
}
