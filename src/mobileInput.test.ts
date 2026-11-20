import assert from "node:assert/strict";
import test from "node:test";
import { TouchController, filledVideoLayout, normalizeServerAddress, validRemoteText } from "./mobileInput.ts";
const p=(id=1,x=20,y=20,at=0)=>({id,x:x/100,y:y/100,clientX:x,clientY:y,at});
test("touch taps click only on release, movement does not accidentally click",()=>{
  const t=new TouchController(); assert.equal(t.down(p(),false)[0].type,"mouse_move");
  assert.deepEqual(t.up(p(1,20,20,100)).map(a=>a.type),["mouse_down","mouse_up"]);
  t.down(p(),false);t.move(p(1,40,40,30));assert.deepEqual(t.up(p(1,40,40,100)),[]);
});
test("drag releases, cancellation and second fingers never synthesize a tap",()=>{
  const t=new TouchController();assert.equal(t.down(p(),true)[0].type,"mouse_down");
  assert.equal(t.up(p(1,30,30,100))[0].type,"mouse_up");
  t.down(p(),true);assert.equal(t.down(p(2),false)[0].type,"release_all");
  assert.equal(t.move(p(2,20,60,60))[0].type,"mouse_wheel");
  assert.deepEqual(t.up(p(1,20,20,100)),[]);assert.deepEqual(t.up(p(2,20,60,100)),[]);
  t.down(p(),true);assert.equal(t.cancel()[0].type,"release_all");assert.deepEqual(t.up(p()),[]);
});
test("two-finger scroll cannot turn the remaining finger into a click",()=>{
  const t=new TouchController();t.down(p(1,20,20),false);t.down(p(2,40,20),false);
  assert.equal(t.move(p(2,40,50))[0].type,"mouse_wheel");assert.deepEqual(t.up(p(1,20,20,80)),[]);
  assert.deepEqual(t.move(p(2,40,70)),[]);assert.deepEqual(t.up(p(2,40,70,140)),[]);
  t.down(p(1,20,20,200),false);t.down(p(2,40,20,200),false);assert.equal(t.move(p(2,40,50,230))[0].type,"mouse_wheel");
});
test("long press and distant up without move do not activate desktop",()=>{
  const t=new TouchController();t.down(p(),false);assert.deepEqual(t.up(p(1,20,20,1000)),[]);
  t.down(p(),false);assert.deepEqual(t.up(p(1,80,80,100)),[]);
});
test("finger jitter stays a tap but interrupted pointer capture cannot replay it",()=>{
  const t=new TouchController();t.down(p(),false);assert.ok(t.hasPointer(1));t.move(p(1,29,28,100));
  assert.deepEqual(t.up(p(1,29,28,200)).map(action=>action.type),["mouse_down","mouse_up"]);assert.equal(t.hasPointer(1),false);
  t.down(p(),true);t.cancel();assert.deepEqual(t.up(p(1,20,20,200)),[]);
});
test("filled video layout preserves source ratio while covering the viewport",()=>{
  const layout=filledVideoLayout({width:1200,height:800},{width:1920,height:1080});
  assert.equal(layout.height,800);assert.ok(layout.width>=1200);assert.equal(layout.width/layout.height,1920/1080);
  assert.deepEqual(filledVideoLayout({width:0,height:800},{width:1920,height:1080}),{width:0,height:0,scale:1});
});
test("Unicode text accepts bounded composed input and rejects malformed/control data",()=>{
  assert.ok(validRemoteText("中文 🙂\nhello\tworld"));assert.ok(validRemoteText("a".repeat(128)));
  for(const s of ["","a".repeat(129),"\u0000","\u001b","\ud800","\udc00"])assert.equal(validRemoteText(s),false);
});
test("Android service address cannot embed secrets, paths or insecure transport",()=>{
  assert.equal(normalizeServerAddress(" https://assist.example.com/ "),"https://assist.example.com");
  for(const s of ["http://example.com","https://user:pass@example.com","https://example.com/a","https://example.com/?token=a","https://example.com/#a"])assert.throws(()=>normalizeServerAddress(s));
});
