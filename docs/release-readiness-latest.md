# Release readiness — 0.6.0-alpha

Reviewed 2026-11-20.

## PASS

- Frontend timing/quality/telemetry and existing UX/input policies: 24 tests.
- TypeScript/Vite production build.
- Real browser media loopback and fresh ICE loading at negotiation.
- Real browser missing-answer and missing-heartbeat watchdogs.
- Live diagnostics panel displays measured stats and distinguishes unsupported fields.

## Final build verification

PASS — scripts/test.ps1: 24 frontend tests/build, Go tests/service build, Rust check and 5 native tests. npm audit reports zero vulnerabilities.

PASS — portable Windows EXE and RemoteAssist_0.6.0-alpha_x64-setup.exe built successfully (approximately 1.90 MiB). Packaging used the example HTTPS endpoint; rebuild with the actual server domain for operation.

## NOT VERIFIED

Two-machine LAN/public TURN, actual native capture/input/consent, hardware codec paths, controlled degraded-network measurements, physical display/DPI mapping, live cloud/PostgreSQL, unsigned installer on a second machine and remote CI.

## Compatibility

Upgrade both clients together to 0.6 for correlated heartbeat probes. The server keeps the 0.4+ first-frame signaling protocol. One signaling replica only. Build with the actual service HTTPS domain; example-domain installers validate build tooling only.
