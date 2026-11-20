export const HEARTBEAT_INTERVAL_MS = 2_000;
export const HEARTBEAT_TIMEOUT_MS = 8_000;
export const NEGOTIATION_TIMEOUT_MS = 25_000;

// Monotonic time and individually correlated probes support RTTs longer than
// one probe interval; a late pong must not be compared with the newest ping.
export class HeartbeatTracker {
  private sequence = 0;
  private readonly pending = new Map<number, number>();
  private acknowledgedAt: number;

  constructor(startedAt: number) { this.acknowledgedAt = startedAt; }

  probe(now: number): number {
    for (const [id, sent] of this.pending) if (now - sent >= HEARTBEAT_TIMEOUT_MS) this.pending.delete(id);
    const id = ++this.sequence;
    this.pending.set(id, now);
    // This class also stays bounded if a caller sends more often than intended.
    while (this.pending.size > 8) this.pending.delete(this.pending.keys().next().value!);
    return id;
  }

  acknowledge(id: unknown, now: number): number | null {
    if (typeof id !== "number" || !Number.isSafeInteger(id)) return null;
    const sent = this.pending.get(id);
    if (sent == null || now < sent || now - sent >= HEARTBEAT_TIMEOUT_MS) return null;
    this.pending.delete(id);
    this.acknowledgedAt = now;
    return Math.round(now - sent);
  }

  expired(now: number): boolean { return now - this.acknowledgedAt >= HEARTBEAT_TIMEOUT_MS; }
}

// Keep the latest position during a burst and deliver the final position even
// when the pointer stops before the next frame. Keys/buttons never use this queue.
export class LatestPointer<T> {
  private value?: T;
  private lastSent = -Infinity;
  private scheduled?: ReturnType<typeof setTimeout>;
  private closed = false;
  private readonly send: (value: T) => void;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly cancel: (id: ReturnType<typeof setTimeout>) => void;
  constructor(
    send: (value: T) => void,
    intervalMs = 20,
    now: () => number = () => performance.now(),
    schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = (fn,ms)=>setTimeout(fn,ms),
    cancel: (id: ReturnType<typeof setTimeout>) => void = (id)=>clearTimeout(id)
  ) { this.send=send;this.intervalMs=intervalMs;this.now=now;this.schedule=schedule;this.cancel=cancel; }

  push(value: T): void {
    if (this.closed) return;
    this.value = value;
    const remaining = this.intervalMs - (this.now() - this.lastSent);
    if (remaining <= 0) this.flush();
    else if (this.scheduled == null) this.scheduled = this.schedule(() => { this.scheduled = undefined; this.flush(); }, remaining);
  }

  flush(): void {
    if (this.scheduled != null) this.cancel(this.scheduled);
    this.scheduled = undefined;
    if (this.closed || this.value === undefined) return;
    const value = this.value;
    this.value = undefined;
    this.lastSent = this.now();
    this.send(value);
  }

  discard(): void {
    if (this.scheduled != null) this.cancel(this.scheduled);
    this.scheduled = undefined;
    this.value = undefined;
  }

  close(): void { this.discard(); this.closed = true; }
}
