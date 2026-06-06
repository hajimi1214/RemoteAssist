# Plans

## Current Scope

- Productize the Windows 10/11 remote assistance MVP.
- Add account authentication, device binding, device list, and deployment database support.
- Keep host-visible, explicitly authorized operation mandatory.

## Milestones

- M0: Repository governance, Skills, and baseline status files. PASS
- M1: Requirements, architecture, threat model, and documentation. PASS
- M2: Go signaling service with session state, REST, WebSocket, limits, cleanup, and tests. PASS
- M3: Tauri/React desktop MVP with visible sharing, host approval, WebRTC, DataChannel, and Windows input adapter. PASS
- M4: Deployment package, scripts, security review, and readiness checks. PASS
- M5: Authentication, device management, PostgreSQL migrations, modern desktop UI, and Windows installer. PASS

## Remaining Manual Verification

- Dual-machine Windows LAN sharing and control: NOT VERIFIED
- Install on a second Windows 10/11 PC: NOT VERIFIED
- Public server DNS, TLS, firewall/security-group, P2P, and TURN fallback: NOT VERIFIED
- Live PostgreSQL migration with Docker: PASS
