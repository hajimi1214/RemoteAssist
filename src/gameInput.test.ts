import assert from "node:assert/strict";
import test from "node:test";
import { clampGameDelta, normalizedTouchpadDelta, relativeMouseSample, validGameDelta } from "./gameInput.ts";

test("relative game pointer samples preserve sign and bounded sensitivity",()=>{
  assert.deepEqual(relativeMouseSample(5,-4,1.5),{type:"mouse_relative",payload:{dx:8,dy:-6}});
  assert.equal(relativeMouseSample(0.2,0.2),null);
  assert.deepEqual(relativeMouseSample(900,-900),{type:"mouse_relative",payload:{dx:900,dy:-900}});
  assert.deepEqual(relativeMouseSample(5000,-5000),{type:"mouse_relative",payload:{dx:1024,dy:-1024}});
  assert.equal(relativeMouseSample(1,1,99),null);
  assert.equal(validGameDelta(1024),true);assert.equal(validGameDelta(-1024),true);
  for(const value of [1025,-1025,0.5,NaN,Infinity,"2"])assert.equal(validGameDelta(value),false);
  assert.equal(clampGameDelta(NaN),0);
});

test("touchpad converts only differences between captured video points to game deltas",()=>{
  assert.deepEqual(normalizedTouchpadDelta({x:0.5,y:0.5},{x:0.51,y:0.48},1920,1080),{type:"mouse_relative",payload:{dx:24,dy:-27}});
  assert.equal(normalizedTouchpadDelta({x:0.5,y:0.5},{x:0.50001,y:0.50001},1920,1080),null);
  assert.equal(normalizedTouchpadDelta({x:0,y:0},{x:1,y:1},0,1080),null);
});

