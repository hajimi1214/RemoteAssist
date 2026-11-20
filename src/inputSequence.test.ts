import assert from "node:assert/strict";
import test from "node:test";
import { PointerOrder } from "./inputSequence.ts";

test("drops reordered motion and motion older than a reliable click", () => {
  const order = new PointerOrder();
  assert.equal(order.accept("mouse_move", 4), true);
  assert.equal(order.accept("mouse_move", 2), false);
  assert.equal(order.accept("mouse_move", 4), false);
  assert.equal(order.accept("mouse_down", 8), true);
  assert.equal(order.accept("mouse_move", 7), false);
  assert.equal(order.accept("mouse_move", 9), true);
});

test("reliable button release is never discarded because newer motion arrived", () => {
  const order = new PointerOrder();
  assert.equal(order.accept("mouse_move", 10), true);
  assert.equal(order.accept("mouse_up", 8), true);
  assert.equal(order.accept("mouse_move", 9), false);
  assert.equal(order.accept("mouse_move", NaN), false);
  assert.equal(order.accept("mouse_down", undefined), false);
  assert.equal(order.accept("key_up", undefined), true);
});

test("release-all prevents late pointer motion from moving the host after local input stops",()=>{
  const order=new PointerOrder();
  assert.equal(order.accept("mouse_down",1),true);
  assert.equal(order.accept("release_all",3),true);
  assert.equal(order.accept("mouse_move",2),false);
  assert.equal(order.accept("mouse_up",2),true);
  assert.equal(order.accept("mouse_move",4),true);
});
