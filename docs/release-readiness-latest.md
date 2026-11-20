# Release readiness — 0.7.0-alpha

Reviewed 2026-11-20.

## PASS

- 34 frontend tests, production build, Go tests/service build, Rust check and 5 native tests.
- npm audit zero vulnerabilities; whitespace checks.
- Real browser local-service login/session-summary flows with synthetic data.
- Opt-in local summary persistence, waiting-session completion during logout, restore after login, filters and confirmation cancellation.
- Radio-card keyboard operation, narrow layout, dark/larger-text layout.
- Real browser WebRTC video/input loopback and measured diagnostic trends.

## Packaging

PASS — Windows portable EXE and RemoteAssist_0.7.0-alpha_x64-setup.exe built successfully (approximately 1.90 MiB). The package uses an example HTTPS endpoint for build validation only; rebuild with the actual server domain before operational installation.

## NOT VERIFIED

Two-machine LAN/public TURN, actual Windows capture/native input/DPI, hardware codecs, second-machine installation, full accessibility/privacy audit, live cloud/PostgreSQL/container and remote CI execution.

Local summaries are not an authoritative server audit log. No screen/input recording or secrets are saved in them. Multiple signaling replicas remain unsupported.
