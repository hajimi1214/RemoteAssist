# Architecture

```mermaid
flowchart LR
  Host["Host Windows Client"] -->|Auth, Device, Session REST| Signaling["Go API + Signaling Service"]
  Controller["Controller Windows Client"] -->|Auth, Device, Session REST| Signaling
  Signaling --> DB["PostgreSQL"]
  Host <-->|WS SDP/ICE only| Signaling
  Controller <-->|WS SDP/ICE only| Signaling
  Host <-->|WebRTC video + input DataChannel| Controller
  Controller -. fallback .-> TURN["coturn TURN Relay"]
  Host -. fallback .-> TURN
  Caddy["Caddy TLS Reverse Proxy"] --> Signaling
```

RemoteAssist has three parts:

- A Tauri v2 desktop client with React UI and Rust commands.
- A Go API and signaling service for authentication, devices, temporary session state, ICE config, and SDP/ICE WebSocket forwarding.
- A deployment package with Caddy TLS reverse proxy and coturn relay.

The 0.5 client separates session orchestration (`App.tsx`), account/device pages (`pages.tsx`), reusable interaction/viewer components (`ui.tsx`), and testable formatting/layout policy (`ux.ts`). Layout uses CSS tokens, intrinsic grids, container queries and logical properties. The remote viewer measures its container and received video separately with ResizeObserver/video resize events; changing layout releases locally captured input. Display scaling is visual and does not change the remote display mode or grant control.

The API stores account, device, refresh-token hash, session metadata, and audit records. It must not store screen pixels, screenshots, video, keyboard content, plaintext passwords, full tokens, or TURN secrets. Video travels through WebRTC. Remote input travels through a WebRTC DataChannel only after host approval and is revalidated on the host before `SendInput`.
