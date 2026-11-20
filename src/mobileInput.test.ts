import assert from "node:assert/strict";
import test from "node:test";
import { TouchController, normalizeServerAddress, validRemoteText } from "./mobileInput.ts";
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
  const t=new TouchController();t.down(p(),false);assert.deepEqual(t.up(p(1,20,20,800)),[]);
  t.down(p(),false);assert.deepEqual(t.up(p(1,80,80,100)),[]);
});
test("Unicode text accepts bounded composed input and rejects malformed/control data",()=>{
  assert.ok(validRemoteText("中文 🙂\nhello\tworld"));assert.ok(validRemoteText("a".repeat(128)));
  for(const s of ["","a".repeat(129),"\u0000","\u001b","\ud800","\udc00"])assert.equal(validRemoteText(s),false);
});
test("Android service address cannot embed secrets, paths or insecure transport",()=>{
  assert.equal(normalizeServerAddress(" https://assist.example.com/ "),"https://assist.example.com");
  for(const s of ["http://example.com","https://user:pass@example.com","https://example.com/a","https://example.com/?token=a","https://example.com/#a"])assert.throws(()=>normalizeServerAddress(s));
});
