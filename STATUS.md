# Status

## Current Milestone

- M5: Productized Windows client with authentication, device management, PostgreSQL deployment, and installer packaging.

## Progress

- Project-level rules: PASS
- Repository Skills: PASS
- Go signaling service REST/session/WebSocket implementation: PASS
- Registration, login, logout, refresh token service: PASS
- Argon2id password hashing: PASS
- Device registration, list, note, heartbeat, revoke service: PASS
- Device-to-device assist request service and host notification UI: PASS
- PostgreSQL migration files and migration command: PASS
- Tauri/React desktop client with login, registration, dashboard, devices, and remote assist pages: PASS
- Windows `SendInput` adapter and host-side input authorization gate: PASS
- Docker Compose deployment package with signaling, postgres, coturn, and caddy: PASS
- Security review latest document: PASS
- Release readiness latest document: PASS

## Test Results

- `npm run build`: PASS
- `scripts/test.ps1`: PASS
- `scripts/package-windows.ps1`: PASS
- `npm run tauri:build`: PASS
- Portable release EXE startup check: PASS
- Go service `/healthz` runtime check: PASS
- `scripts/verify-deploy-config.ps1`: PASS
- Go authentication/device/migration unit tests: PASS
- Device assist request API test: PASS
- Temporary PostgreSQL Docker migration test: PASS
- Windows dual-machine LAN test: NOT VERIFIED
- Install on second Windows PC: NOT VERIFIED
- Public server deployment and TURN fallback test: NOT VERIFIED

## Known Limits

- Portable Windows EXE is produced at `src-tauri\target\release\remoteassist.exe`.
- Windows installer is produced at `src-tauri\target\release\bundle\nsis\RemoteAssist_0.2.0_x64-setup.exe`.
- Installing the NSIS package on another Windows 10/11 PC requires manual validation.
- Dual-machine Windows LAN operation requires manual validation.
- Public DNS, TLS, firewall/security-group, and TURN relay validation require real infrastructure.
- Keyboard mapping covers common keys and single-character keys; extended IME and scan-code behavior need more manual hardening.
- Multi-monitor and DPI coordinate mapping need manual validation.
