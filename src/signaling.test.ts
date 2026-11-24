import assert from "node:assert/strict";
import test from "node:test";
import { SignalingClient } from "./signaling.ts";

test("one-time assistance creates a host code and joins it with the entered code", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const payload = url.endsWith("/api/v1/share-sessions")
      ? { id: "session-1", code: "12345678", hostToken: "host-capability-token", expiresAt: "2026-11-24T12:00:00Z" }
      : { id: "session-1", controllerToken: "controller-capability-token", expiresAt: "2026-11-24T12:00:00Z" };
    return new Response(JSON.stringify(payload), { status: url.endsWith("/api/v1/share-sessions") ? 201 : 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const signaling = new SignalingClient("https://assist.example.test");
    const host = await signaling.createCodeSession("host-access-token");
    const controller = await signaling.joinCodeSession("controller-access-token", host.code);
    assert.equal(host.code, "12345678");
    assert.equal(controller.controllerToken, "controller-capability-token");
    assert.deepEqual(calls.map(call => call.url), [
      "https://assist.example.test/api/v1/share-sessions",
      "https://assist.example.test/api/v1/control-sessions/join"
    ]);
    assert.deepEqual(calls.map(call => JSON.parse(String(call.init?.body))), [{}, { code: "12345678" }]);
    assert.deepEqual(calls.map(call => new Headers(call.init?.headers).get("Authorization")), [
      "Bearer host-access-token", "Bearer controller-access-token"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
