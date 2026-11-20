import assert from "node:assert/strict";
import test from "node:test";
import { HeartbeatTracker, LatestPointer } from "./transportTiming.ts";

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
  const queue = new LatestPointer<number>((n) => sent.push(n), 20, () => now,
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
