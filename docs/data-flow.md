# Data Flow

```mermaid
sequenceDiagram
  participant H as Host
  participant S as Signaling
  participant C as Controller
  H->>H: Start Sharing and choose screen/window
  H->>S: POST /api/v1/share-sessions
  S-->>H: 8-digit code, host token, 5-minute expiry
  C->>S: POST /api/v1/control-sessions/join
  S-->>C: controller token, waiting for approval
  C->>H: WS ping through signaling
  H->>H: Show authorization prompt
  H->>S: POST /share-sessions/{id}/approve
  S-->>H: authorized state and controller token
  H->>C: WS offer
  C->>H: WS answer and ICE
  H-->>C: WebRTC video track
  C-->>H: DataChannel input events
  H->>H: Validate token, state, payload, timestamp, rate
  H->>H: SendInput only while authorized
```

Disconnect, timeout, capture end, application close, or network loss clears host authorization and stops capture.
