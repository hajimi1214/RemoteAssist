# Plans

## Current Scope

- Productize the Windows 10/11 remote assistance MVP.
- Add account authentication, device binding, device list, and deployment database support.
- Keep host-visible, explicitly authorized operation mandatory.
- Refresh the security boundary, runtime dependencies, deployment defaults, and desktop UI for the 0.3 alpha.

## Milestones

- M0: Repository governance, Skills, and baseline status files. PASS
- M1: Requirements, architecture, threat model, and documentation. PASS
- M2: Go signaling service with session state, REST, WebSocket, limits, cleanup, and tests. PASS
- M3: Tauri/React desktop MVP with visible sharing, host approval, WebRTC, DataChannel, and Windows input adapter. PASS
- M4: Deployment package, scripts, security review, and readiness checks. PASS
- M5: Authentication, device management, PostgreSQL migrations, modern desktop UI, and Windows installer. PASS
- M6: Security modernization, dependency refresh, deployment hardening, and VelaMost-inspired responsive UI. PASS
- M7: 0.4 adaptive encoding, separate pointer/control channels, native input cleanup, bounded session lifecycle, safe migrations, and deployment checks. PASS (local verification; see STATUS.md).
- M8: 0.5 responsive Chinese UI, themes, accessibility/keyboard improvements, remote-view sizing, and clearer connection/device workflows. PASS (local browser verification; see STATUS.md).
- M9: 0.6 communication/quality refinement: diagnostics, quality preferences, gradual transitions, heartbeat/negotiation watchdogs and latest-pointer coalescing. PASS (local validation; see STATUS.md).
- M10: Actual cloud/two-machine acceptance, weak-network benchmarks, native display calibration, durable audit metadata and measured native-media prototyping. NOT VERIFIED

## Remaining Manual Verification

- Dual-machine Windows LAN sharing and control: NOT VERIFIED
- Install on a second Windows 10/11 PC: NOT VERIFIED
- Public server DNS, TLS, firewall/security-group, P2P, and TURN fallback: NOT VERIFIED
- New 0.4 runner against live PostgreSQL: NOT VERIFIED (transactional test-driver regressions PASS)
- Real browser WebRTC loopback: PASS (generated video and simulated native sink)
