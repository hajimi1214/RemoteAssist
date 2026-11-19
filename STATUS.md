# Status

## Current Milestone

- M6: Security modernization, dependency refresh, and VelaMost-inspired desktop UI update.

## Completed

- Backend assist-request resolution now requires an authenticated owner and permits one pending-state transition.
- Refresh tokens are atomically consumed during rotation; concurrent reuse can issue at most one replacement.
- IP limiting trusts forwarded addresses only through configured trusted proxy CIDRs and bounds limiter memory.
- CORS and WebSocket origins use an exact allowlist. Persistent TURN credentials were replaced with authenticated, short-lived REST credentials.
- Production database deployments fail startup validation when signing secrets are weak or missing; TURN secrets are also validated.
- Tauri now uses a restrictive CSP, native Windows consent before input authorization, and Windows Credential Manager for optional remembered sign-in.
- Frontend now has guarded HTTPS/WSS configuration, automatic refresh of expired access tokens, bounded/validated DataChannel input, ICE candidate queuing, and working ping/pong latency.
- Vite 8, React 19.3, TypeScript 7, and Tauri 2.12 dependencies are in place. npm audit reports zero vulnerabilities.
- Desktop UI refreshed using the supplied VelaMost design reference: light blue canvas, white navigation and cards, navy/blue visual hierarchy, responsive layouts, and clearer session consent states.
- Sessions and Settings now have honest status/metadata views rather than pretending to show unavailable session history.
- Deployment validation refuses template values and suppresses resolved secrets from Compose output. CI and Renovate configuration were added.

## Validation

- `scripts/test.ps1`: PASS (frontend build, Go tests/build, Rust check).
- `npm audit --audit-level=high`: PASS, 0 vulnerabilities.
- `cargo fmt -- --check`: PASS.
- `scripts/package-windows.ps1 -SignalingUrl https://remoteassist.example.com`: PASS; portable EXE and `RemoteAssist_0.3.0-alpha_x64-setup.exe` built.
- `GET /healthz` on the local signaling service: PASS.
- Docker Compose template syntax check: PASS.
- Deployment validation rejects `.env.example` placeholders: PASS.
- Browser preview of the sign-in UI: PASS.
- Go module upgrades beyond the locked versions: NOT VERIFIED; checksum-database access timed out, so the update was not forced.

## Still Not Verified

- Install and operate the package on a second Windows 10/11 machine.
- Two-machine LAN assistance and public-server P2P/TURN fallback.
- Public DNS, firewall/security group, and production certificate deployment.
- Real TURN connectivity with external network paths; TURN-over-TLS is intentionally not advertised/configured until certificates are wired.
- Multi-monitor and DPI coordinate mapping, extended IME/scan-code keyboard behavior, and long-session resource use.

## Next Milestone

- M7: Second-machine acceptance, external TURN verification, and persistent multi-instance session state.
