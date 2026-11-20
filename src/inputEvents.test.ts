import assert from "node:assert/strict";
import test from "node:test";
import { InputEventGate } from "./inputEvents.ts";

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
