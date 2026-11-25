import assert from "node:assert/strict";
import test from "node:test";
import { InputEventGate, MAX_PENDING_NATIVE_EVENTS } from "./inputEvents.ts";
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

test("native input delivery is serialized and queued events recheck live authorization",async()=>{
  const calls:Array<Record<string,unknown>>=[];
  let authorized=true;
  let finishFirst:(()=>void)|undefined;
  const firstDelivery=new Promise<void>(resolve=>{finishFirst=resolve;});
  let signalFirstStarted:(()=>void)|undefined;
  const firstStarted=new Promise<void>(resolve=>{signalFirstStarted=resolve;});
  const gate=new InputEventGate("session-secret",()=>authorized,120,async(command,args)=>{
    calls.push({command,...(args??{})});
    if(calls.length===1){signalFirstStarted?.();await firstDelivery;}
  });
  const event=(type:"key_down"|"key_up",key:string)=>({type,sessionToken:"session-secret",ts:Date.now(),payload:{key,code:key==="a"?"KeyA":"KeyB"}});
  const first=gate.accept(event("key_down","a"));
  const second=gate.accept(event("key_down","b"));
  await firstStarted;
  assert.equal(calls.length,1);
  authorized=false;
  finishFirst?.();
  await first;
  await assert.rejects(second,/input_not_authorized/);
  assert.equal(calls.length,1);
});

test("native IPC backlog fails closed and releases all held inputs instead of dropping an up edge",async()=>{
  const calls:Array<{command:string;args?:Record<string,unknown>}> = [];
  let authorized=true;
  let finishFirst:(()=>void)|undefined;
  const firstDelivery=new Promise<void>(resolve=>{finishFirst=resolve;});
  let signalFirstStarted:(()=>void)|undefined;
  const firstStarted=new Promise<void>(resolve=>{signalFirstStarted=resolve;});
  const gate=new InputEventGate("session-secret",()=>authorized,1000,async(command,args)=>{
    calls.push({command,args});
    if(command==="clear_input_authorization")authorized=false;
    if(calls.length===1){signalFirstStarted?.();await firstDelivery;}
  });
  const down={type:"key_down",sessionToken:"session-secret",ts:Date.now(),payload:{key:"a",code:"KeyA"}};
  const up={type:"key_up",sessionToken:"session-secret",ts:Date.now(),payload:{key:"a",code:"KeyA"}};
  const first=gate.accept(down);
  await firstStarted;
  const queued=Array.from({length:MAX_PENDING_NATIVE_EVENTS-1},()=>gate.accept(down).catch(error=>error));
  await assert.rejects(gate.accept(up),/input_delivery_backlogged/);
  assert.equal(calls.filter(call=>call.command==="clear_input_authorization").length,1);
  finishFirst?.();
  await Promise.all([first,...queued]);
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
