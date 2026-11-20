# Status

## Current milestone

M11 follow-up — 0.8.0-alpha visual polish and form/feedback interaction refinement. Reviewed 2026-11-20.

## Completed

- Unified guest/signed-in workspace illustrations, navigation icons, card surfaces, action affordances, empty-state styling and quieter scrollbars. The shared illustration uses HTML/CSS and existing icons; no image asset or dependency was added.
- Login now focuses the first field, retains password focus when the eye is clicked, and restores appropriate focus when switching modes. Dialog teardown does not trigger validation. Feedback preview/edit switches focus to the relevant text area.
- Device search announces result counts and offers a clear-search action; refresh/save/request operations have distinct progress wording. Floating-label spacing now scales with text size. Details: docs/ui-polish-0.8.md.
- Opens into a guest workspace. Protected actions open a closable login dialog, and successful login returns to the chosen workflow without starting capture or control. Pending login cancellation, credential restoration races and account-switch UI cleanup are handled.
- Replaced native system decorations with a custom draggable window bar and working minimize/maximize/restore/close controls. The frame keeps window controls outside content scrolling; restored windows respect the OS work area.
- Adapted every main page and modal for desktop, narrow and larger-text layouts. Device lists scroll inside their card; dialog close controls remain outside their scrolling body. Added a local feedback report with an explicit preview/copy workflow and honest unsent status.
- Server-enforced login is now required to create or join an assistance session; old clients must be upgraded. Invalid requests do not mutate sessions, and host approval is still required.
- Improved bounded mouse delivery through short backpressure and gradual quality adaptation from measured sender queue delay. No automatic reconnect/control resumption added. Details and official sources: docs/guest-workspace-0.8.md and docs/transport-refinement.md.
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

- UI follow-up: 48 frontend tests, production build and diff checks PASS. Browser guest/signed-in desktop height checks, all five pages at 320px with dark/larger text, login focus/blur, password visibility focus, search/clear/refresh and feedback focus checks PASS. Fresh browser console has no errors. Actual maximized native workspace displays the new design and all window controls.
- scripts/test.ps1: PASS — 48 frontend tests/build, Go tests/service build, Rust check and 5 native tests. Go vet: PASS.
- 0.8 browser checks: guest navigation, dismissible authentication, preserved login destination, local feedback generation/copy and 320px dark/larger-text checks across all five main pages PASS. Actual native maximize/minimize/restore/close controls PASS; application reopened with the development launcher.
- Live service create/join without login returns 401. Server and desktop launcher modes ran successfully; no background helper was added.
- Browser: PASS for floating-label retention, help visibility, blur-only field errors, password eye/strength, two-step registration navigation, code advance/backspace/paste, first-invalid-code focus, native zoom radio keyboard selection and administrator status. The 320px dark/larger-text layout has no horizontal overflow. No browser console errors observed.
- Native window: PASS for visible launch and maximized guest workspace on this Windows desktop. Software and the local loopback service were left running. This does not validate multi-display capture or input calibration.
- PowerShell development launcher: syntax and command structure PASS; Server/Desktop modes ran successfully. Browser-only mode was not separately launched.
- npm audit: PASS, zero reported vulnerabilities. Diff whitespace checks: PASS.
- Browser: PASS for actual local invalid-attempt summaries, opt-in persistence, logout/login retention, active-session logout completion, filtering and clear-confirmation cancellation.
- Browser: PASS for radio keyboard navigation, 320px no-overflow checks, light desktop and dark larger-text layout.
- Real browser WebRTC loopback: PASS. Actual stats populate the bounded trends and accessible labels.
- Previous Windows portable EXE/NSIS 0.7.0-alpha: PASS, built with example HTTPS endpoint. A 0.8 installer has not been packaged; the opened software is the local development build.

## Remaining limits

- Actual Windows capture/input/consent, cross-DPI and secondary-display calibration, public TURN, second-machine installation and hardware codec paths remain unverified.
- The administrator is a local preview account. The seed recreates it with a new user ID after a memory-server restart; ordinary accounts, devices and login sessions are not durable. Live PostgreSQL role-migration execution and production administrator provisioning remain unverified/unimplemented respectively.
- Local summaries are convenience metadata, not a server audit log or cross-device history. Opted-in metadata can be inspected by users with profile access.
- Source-reviewed account isolation and storage-error behavior are not a complete browser fault-injection/privacy audit.
- Active sessions remain one-process; cloud/PostgreSQL/live container validation and degraded-network benchmarks remain pending.
- Example-domain installer must be rebuilt with the actual HTTPS signaling URL; both endpoints should use the current client version.
- Model concurrency remains limited to 2 including the main agent.

## Next milestone

M12 — real cloud/two-machine acceptance, controlled network benchmarks, calibrated native display capture, durable server audit metadata and hardware media prototype.
