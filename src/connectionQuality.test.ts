import assert from "node:assert/strict";
import test from "node:test";
import { AdaptiveVideoPolicy, connectionRoute, connectionSample } from "./connectionQuality.ts";

test("degrades after sustained congestion, recovers only after three good samples", () => {
  const policy = new AdaptiveVideoPolicy();
  assert.equal(policy.observe({ rttMs: 450 }), "Balanced");
  assert.equal(policy.observe({ rttMs: 450 }), "Economy");
  assert.equal(policy.observe({ rttMs: 30, availableOutgoingBitrate: 8_000_000 }), "Economy");
  assert.equal(policy.observe({ rttMs: 30, availableOutgoingBitrate: 8_000_000 }), "Economy");
  assert.equal(policy.observe({ rttMs: 30, availableOutgoingBitrate: 8_000_000 }), "Sharp");
});

test("ignores unavailable telemetry and resets transient congestion", () => {
  const policy = new AdaptiveVideoPolicy();
  assert.equal(policy.observe({}), "Balanced");
  assert.equal(policy.observe({ rttMs: NaN, availableOutgoingBitrate: 0 }), "Balanced");
  policy.observe({ availableOutgoingBitrate: 500_000 });
  policy.observe({ rttMs: 150, availableOutgoingBitrate: 3_000_000 });
  assert.equal(policy.observe({ availableOutgoingBitrate: 500_000 }), "Balanced");
});

test("does not upgrade on missing bandwidth or infinite estimates", () => {
  const policy = new AdaptiveVideoPolicy();
  policy.observe({ availableOutgoingBitrate: 500_000 });
  policy.observe({ availableOutgoingBitrate: 500_000 });
  for (let i = 0; i < 6; i++) assert.equal(policy.observe({ rttMs: 20, availableOutgoingBitrate: Infinity }), "Economy");
});

test("responds to CPU encoder pressure without a network estimate", () => {
  const policy = new AdaptiveVideoPolicy();
  assert.equal(policy.observe({ qualityLimitationReason: "cpu" }), "Balanced");
  assert.equal(policy.observe({ qualityLimitationReason: "cpu" }), "Economy");
  const stats = new Map([["encoder", { type:"outbound-rtp", kind:"video", qualityLimitationReason:"cpu" }]]) as unknown as RTCStatsReport;
  assert.equal(connectionSample(stats).qualityLimitationReason, "cpu");
});

test("uses selected transport pair and detects relay on the local side", () => {
  const stats = new Map([
    ["old", { id: "old", type: "candidate-pair", state: "succeeded", nominated: true }],
    ["transport", { id: "transport", type: "transport", selectedCandidatePairId: "pair" }],
    ["pair", { id: "pair", type: "candidate-pair", localCandidateId: "local", remoteCandidateId: "remote", currentRoundTripTime: .045, availableOutgoingBitrate: 2_000_000 }],
    ["local", { id: "local", type: "local-candidate", candidateType: "relay" }],
    ["remote", { id: "remote", type: "remote-candidate", candidateType: "srflx" }]
  ]) as unknown as RTCStatsReport;
  assert.equal(connectionRoute(stats), "TURN Relay");
  assert.deepEqual(connectionSample(stats), { rttMs: 45, availableOutgoingBitrate: 2_000_000 });
  assert.equal(connectionRoute(new Map() as unknown as RTCStatsReport), "Unknown");
});
