import assert from "node:assert/strict";
import test from "node:test";
import { InputEventGate } from "./inputEvents.ts";
import { relativeMouseSample } from "./gameInput.ts";

test("quality changes use the current authorization/token without injecting native input",async()=>{
  const commands:string[]=[];let authorized=true;
  const gate=new InputEventGate("session-secret",()=>authorized,120,async command=>{commands.push(command);});
  const value={type:"quality_mode",sessionToken:"session-secret",ts:Date.now(),payload:{mode:"sharp"}};
  await gate.accept(value);assert.deepEqual(commands,[]);
  await assert.rejects(gate.accept({...value,sessionToken:"other"}),/token/);
  await assert.rejects(gate.accept({...value,payload:{mode:"invalid"}}),/quality/);
  authorized=false;await assert.rejects(gate.accept(value),/authorized/);
});
test("quality requests stay bounded and rate limited",async()=>{
  const gate=new InputEventGate("session-secret",()=>true,1,async()=>{});
  const value={type:"quality_mode",sessionToken:"session-secret",ts:Date.now(),payload:{mode:"economy"}};
  await gate.accept(value);await assert.rejects(gate.accept(value),/rate_limited/);
  await assert.rejects(gate.accept({...value,ts:0}),/timestamp/);
});

test("relative mouse controls remain schema-bounded and authorization-gated",async()=>{
  const commands:string[]=[];
  const gate=new InputEventGate("session-secret",()=>true,120,async command=>{commands.push(command);});
  const motion=relativeMouseSample(15,-3)!;
  await gate.accept({...motion,sessionToken:"session-secret",ts:Date.now(),sequence:1});
  assert.deepEqual(commands,["send_input_event"]);
  await assert.rejects(gate.accept({type:"mouse_relative",sessionToken:"session-secret",ts:Date.now(),sequence:2,payload:{dx:1025,dy:0}}),/invalid_mouse_delta/);
  await assert.rejects(gate.accept({type:"mouse_relative",sessionToken:"wrong",ts:Date.now(),sequence:3,payload:{dx:1,dy:1}}),/token/);
  await gate.accept({type:"mouse_down",sessionToken:"session-secret",ts:Date.now(),sequence:2,payload:{button:0,relative:true}});
  assert.deepEqual(commands,["send_input_event","send_input_event"]);
  await assert.rejects(gate.accept({type:"mouse_down",sessionToken:"session-secret",ts:Date.now(),sequence:3,payload:{relative:true}}),/invalid_mouse_button/);
});
