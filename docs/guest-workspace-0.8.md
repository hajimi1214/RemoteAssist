# 0.8 — guest workspace, window adaptation and connection refinements

Reviewed 2026-11-20. No new dependencies.

## Open first, sign in when needed

The application now opens into a usable guest workspace. Navigation, appearance settings and feedback are available before login. Device data and session history are shown only after authentication. Sharing and connecting open a dismissible login dialog; successful login returns to the selected workflow but never begins capture or grants control automatically. Closing with × or Escape restores focus to the triggering control. Registration keeps the two-step flow and the existing floating labels, permanent help, validation and password feedback.

Dismissing the dialog synchronously invalidates its pending request and aborts fetch. A late response cannot establish a login; returned credentials are discarded/revoked when applicable. Credential restoration is generation-checked and credential writes/deletions are serialized. Expired login clears device lists and pending requests so another account cannot see the previous account's UI state.

The server now also requires a valid enabled account for POST /api/v1/share-sessions and POST /api/v1/control-sessions/join. Rejected attempts do not consume session capacity or a temporary code. Host/controller session capabilities and host approval remain necessary. This changes the entry API contract: upgrade the service and clients together. Old clients without Authorization on these endpoints will receive 401.

## Window and responsive layout

Tauri's system title bar is replaced by a slim custom bar with native dragging, minimize, maximize/restore and close. Only the required window permissions were added. Tauri handles double-click maximize on the drag region; a second JavaScript toggle is intentionally omitted. The app starts maximized, uses a 700px restored height and enables preventOverflow to keep restored windows in the OS work area. Native close still revokes remote input. The in-app close control goes through the active-session confirmation; Alt+F4 closes immediately and safely.

The frame uses a fixed viewport budget. The title bar, navigation and footer remain outside the scrolling content. Compact desktop layouts cover the guest and signed-in workspaces, devices, both assistance modes, session summaries and settings. Long device lists have their own scroll area. Shared-screen tools retain their existing fullscreen behavior. Narrow windows and larger text use accessible content scrolling rather than cropping or scaling the entire UI.

Dialogs use an independently scrolling body, with their close button outside that scroll area. A positioned frame and positioned zoom fieldset prevent visually hidden accessibility labels from creating an extra document scrollbar.

The guest workspace introduces teal and mint accents; login becomes a compact centered card over the current workspace. The previous full-page login billboard is removed.

## Feedback and transport

The feedback dialog accepts one of four categories and a bounded description, then previews a copyable report. The report includes only the visible description, category, version, page and connection-status label. It is not sent to a server or retained after dismissal. Copy success and failure are explicitly reported. Login, logout, validation and existing connection progress remain visible status feedback.

See [transport-refinement.md](transport-refinement.md) for the consulted MDN/W3C sources and implementation details. The changes preserve the newest mouse position through brief DataChannel backpressure with a 150ms expiry, and use measured sender queue delay to prevent premature quality increases and gradually reduce load. They do not strengthen a physical wireless signal, automatically reconnect, restore control, or guarantee zero dropped frames.

## Verification

PASS:

- Full scripts/test.ps1: 48 frontend regressions, frontend build, Go tests/service build, Rust check and 5 native tests. Go vet and whitespace checks also pass.
- HTTP tests reject anonymous, invalid, expired and disabled accounts before session mutation. An authenticated join still waits for host approval.
- Live restarted local service returns 401 for unauthenticated create and join requests.
- Browser guest navigation, close/Escape with focus restoration, two-step registration navigation, administrator login returning to the chosen control page, no automatic capture, and feedback generation/copy.
- All five main pages at 320×640 with dark theme and larger text: document dimensions stay within the viewport; no horizontal overflow. Each content area can scroll to the remaining controls.
- Desktop checks at 1280×686 and 1100×626 CSS pixels (reserving 34px for the native bar) cover the guest and signed-in views. Workspaces, devices and the connection form fit; more content/error messages/large text use the content area rather than scrolling the window controls away.
- Login and password-step dialog fit the tested desktop heights. At 320×480 the dialog body scrolls while the close button stays visible and clickable.
- Actual Windows window: maximize leaves all three controls visible; minimize works; restore retains the controls; close exits the process. The desktop launcher was then used to reopen the application. The Server launcher was also run successfully with the existing ignored local administrator seed.
- No browser console errors were observed during this validation.

NOT VERIFIED:

- Two-machine weak-network performance, input-to-photon latency, hardware encoding and other monitor/DPI combinations. The deterministic queue tests are not performance benchmarks.
- Cloud deployment, a live PostgreSQL migration, and a newly packaged 0.8 installer. The currently running desktop is the local development build.

The model concurrency stayed at two or fewer, including the primary agent.
