import assert from "node:assert/strict";
import test from "node:test";
import { createSessionRecorder, sanitizeSummaries, sessionDuration, sessionOutcome } from "./sessionJournal.ts";
import type { SessionSummary } from "./sessionJournal.ts";

test("session summary is emitted once even if close callbacks race",()=>{
  let clock=1000;const results:SessionSummary[]=[];
  const recorder=createSessionRecorder("control",s=>results.push(s),()=>clock,()=>"local-test-session-1");
  clock=2000;recorder.connected();recorder.route("P2P");clock=7000;recorder.finish("Stopped by controller");recorder.finish("Disconnected");
  assert.equal(results.length,1);assert.equal(results[0].outcome,"completed");assert.equal(sessionDuration(results[0]),"0 分 5 秒");
});
test("unconnected attempts and failed connected sessions remain distinct",()=>{
  const results:SessionSummary[]=[];const first=createSessionRecorder("share",s=>results.push(s),()=>1000,()=>"local-attempt-001");first.finish("Closed");
  const second=createSessionRecorder("control",s=>results.push(s),()=>1000,()=>"local-attempt-002");second.connected();second.finish("Connection lost");
  assert.equal(results[0].outcome,"cancelled");assert.equal(results[1].outcome,"interrupted");
  assert.equal(sessionOutcome("Disconnected",true),"interrupted");assert.equal(sessionOutcome("Session expired",true),"expired");
});
test("clock rollback does not produce an invalid connection timestamp",()=>{
  let clock=2000;const out:SessionSummary[]=[];const r=createSessionRecorder("control",s=>out.push(s),()=>clock,()=>"local-clock-test");
  clock=1000;r.connected();clock=3000;r.finish("Closed");assert.equal(sanitizeSummaries(out,3000).length,1);
});
test("saved records are bounded, time limited, deduplicated, and strip unknown fields",()=>{
  const now=40*86400_000;
  const base={role:"share",startedAt:now-1000,connectedAt:null,endedAt:now,outcome:"cancelled",route:"Unknown"};
  const records=Array.from({length:60},(_,i)=>({...base,id:`local-session-${i}`,token:"must-not-persist",code:"12345678",ip:"private"}));
  const clean=sanitizeSummaries([...records,records[0],{...base,id:"local-too-old",endedAt:0,startedAt:0}],now);
  assert.equal(clean.length,50);assert.equal(JSON.stringify(clean).includes("must-not-persist"),false);assert.equal(Object.hasOwn(clean[0],"code"),false);
  assert.deepEqual(sanitizeSummaries([{...base,id:"server-token"},{...base,id:"local-time-invalid",endedAt:now-2000}],now),[]);
  assert.deepEqual(sanitizeSummaries([{...base,id:"local-bad-date",startedAt:-1e20}],now),[]);
});
