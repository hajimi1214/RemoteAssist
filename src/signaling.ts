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
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

const defaultBaseURL = import.meta.env.VITE_SIGNALING_URL ?? "http://localhost:8080";

export class SignalingClient {
  constructor(private readonly baseURL = defaultBaseURL.replace(/\/$/, "")) {}

  async iceServers(): Promise<IceServer[]> {
    const body = await this.request<{ iceServers: IceServer[] }>("/api/v1/ice-config");
    return body.iceServers;
  }

  async createShareSession(): Promise<ShareSession> {
    return this.request<ShareSession>("/api/v1/share-sessions", {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  async join(code: string): Promise<JoinSession> {
    return this.request<JoinSession>("/api/v1/control-sessions/join", {
      method: "POST",
      body: JSON.stringify({ code })
    });
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

  wsURL(sessionId: string, token: string, role: "host" | "controller"): string {
    const url = new URL(this.baseURL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/api/v1/ws";
    url.searchParams.set("sessionId", sessionId);
    url.searchParams.set("token", token);
    url.searchParams.set("role", role);
    return url.toString();
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers
      }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Request failed: ${response.status} ${error}`);
    }
    return (await response.json()) as T;
  }
}
