import assert from "node:assert/strict";
import test from "node:test";
import { captureDamage, damageScissor, visibleCaptureCursor } from "./captureDamage.ts";

test("moving, hiding and clipping the pointer invalidates the affected pixels", () => {
  const a = {x: 500, y: 600}, b = {x: 3839, y: 2159};
  assert.deepEqual(captureDamage([], a, b, 3840, 2160), [
    {x: 499, y: 599, width: 14, height: 22}, {x: 3838, y: 2158, width: 2, height: 2},
  ]);
  assert.deepEqual(captureDamage([], b, visibleCaptureCursor(-1, -1, 3840, 2160), 3840, 2160), [
    {x: 3838, y: 2158, width: 2, height: 2},
  ]);
  assert.deepEqual(captureDamage([], a, {...a}, 3840, 2160), []);
});

test("damage covers the original patches even if a stationary cursor overlaps, and scissors use a bottom origin", () => {
  const patch = {x: 5, y: 10, width: 22, height: 30};
  const cursor = {x: 10, y: 10};
  assert.deepEqual(captureDamage([patch], cursor, cursor, 100, 200), [patch]);
  assert.deepEqual(damageScissor(patch, 200), [5, 160, 22, 30]);
});
