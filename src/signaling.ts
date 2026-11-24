import { configuredServer, androidClient } from "./platform.ts";
import { allowsLanHttp } from "./lanTest.ts";
export type SessionState =
  | "CREATED"
  | "WAITING_FOR_CONTROLLER"
  | "WAITING_FOR_HOST_APPROVAL"
  | "AUTHORIZED_ACTIVE"
  | "DISCONNECTED"
  | "EXPIRED"
  | "REJECTED";

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: "user" | "admin";
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export class SignalingHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "SignalingHttpError";
  }
}

export interface Device {
  id: string;
  userId: string;
  deviceName: string;
  deviceFingerprint: string;
  osName: string;
  appVersion: string;
  note: string;
  lastSeenAt: string;
  online: boolean;
  current: boolean;
}

export interface DirectSession {
  id: string;
  controllerToken: string;
  state: SessionState;
  expiresAt: string;
  hostDeviceId: string;
  controllerDeviceId: string;
}
export interface DirectPending {id:string;hostToken:string;expiresAt:string;controllerDeviceName:string;hostDeviceId:string;controllerDeviceId:string}
export interface CodeHostSession {id:string;code:string;hostToken:string;expiresAt:string}
export interface CodeControlSession {id:string;controllerToken:string;expiresAt:string}

type ClientBuildEnv = { DEV?: boolean; PROD?: boolean; VITE_SIGNALING_URL?: string };
const clientBuildEnv = (import.meta as ImportMeta & { env?: ClientBuildEnv }).env ?? {};
const defaultBaseURL = configuredServer() || clientBuildEnv.VITE_SIGNALING_URL || (clientBuildEnv.DEV && !androidClient ? "http://localhost:8080" : "");

export class SignalingClient {
  private refreshFlight?: { token: string; result: Promise<AuthResult> };
  private readonly baseURL: string;
  constructor(baseURL = defaultBaseURL) { this.baseURL = baseURL.replace(/\/$/, ""); }
  serviceURL():string { return this.getBaseURL(); }
  async connectDevice(accessToken:string, hostDeviceId:string, controllerDeviceId:string):Promise<DirectSession> {
    return this.request(`/api/v1/devices/${encodeURIComponent(hostDeviceId)}/connect`,{method:"POST",body:JSON.stringify({controllerDeviceId})},accessToken);
  }
  async incomingDevices(accessToken:string,hostDeviceId:string):Promise<DirectPending[]> {
    const response=await this.request<{sessions:DirectPending[]}>(`/api/v1/devices/${encodeURIComponent(hostDeviceId)}/direct-sessions`,{},accessToken);return response.sessions??[];
  }
  async createCodeSession(accessToken:string):Promise<CodeHostSession> {
    return this.request("/api/v1/share-sessions",{method:"POST",body:JSON.stringify({})},accessToken);
  }
  async joinCodeSession(accessToken:string,code:string):Promise<CodeControlSession> {
    return this.request("/api/v1/control-sessions/join",{method:"POST",body:JSON.stringify({code})},accessToken);
  }

  async register(username: string, email: string, password: string, signal?: AbortSignal): Promise<AuthResult> {
    return this.request<AuthResult>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }), signal
    });
  }

  async login(login: string, password: string, signal?: AbortSignal): Promise<AuthResult> {
    return this.request<AuthResult>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password }), signal
    });
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    if (this.refreshFlight?.token === refreshToken) return this.refreshFlight.result;
    const result = this.request<AuthResult>("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    }).finally(() => {
      if (this.refreshFlight?.token === refreshToken) this.refreshFlight = undefined;
    });
    this.refreshFlight = { token: refreshToken, result };
    return result;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.request("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    });
  }

  async me(accessToken: string): Promise<User> {
    const body = await this.request<{ user: User }>("/api/v1/auth/me", {}, accessToken);
    return body.user;
  }

  async adminStatus(accessToken: string): Promise<{status:string;identityStorage:string;requiresHostConsent:boolean}> {
    return this.request("/api/v1/admin/status",{},accessToken);
  }

  async registerDevice(accessToken: string, device: Pick<Device, "deviceName" | "deviceFingerprint" | "osName" | "appVersion">): Promise<Device> {
    const body = await this.request<{ device: Device }>("/api/v1/devices/register", {
      method: "POST",
      body: JSON.stringify(device)
    }, accessToken);
    return body.device;
  }

  async devices(accessToken: string, currentDeviceId: string): Promise<Device[]> {
    const body = await this.request<{ devices: Device[] }>(`/api/v1/devices?currentDeviceId=${encodeURIComponent(currentDeviceId)}`, {}, accessToken);
    return body.devices ?? [];
  }

  async updateDevice(accessToken: string, id: string, note: string): Promise<Device> {
    const body = await this.request<{ device: Device }>(`/api/v1/devices/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ note })
    }, accessToken);
    return body.device;
  }

  async revokeDevice(accessToken: string, id: string): Promise<void> {
    await this.request(`/api/v1/devices/${encodeURIComponent(id)}`, { method: "DELETE" }, accessToken);
  }

  async heartbeat(accessToken: string, id: string): Promise<Device> {
    const body = await this.request<{ device: Device }>(`/api/v1/devices/${encodeURIComponent(id)}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({})
    }, accessToken);
    return body.device;
  }

  async iceServers(accessToken: string): Promise<IceServer[]> {
    const body = await this.request<{ iceServers: IceServer[] }>("/api/v1/ice-config", {}, accessToken);
    return body.iceServers;
  }

  async disconnect(id: string, token: string): Promise<void> {
    await this.request(`/api/v1/share-sessions/${encodeURIComponent(id)}/disconnect`, {
      method: "POST",
      body: JSON.stringify({ token })
    });
  }

  wsURL(sessionId: string, role: "host" | "controller"): string {
    const url = new URL(this.getBaseURL());
    const lanHttp = allowsLanHttp(url);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    if (clientBuildEnv.PROD && url.protocol !== "wss:" && !lanHttp) {
      throw new Error("production_signaling_requires_tls");
    }
    url.pathname = "/api/v1/ws";
    url.searchParams.set("sessionId", sessionId);
    url.searchParams.set("role", role);
    return url.toString();
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}, accessToken = ""): Promise<T> {
    const response = await fetch(`${this.getBaseURL()}${path}`, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      cache: "no-store",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers
      }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new SignalingHttpError(response.status, `Request failed: ${response.status} ${error}`);
    }
    return (await response.json()) as T;
  }

  private getBaseURL(): string {
    if (!this.baseURL) throw new Error("signaling_service_not_configured");
    let url: URL;
    try {
      url = new URL(this.baseURL);
    } catch {
      throw new Error("invalid_signaling_service_url");
    }
    if (!(url.protocol === "https:" || (clientBuildEnv.DEV && url.protocol === "http:") || allowsLanHttp(url))) {
      throw new Error("signaling_service_requires_tls");
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("invalid_signaling_service_url");
    }
    return url.toString().replace(/\/$/, "");
  }
}
