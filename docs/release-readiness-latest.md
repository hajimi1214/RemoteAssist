# Release readiness — 0.4.0-alpha

Date: 2026-11-20. Supersedes historical 0.2/0.3 validation claims.

## PASS

- Frontend policy/coordinate/order tests (10), TypeScript check and Vite production build.
- Go tests and service build, including actual local WebSocket authentication/approval/closure tests; go vet.
- Rust check and 5 native authorization/input-state tests.
- Real browser WebRTC loopback: generated video, RTT, encoder parameters, separate pointer/input channels, input rejection, releases, shutdown.
- npm audit: zero reported vulnerabilities.
- Compose syntax, template-value rejection, corrected PowerShell native-exit handling.

## Packaging

- PASS — 0.4 portable Windows EXE and NSIS installer built using scripts/package-windows.ps1; installer RemoteAssist_0.4.0-alpha_x64-setup.exe (approximately 1.89 MiB).
- Packaging uses https://remoteassist.example.com only to validate the build. Rebuild with the actual signaling domain before operational installation.

## NOT VERIFIED

- Installer startup on a second machine; native consent and Credential Manager runtime in this version.
- Windows capture/input, primary-screen identification, DPI/layouts/IME, two-machine LAN, restrictive NAT and public TURN.
- Live PostgreSQL migration/backup/restore and container hardening under Docker; no daemon is running locally.
- Local Go race detector (CGO/compiler unavailable), GitHub CI execution.
- Performance benchmarks; no quantitative improvement is claimed.

## Compatibility

Upgrade server and both clients together. Version 0.4 requires first-frame WebSocket authentication and sequenced pointer messages. Use one signaling instance. Sessions end on restart, expiry, or control-heartbeat loss; renewed sessions require consent.
