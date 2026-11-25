import type { Device } from "./signaling.ts";

export type DeviceActivationTarget = Pick<Device, "id" | "current" | "online" | "osName" | "appVersion">;

export function supportsDirectControlClient(target: Pick<Device, "appVersion">): boolean {
  const [major, minor] = target.appVersion.split(".").map(Number);
  return major > 0 || (major === 0 && minor >= 10);
}

export function canDirectControl(target: DeviceActivationTarget, currentDevice: Device | null): boolean {
  return !!currentDevice && !target.current && target.online && target.osName === "Windows" && supportsDirectControlClient(target);
}

export function activateDeviceFromList(
  target: Device,
  currentDevice: Device | null,
  connect: (device: Device) => void,
  inspect: (device: Device) => void,
): "connected" | "selected" {
  if (canDirectControl(target, currentDevice)) {
    connect(target);
    return "connected";
  }
  inspect(target);
  return "selected";
}
