import assert from "node:assert/strict";
import test from "node:test";
import { clampGameDelta, normalizedTouchpadDelta, relativeMouseSample, RelativeMouseAccumulator, shouldForwardRemoteKey, validGameDelta } from "./gameInput.ts";

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

test("relative mouse accumulator preserves fractional motion across DOM samples",()=>{
  const mouse=new RelativeMouseAccumulator();
  for(let i=0;i<19;i++)assert.equal(mouse.sample(0.05,0.05),null);
  assert.deepEqual(mouse.sample(0.05,0.05),{type:"mouse_relative",payload:{dx:1,dy:1}});
  assert.equal(mouse.sample(-0.4,-0.4,1),null);
  assert.deepEqual(mouse.sample(-0.6,-0.6,1),{type:"mouse_relative",payload:{dx:-1,dy:-1}});
});

test("relative mouse accumulator clears fractional state when sensitivity or input validity changes",()=>{
  const mouse=new RelativeMouseAccumulator();
  assert.equal(mouse.sample(0.75,0),null);
  assert.equal(mouse.sample(0.1,0,2),null); // sensitivity change starts a fresh accumulation
  assert.equal(mouse.sample(0.25,0,2),null);
  assert.deepEqual(mouse.sample(0.3,0,2),{type:"mouse_relative",payload:{dx:1,dy:0}});
  assert.equal(mouse.sample(0.75,0),null); // another sensitivity change
  assert.equal(mouse.sample(Number.NaN,0),null); // invalid input clears rather than retaining a stale fraction
  assert.deepEqual(mouse.sample(1.25,0),{type:"mouse_relative",payload:{dx:1,dy:0}});
  assert.deepEqual(mouse.sample(10000,0),{type:"mouse_relative",payload:{dx:1024,dy:0}});
  assert.equal(mouse.sample(Infinity,0),null);
  assert.deepEqual(mouse.sample(1,0),{type:"mouse_relative",payload:{dx:1,dy:0}});
});

test("only repeated keydown events are suppressed while game pointer lock is active",()=>{
  assert.equal(shouldForwardRemoteKey("key_down",false,true),true);
  assert.equal(shouldForwardRemoteKey("key_down",true,true),false);
  assert.equal(shouldForwardRemoteKey("key_up",true,true),true);
  assert.equal(shouldForwardRemoteKey("key_down",true,false),true);
});

