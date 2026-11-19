import { invoke } from "@tauri-apps/api/core";
import { mapVideoPoint } from "./pointerMapping";
import { PointerOrder } from "./inputSequence";

export type InputEventType =
  | "mouse_move"
  | "mouse_down"
  | "mouse_up"
  | "mouse_wheel"
  | "key_down"
  | "key_up"
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

export class InputEventGate {
  private hits: number[] = [];
  private readonly pointerOrder = new PointerOrder();

  constructor(
    private readonly expectedSessionToken: string,
    private readonly isAuthorized: () => boolean,
    private readonly maxPerSecond = 120,
    private readonly deliver: (command: string, args?: Record<string, unknown>) => Promise<unknown> = invoke
  ) {}

  async accept(raw: unknown): Promise<void> {
    const event = this.parse(raw);
    if (event.type === "ping") {
      await this.deliver("renew_input_lease", { sessionToken: event.sessionToken });
      return;
    }
    if (event.type === "pong") {
      return;
    }
    if (event.type === "disconnect") {
      await this.deliver("clear_input_authorization");
      return;
    }
    if (event.type === "release_all") {
      await this.deliver("release_remote_inputs", { sessionToken: event.sessionToken });
      return;
    }
    await this.deliver("send_input_event", { event });
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
    "mouse_down",
    "mouse_up",
    "mouse_wheel",
    "key_down",
    "key_up",
    "release_all",
    "ping",
    "pong",
    "disconnect"
  ].includes(value);
}

function validatePayload(event: RemoteInputEvent): void {
  const payload = event.payload ?? {};
  if (event.type.startsWith("mouse_")) {
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
