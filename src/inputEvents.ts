import { invoke } from "@tauri-apps/api/core";

export type InputEventType =
  | "mouse_move"
  | "mouse_down"
  | "mouse_up"
  | "mouse_wheel"
  | "key_down"
  | "key_up"
  | "ping"
  | "pong"
  | "disconnect";

export interface RemoteInputEvent {
  type: InputEventType;
  sessionToken: string;
  ts: number;
  payload?: Record<string, unknown>;
}

const maxInputMessageBytes = 16 * 1024;
const maxClockSkewMs = 30_000;

export class InputEventGate {
  private hits: number[] = [];

  constructor(
    private readonly expectedSessionToken: string,
    private readonly isAuthorized: () => boolean,
    private readonly maxPerSecond = 120
  ) {}

  async accept(raw: unknown): Promise<void> {
    const event = this.parse(raw);
    if (event.type === "ping" || event.type === "pong") {
      return;
    }
    if (event.type === "disconnect") {
      await invoke("clear_input_authorization");
      return;
    }
    await invoke("send_input_event", { event });
  }

  private parse(raw: unknown): RemoteInputEvent {
    const encoded = JSON.stringify(raw);
    if (encoded.length > maxInputMessageBytes) {
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
    this.checkRate();
    validatePayload(event);
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
  element: HTMLElement,
  ev: React.PointerEvent
): RemoteInputEvent {
  const rect = element.getBoundingClientRect();
  return {
    type,
    sessionToken,
    ts: Date.now(),
    payload: {
      x: clamp01((ev.clientX - rect.left) / rect.width),
      y: clamp01((ev.clientY - rect.top) / rect.height),
      button: ev.button
    }
  };
}

export function wheelInput(sessionToken: string, ev: React.WheelEvent): RemoteInputEvent {
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
