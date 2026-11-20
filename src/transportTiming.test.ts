import assert from "node:assert/strict";
import test from "node:test";
import { HeartbeatTracker, LatestPointer, POINTER_MAX_AGE_MS } from "./transportTiming.ts";

test("late pong is correlated with its probe after a newer ping", () => {
  const heartbeats = new HeartbeatTracker(0);
  const first = heartbeats.probe(0);
  const second = heartbeats.probe(2000);
  assert.equal(heartbeats.acknowledge(first, 2500), 2500);
  assert.equal(heartbeats.acknowledge(second, 2700), 700);
  assert.equal(heartbeats.acknowledge(first, 2800), null);
  assert.equal(heartbeats.acknowledge(99, 3000), null);
  assert.equal(heartbeats.expired(10699), false);
  assert.equal(heartbeats.expired(10700), true);
});

test("expired or invalid pongs cannot keep the connection alive", () => {
  const heartbeats = new HeartbeatTracker(0);
  const id = heartbeats.probe(0);
  assert.equal(heartbeats.acknowledge(id, 8000), null);
  assert.equal(heartbeats.acknowledge(NaN, 8000), null);
  assert.equal(heartbeats.expired(8000), true);
});

test("pointer burst sends first and final positions, not stale queued movement", () => {
  let now = 0;
  let callback: (() => void) | undefined;
  const sent: number[] = [];
  const queue = new LatestPointer<number>((n) => { sent.push(n); }, 20, () => now,
    (fn) => { callback=fn; return 1 as unknown as ReturnType<typeof setTimeout>; }, () => { callback=undefined; });
  queue.push(1);
  now=5; queue.push(2); now=10; queue.push(3);
  assert.deepEqual(sent,[1]);
  now=20; callback?.();
  assert.deepEqual(sent,[1,3]);
  now=25; queue.push(4); queue.discard(); now=40; callback?.();
  assert.deepEqual(sent,[1,3]);
  queue.close(); queue.push(5); queue.flush();
  assert.deepEqual(sent,[1,3]);
});

function pointerHarness() {
  let now = 0;
  let callback: (() => void) | undefined;
  let blocked = true;
  const sent: number[] = [];
  const queue = new LatestPointer<number>(value => { if (blocked) return false; sent.push(value); return true; }, 20, () => now,
    fn => { callback=fn; return 1 as unknown as ReturnType<typeof setTimeout>; }, () => { callback=undefined; });
  return { queue, sent, tick(time:number) { now=time; const fn=callback; callback=undefined; fn?.(); },
    setTime(time:number) { now=time; }, unblock() { blocked=false; }, pending() { return callback!=null; } };
}

test("backpressure retains only the latest pointer and delivers it when the buffer drains", () => {
  const harness=pointerHarness();
  harness.queue.push(1);
  harness.setTime(5); harness.queue.push(2);
  harness.setTime(10); harness.queue.push(3);
  harness.tick(30);
  assert.deepEqual(harness.sent,[]);
  harness.unblock(); harness.setTime(35); harness.queue.flush();
  assert.deepEqual(harness.sent,[3]);
  assert.equal(harness.pending(),false);
  harness.setTime(36); harness.queue.push(4); harness.queue.flush();
  assert.deepEqual(harness.sent,[3]); // buffer callbacks cannot bypass the pacing interval
  harness.tick(55);
  assert.deepEqual(harness.sent,[3,4]);
});

test("congested pointer expires even if timers were delayed and is not replayed after draining", () => {
  const harness=pointerHarness(); harness.queue.push(1);
  harness.tick(POINTER_MAX_AGE_MS);
  assert.equal(harness.pending(),false);
  harness.unblock(); harness.queue.flush();
  assert.deepEqual(harness.sent,[]);
  harness.queue.push(2);
  assert.deepEqual(harness.sent,[2]);
});

test("release barriers and close discard a backpressured pointer before buffer events can replay it", () => {
  const harness=pointerHarness(); harness.queue.push(1); harness.queue.discard();
  harness.unblock(); harness.queue.flush(); harness.tick(20);
  assert.deepEqual(harness.sent,[]);
  harness.queue.close(); harness.queue.push(2); harness.queue.flush();
  assert.deepEqual(harness.sent,[]); assert.equal(harness.pending(),false);
});

test("synchronous send failure that closes the queue cannot schedule a retry", () => {
  let scheduled=false;
  const queue=new LatestPointer<number>(()=>{queue.close();return false;},20,()=>0,
    ()=>{scheduled=true;return 1 as unknown as ReturnType<typeof setTimeout>;},()=>undefined);
  queue.push(1);
  assert.equal(scheduled,false);
});
