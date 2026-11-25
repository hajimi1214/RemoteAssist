import assert from "node:assert/strict";
import test from "node:test";
import { activateDeviceFromList, canDirectControl } from "./deviceActivation.ts";
import type { Device } from "./signaling.ts";

function device(overrides: Partial<Device> = {}): Device {
  return {
    id: "target-device",
    userId: "same-account",
    deviceName: "Remote PC",
    deviceFingerprint: "target-fingerprint",
    osName: "Windows",
    appVersion: "0.15.1-alpha",
    note: "",
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    online: true,
    current: false,
    ...overrides,
  };
}

test("activating an online supported Windows device starts direct control in one action", () => {
  const target = device();
  const controller = device({ id: "controller-device", current: true });
  const calls: string[] = [];

  const action = activateDeviceFromList(target, controller, selected => calls.push(`connect:${selected.id}`), selected => calls.push(`inspect:${selected.id}`));

  assert.equal(action, "connected");
  assert.deepEqual(calls, ["connect:target-device"]);
});

test("offline, current, unsupported, and non-Windows devices do not start control", () => {
  const controller = device({ id: "controller-device", current: true });
  const unavailable = [
    device({ online: false }),
    device({ current: true }),
    device({ appVersion: "0.9.9" }),
    device({ osName: "Android" }),
  ];

  for (const target of unavailable) assert.equal(canDirectControl(target, controller), false);
  assert.equal(canDirectControl(device(), null), false);
});
