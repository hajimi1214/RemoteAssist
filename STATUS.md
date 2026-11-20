# Status

## Current milestone

M10 — 0.7.0-alpha workspace, local summaries and diagnostic trends. Reviewed 2026-11-20.

## Completed

- Refined the VelaMost-inspired light blue/white dashboard, navy typography, device illustration, workflow tiles and quality selection cards. Dark/larger-text/narrow layouts remain.
- Replaced the session placeholder with real local summaries: direction, start/connection/end times, outcome and route. Failed/cancelled attempts remain distinct from established sessions.
- Summaries default to current-login memory. User-enabled per-account persistence keeps at most 50 records from the latest 30 days; no server IDs/codes/tokens/addresses/device names/frames/input content are saved.
- Summary validation rejects invalid dates, duplicates and unknown fields; termination is idempotent. Logout cleanup writes only the original account's opted-in store. Storage errors cannot block control shutdown.
- Diagnostic status hints distinguish loss, buffering, processing pressure and high RTT. RTT/bitrate trend samples are bounded and preserve missing-data gaps.
- Zero available bandwidth now correctly triggers gradual adaptation. release-all advances the pointer sequence barrier so older unordered movement is rejected after input is released.
- No extra package, hidden behavior or automatic control resumption added.
- Details: docs/workspace-refinement-0.7.md and docs/validation-0.7.md.

## Verification

- scripts/test.ps1: PASS — 34 frontend tests/build, Go tests/service build, Rust check and 5 native tests.
- npm audit: PASS, zero reported vulnerabilities. Diff whitespace checks: PASS.
- Browser: PASS for actual local invalid-attempt summaries, opt-in persistence, logout/login retention, active-session logout completion, filtering and clear-confirmation cancellation.
- Browser: PASS for radio keyboard navigation, 320px no-overflow checks, light desktop and dark larger-text layout.
- Real browser WebRTC loopback: PASS. Actual stats populate the bounded trends and accessible labels.
- Windows portable EXE/NSIS 0.7.0-alpha: PASS, built with example HTTPS endpoint. Rebuild with actual domain before operational deployment.

## Remaining limits

- Actual Windows capture/input/consent, native DPI and secondary displays, public TURN, second-machine installation and hardware codec paths remain unverified.
- Local summaries are convenience metadata, not a server audit log or cross-device history. Opted-in metadata can be inspected by users with profile access.
- Source-reviewed account isolation and storage-error behavior are not a complete browser fault-injection/privacy audit.
- Active sessions remain one-process; cloud/PostgreSQL/live container validation and degraded-network benchmarks remain pending.
- Example-domain installer must be rebuilt with the actual HTTPS signaling URL; both endpoints should use the current client version.
- Model concurrency remains limited to 2 including the main agent.

## Next milestone

M11 — real cloud/two-machine acceptance, controlled network benchmarks, calibrated native display capture, durable server audit metadata and hardware media prototype.
