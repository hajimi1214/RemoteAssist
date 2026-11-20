export type SessionState =
  | "CREATED"
  | "WAITING_FOR_CONTROLLER"
  | "WAITING_FOR_HOST_APPROVAL"
  | "AUTHORIZED_ACTIVE"
  | "DISCONNECTED"
  | "EXPIRED"
  | "REJECTED";

export interface ShareSession {
  id: string;
  code: string;
  hostToken: string;
  state: SessionState;
  expiresAt: string;
}

export interface JoinSession {
  id: string;
  controllerToken: string;
  state: SessionState;
  expiresAt: string;
}

export interface ApproveSession {
  id: string;
  state: SessionState;
  controllerToken: string;
  expiresAt: string;
}

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
  constructor(readonly status: number, message: string) {
    super(message);
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

export interface AssistRequest {
  id: string;
  hostDeviceId: string;
  controllerDeviceId: string;
  controllerDeviceName: string;
  status: string;
  createdAt: string;
}

const defaultBaseURL = import.meta.env.VITE_SIGNALING_URL ?? (import.meta.env.DEV ? "http://localhost:8080" : "");

export class SignalingClient {
  private refreshFlight?: { token: string; result: Promise<AuthResult> };
  constructor(private readonly baseURL = defaultBaseURL.replace(/\/$/, "")) {}

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

  async requestAssist(accessToken: string, hostDeviceId: string, controllerDeviceId: string): Promise<AssistRequest> {
    const body = await this.request<{ request: AssistRequest }>(`/api/v1/devices/${encodeURIComponent(hostDeviceId)}/assist`, {
      method: "POST",
      body: JSON.stringify({ controllerDeviceId })
    }, accessToken);
    return body.request;
  }

  async assistRequests(accessToken: string, deviceId: string): Promise<AssistRequest[]> {
    const body = await this.request<{ requests: AssistRequest[] }>(`/api/v1/devices/${encodeURIComponent(deviceId)}/assist-requests`, {}, accessToken);
    return body.requests ?? [];
  }

  async resolveAssistRequest(accessToken: string, id: string, status: "ACCEPTED" | "REJECTED"): Promise<AssistRequest> {
    const body = await this.request<{ request: AssistRequest }>(`/api/v1/assist-requests/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ status })
    }, accessToken);
    return body.request;
  }

  async iceServers(accessToken: string): Promise<IceServer[]> {
    const body = await this.request<{ iceServers: IceServer[] }>("/api/v1/ice-config", {}, accessToken);
    return body.iceServers;
  }

  async createShareSession(accessToken: string): Promise<ShareSession> {
    return this.request<ShareSession>("/api/v1/share-sessions", {
      method: "POST",
      body: JSON.stringify({})
    }, accessToken);
  }

  async join(code: string, accessToken: string): Promise<JoinSession> {
    return this.request<JoinSession>("/api/v1/control-sessions/join", {
      method: "POST",
      body: JSON.stringify({ code })
    }, accessToken);
  }

  async approve(id: string, hostToken: string): Promise<ApproveSession> {
    return this.request<ApproveSession>(`/api/v1/share-sessions/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      body: JSON.stringify({ token: hostToken })
    });
  }

  async reject(id: string, hostToken: string): Promise<void> {
    await this.request(`/api/v1/share-sessions/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify({ token: hostToken })
    });
  }

  async disconnect(id: string, token: string): Promise<void> {
    await this.request(`/api/v1/share-sessions/${encodeURIComponent(id)}/disconnect`, {
      method: "POST",
      body: JSON.stringify({ token })
    });
  }

  wsURL(sessionId: string, role: "host" | "controller"): string {
    const url = new URL(this.getBaseURL());
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    if (import.meta.env.PROD && url.protocol !== "wss:") {
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
    if (!(url.protocol === "https:" || (import.meta.env.DEV && url.protocol === "http:"))) {
      throw new Error("signaling_service_requires_tls");
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("invalid_signaling_service_url");
    }
    return url.toString().replace(/\/$/, "");
  }
}
