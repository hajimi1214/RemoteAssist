# Status

## Current milestone

M7 — 0.4.0-alpha: adaptive WebRTC quality, input safety, bounded session lifecycle, and deployment reliability. Reviewed 2026-11-20.

## Completed

- Adaptive encoding uses selected-route WebRTC statistics, CPU/bandwidth limitation signals, conservative hysteresis, and text-oriented capture hints. Missing estimates preserve the current profile.
- Absolute pointer motion uses an unordered channel with no retransmission. Buttons, keys, and releases remain reliable/ordered. Sequence checks reject stale motion; clicks carry coordinates.
- Pointer mapping excludes video black bars. Windows tracks held remote keys/buttons in memory and releases them on blur, disconnect, expiry, native window close, or heartbeat loss. Signed wheel delta handling is fixed.
- Capture is restricted to full-display sharing with explicit primary-display confirmation. Window/tab control is rejected because native capture-origin mapping is not implemented.
- Active sessions default to 30 minutes from creation; terminal tokens are cleared, records reclaimed, and session/request stores have capacity limits.
- WebSocket credentials use a five-second/2 KiB first frame, are rejected in URL parameters, and stripped before forwarding. Duplicate roles cannot replace peers; closed-channel races have regression tests.
- Reject/disconnect/expiry closes both peers. Native input has its own expiry and eight-second renewable heartbeat lease after a 30-second negotiation allowance.
- Auth refresh is deduplicated/proactive; remembered-sign-in preference is retained. HTTP requests have timeouts.
- PostgreSQL migrations acquire a transactional advisory lock, skip recorded versions, and roll back on failure.
- Signaling container privileges/filesystem/resources are restricted. Scripts fail on native-command errors. CI includes frontend tests, Linux Go race tests, Windows Rust tests, and Compose validation.
- Sources and decisions are in docs/research-and-decisions-0.4.md.

## Verification

- scripts/test.ps1: PASS — 10 TypeScript tests, frontend build, Go tests/build, Rust check and 5 native tests.
- go vet ./...: PASS.
- Real browser WebRTC loopback: PASS — generated video, RTT, encoder parameters, dual input channels, invalid/revoked input rejection, releases under rate saturation, shutdown. Native input is simulated.
- npm audit --audit-level=high: PASS, zero reported vulnerabilities.
- Compose syntax: PASS. Template rejection and PowerShell native-error handling: PASS.
- Windows portable EXE and NSIS installer: PASS, 0.4.0-alpha. Example-domain builds validate packaging only; rebuild for the actual server domain.

## Not verified / remaining limits

- Actual Windows capture/input, two-machine LAN, native consent runtime, public DNS/TLS/firewall, external TURN/P2P.
- Primary-display identity is host-confirmed; secondary displays, DPI/IME calibration, and window control remain unsupported/unverified.
- Degraded-network benchmarks; no performance improvement percentage is claimed.
- Live PostgreSQL migration/restore and hardened container runtime; Docker daemon unavailable locally.
- Local Go race detector needs CGO and a C compiler, unavailable here. Linux CI is configured but has not run remotely.
- Active sessions remain single-process and end on server restart; multiple replicas unsupported.
- Installer is unsigned and uses an example server until rebuilt with the actual domain.

## Next milestone

M8 — cloud deployment and two-machine acceptance, network benchmarks, calibrated native display capture, and persistent audit metadata. Upgrade server and both clients together; the 0.4 signaling protocol changed.
