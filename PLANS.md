# Plans

## Current Scope

- Deliver a Windows 10/11 to Windows 10/11 remote assistance MVP.
- Keep host-visible, explicitly authorized operation mandatory.
- Prepare local development, test, portable Windows build, and public-server deployment artifacts.

## Milestones

- M0: Repository governance, Skills, and baseline status files. PASS
- M1: Requirements, architecture, threat model, and documentation. PASS
- M2: Go signaling service with session state, REST, WebSocket, limits, cleanup, and tests. PASS
- M3: Tauri/React desktop MVP with visible sharing, host approval, WebRTC, DataChannel, and Windows input adapter. PASS
- M4: Deployment package, scripts, security review, and readiness checks. PASS

## Remaining Manual Verification

- Dual-machine Windows LAN sharing and control: NOT VERIFIED
- Public server DNS, TLS, firewall/security-group, P2P, and TURN fallback: NOT VERIFIED
- NSIS installer bundle: FAIL in this environment due Tauri NSIS download timeout; portable release EXE build: PASS
