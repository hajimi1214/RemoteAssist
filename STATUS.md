# Status

## Current milestone

M10 follow-up — desktop height adaptation, accessible forms and local administrator preview. Reviewed 2026-11-20.

## Completed

- Desktop launch now maximizes the native window. Login and both registration steps fit 1280×720, 1280×700 and 1100×660 CSS viewports without page or form-panel scrolling. The compact desktop dashboard also fits these viewports; longer device/activity lists scroll inside their cards. Narrow screens and larger text retain accessible scrolling.
- Added reusable floating labels, persistent help, blur/submit validation, first-error focus, password visibility and registration strength feedback. Registration uses two steps to keep controls visible. Device search/notes use the same fields; themes and three zoom choices use native radio groups.
- The existing eight-digit connection protocol now has eight separate boxes with auto-advance, backward deletion, arrows and fullwidth/spaced paste. A six-digit SMS service is not part of this project.
- Added server-enforced user/admin roles, a protected read-only admin status endpoint, and a local password-hash seed tool. The requested local administrator was created and verified through API and browser login. Seed loading is restricted to loopback plus in-memory storage; public registration remains user-only with its existing minimum password policy. No credential is committed.
- The development script now runs Server, Desktop or Browser explicitly in the foreground; the existing ignored local seed is loaded by Server mode. See docs/forms-and-desktop-fit.md for validation and limitations.
- Refined the VelaMost-inspired light blue/white dashboard, navy typography, device illustration, workflow tiles and quality selection cards. Dark/larger-text/narrow layouts remain.
- Replaced the session placeholder with real local summaries: direction, start/connection/end times, outcome and route. Failed/cancelled attempts remain distinct from established sessions.
- Summaries default to current-login memory. User-enabled per-account persistence keeps at most 50 records from the latest 30 days; no server IDs/codes/tokens/addresses/device names/frames/input content are saved.
- Summary validation rejects invalid dates, duplicates and unknown fields; termination is idempotent. Logout cleanup writes only the original account's opted-in store. Storage errors cannot block control shutdown.
- Diagnostic status hints distinguish loss, buffering, processing pressure and high RTT. RTT/bitrate trend samples are bounded and preserve missing-data gaps.
- Zero available bandwidth now correctly triggers gradual adaptation. release-all advances the pointer sequence barrier so older unordered movement is rejected after input is released.
- No extra package, hidden behavior or automatic control resumption added.
- Details: docs/workspace-refinement-0.7.md and docs/validation-0.7.md.

## Verification

- scripts/test.ps1: PASS — 39 frontend tests/build, Go tests/service build, Rust check and 5 native tests. Go vet: PASS. Final frontend regression/build after interaction corrections: PASS.
- Browser: PASS for floating-label retention, help visibility, blur-only field errors, password eye/strength, two-step registration navigation, code advance/backspace/paste, first-invalid-code focus, native zoom radio keyboard selection and administrator status. The 320px dark/larger-text layout has no horizontal overflow. No browser console errors observed.
- Native window: PASS for visible launch and maximized login layout on this Windows desktop. Software and the local loopback service were left running. This does not validate multi-display capture or input calibration.
- PowerShell development launcher: syntax and command structure PASS; the new launcher modes have not been started end-to-end because the preview processes were already running.
- npm audit: PASS, zero reported vulnerabilities. Diff whitespace checks: PASS.
- Browser: PASS for actual local invalid-attempt summaries, opt-in persistence, logout/login retention, active-session logout completion, filtering and clear-confirmation cancellation.
- Browser: PASS for radio keyboard navigation, 320px no-overflow checks, light desktop and dark larger-text layout.
- Real browser WebRTC loopback: PASS. Actual stats populate the bounded trends and accessible labels.
- Windows portable EXE/NSIS 0.7.0-alpha: PASS, built with example HTTPS endpoint. Rebuild with actual domain before operational deployment.

## Remaining limits

- Actual Windows capture/input/consent, cross-DPI and secondary-display calibration, public TURN, second-machine installation and hardware codec paths remain unverified.
- The administrator is a local preview account. The seed recreates it with a new user ID after a memory-server restart; ordinary accounts, devices and login sessions are not durable. Live PostgreSQL role-migration execution and production administrator provisioning remain unverified/unimplemented respectively.
- Local summaries are convenience metadata, not a server audit log or cross-device history. Opted-in metadata can be inspected by users with profile access.
- Source-reviewed account isolation and storage-error behavior are not a complete browser fault-injection/privacy audit.
- Active sessions remain one-process; cloud/PostgreSQL/live container validation and degraded-network benchmarks remain pending.
- Example-domain installer must be rebuilt with the actual HTTPS signaling URL; both endpoints should use the current client version.
- Model concurrency remains limited to 2 including the main agent.

## Next milestone

M11 — real cloud/two-machine acceptance, controlled network benchmarks, calibrated native display capture, durable server audit metadata and hardware media prototype.
