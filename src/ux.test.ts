import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConnectionCode, remainingTime, remoteLayout, friendlyError } from "./ux.ts";

test("accepts pasted spaced and full-width connection codes without extra digits", () => {
  assert.equal(normalizeConnectionCode("１２３４ ５６７８"), "12345678");
  assert.equal(normalizeConnectionCode("1234-5678\n99"), "12345678");
});
test("countdown clamps expired/invalid sessions and rounds seconds safely", () => {
  assert.equal(remainingTime(60_001, 1), "01:00");
  assert.equal(remainingTime(1, 2), "00:00");
  assert.equal(remainingTime(NaN, 0), "00:00");
});
test("fits portrait and ultrawide remote desktops without changing aspect ratio", () => {
  assert.deepEqual(remoteLayout({width:800,height:500},{width:1080,height:1920},"fit"), {width:281.25,height:500,scale:500/1920});
  assert.deepEqual(remoteLayout({width:800,height:500},{width:3840,height:1080},"fit"), {width:800,height:225,scale:800/3840});
  assert.deepEqual(remoteLayout({width:320,height:400},{width:1920,height:1080},"100"), {width:1920,height:1080,scale:1});
});
test("error text never reflects server payloads or credentials", () => {
  assert.equal(friendlyError({status:429,message:"secret-value"}), "操作有些频繁，请稍候再试。");
  assert.equal(friendlyError(new Error("private-diagnostic")), "操作未完成，请检查连接后重试。");
});
