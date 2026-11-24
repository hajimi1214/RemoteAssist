import { isTauri } from "@tauri-apps/api/core";

type PlatformBuildEnv = { VITE_MOBILE_WEB?: string };
const platformBuildEnv = (import.meta as ImportMeta & { env?: PlatformBuildEnv }).env ?? {};
const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;

export const androidClient = platformBuildEnv.VITE_MOBILE_WEB === "true" || /Android/i.test(userAgent);
export const nativeDesktop = isTauri() && platformBuildEnv.VITE_MOBILE_WEB !== "true" && !androidClient && !/iPhone|iPad/i.test(userAgent);
export const controllerOnly = !nativeDesktop;
export const secureCredentialStorage = nativeDesktop && /Windows/i.test(userAgent);
export function configuredServer(): string {
  try { return localStorage.getItem("remoteassist.serverURL") ?? ""; } catch { return ""; }
}
