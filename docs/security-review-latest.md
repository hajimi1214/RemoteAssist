# Security Review Latest

## Scope Reviewed

- Go signaling service in `server`.
- Authentication, device management, refresh token, and migration code.
- Tauri/React desktop client in `src` and `src-tauri`.
- Deployment files in `deploy`.
- Scripts and documentation.

## Gate Results

- Hidden windows, hidden tray icons, or process disguise: PASS. Tauri main window is configured visible; no tray or process disguise code was found.
- Silent installation: PASS. Installer is user-launched and no silent install behavior is implemented.
- Default autostart: PASS. No startup registry, scheduled task, service install, or autostart code was found.
- Unattended access: PASS. Account login does not grant control; host must click `Start Sharing`, choose a screen/window, and click `Allow Control`.
- Unauthorized input injection: PASS. Host-side input requires authorization state and session token validation before `SendInput`.
- Remote CMD, PowerShell, Shell, scripts, or arbitrary command execution: PASS. No product feature exposes command execution. PowerShell occurrences are development/deployment scripts and documentation.
- Hardcoded passwords, tokens, certificates, TURN keys, or other secrets: PASS. Deployment values are environment variables and `.env.example` placeholders.
- Password storage: PASS. Passwords are hashed with Argon2id.
- Refresh token storage: PASS. Refresh tokens are stored as HMAC-SHA256 hashes, not complete tokens.
- WebSocket message-size limits: PASS. Server uses `SetReadLimit` and `MaxBytesReader`; client input messages are capped.
- Expired or disconnected sessions still accepting input: PASS. Session store transitions expired/disconnected states and desktop clears authorization on disconnect.
- Logs exposing sensitive data: PASS. Structured server logs include session id and role, not passwords, full tokens, screen content, keyboard content, or TURN secrets.
- Fabricated, stale, or unverifiable test results: PASS. Results are recorded as `PASS`, `FAIL`, or `NOT VERIFIED`.

## Evidence

- `server/internal/httpapi/server.go`: auth/device routes, WebSocket limits, JSON validation, rate limiting, token validation, and token-free logs.
- `server/internal/httpapi/auth_devices_test.go`: authentication, device, and assist request endpoint coverage.
- `server/internal/identity`: Argon2id password hashing, short-lived access tokens, refresh token hashing/revocation, and device ownership checks.
- `server/internal/session/session.go`: 8-digit code generation, 5-minute TTL support, state machine, token checks, expiration, and disconnect handling.
- `server/migrations/001_init.sql`: PostgreSQL tables for users, devices, refresh token hashes, remote sessions, and audit logs.
- `src/App.tsx`: login, registration, device list, explicit host sharing, authorization prompt, disconnect controls, and WebRTC flow.
- `src/inputEvents.ts`: input type, session token, message size, timestamp, payload, and frequency checks.
- `src-tauri/src/lib.rs`: Rust-side authorization gate and Windows `SendInput` adapter.
- `deploy/.env.example`: PostgreSQL, JWT, refresh token, TURN, and deployment values are placeholders and environment-driven.

## Required Fixes

- None for the reviewed automated security gates.
- None for database migration verification.

## Test Results

- `scripts/test.ps1`: PASS
- `scripts/verify-deploy-config.ps1`: PASS
- `scripts/package-windows.ps1`: PASS
- Portable Windows EXE startup check: PASS
- `npm run tauri:build` NSIS installer bundle: PASS
- Temporary PostgreSQL Docker migration test: PASS
- Dual-machine Windows LAN test: NOT VERIFIED
- Install on second Windows PC: NOT VERIFIED
- Public server deployment and TURN fallback test: NOT VERIFIED
