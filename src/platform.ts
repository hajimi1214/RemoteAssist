import { isTauri } from "@tauri-apps/api/core";

export const androidClient = import.meta.env.VITE_MOBILE_WEB === "true" || /Android/i.test(navigator.userAgent);
export const nativeDesktop = isTauri() && import.meta.env.VITE_MOBILE_WEB !== "true" && !androidClient && !/iPhone|iPad/i.test(navigator.userAgent);
export const controllerOnly = !nativeDesktop;
export const secureCredentialStorage = nativeDesktop && /Windows/i.test(navigator.userAgent);
export function configuredServer(): string {
  try { return localStorage.getItem("remoteassist.serverURL") ?? ""; } catch { return ""; }
}
