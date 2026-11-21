import test from "node:test";
import assert from "node:assert/strict";
import { canUseLanHttp, isPrivateLanHost } from "./lanTest.ts";

test("LAN test HTTP is limited to private IPv4 and an explicit test build", () => {
  for (const host of ["10.0.0.1", "172.16.0.1", "172.31.255.254", "192.168.0.100"]) assert.equal(isPrivateLanHost(host), true);
  for (const host of ["127.0.0.1", "172.32.0.1", "192.169.0.1", "example.com", "192.168.0.999"]) assert.equal(isPrivateLanHost(host), false);
  assert.equal(canUseLanHttp(new URL("http://192.168.0.100:8080"), true), true);
  assert.equal(canUseLanHttp(new URL("https://192.168.0.100:8080"), true), false);
  assert.equal(canUseLanHttp(new URL("http://8.8.8.8:8080"), true), false);
  assert.equal(canUseLanHttp(new URL("http://192.168.0.100:8080"), false), false);
});
