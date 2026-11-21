type RuntimeImportMeta = ImportMeta & { env?: { VITE_LAN_TEST?: string } };

export const lanTestBuild = (import.meta as RuntimeImportMeta).env?.VITE_LAN_TEST === "true";

export function isPrivateLanHost(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

export function allowsLanHttp(url: URL): boolean {
  return lanTestBuild && url.protocol === "http:" && isPrivateLanHost(url.hostname);
}

export function canUseLanHttp(url: URL, enabled: boolean): boolean {
  return enabled && url.protocol === "http:" && isPrivateLanHost(url.hostname);
}
