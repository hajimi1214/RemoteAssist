# Desktop and form follow-up — 2026-11-20

## User-visible result

The native window starts maximized. Desktop login uses the available CSS viewport height, including OS display scaling. Registration separates account details and password setup into two steps, preserving entered values when going back. Normal desktop views keep their navigation and footer visible; the overview groups its main actions, three status cards, recent devices and recent activity on one screen. Long lists scroll within cards. Narrow windows, large text, errors and unusually short windows can still scroll so controls remain reachable.

The VelaMost-inspired blue/white layout remains. Existing form fields now have floating labels that stay visible after entry, permanent help text and errors shown after blur or submission. Password visibility works for login and registration; strength feedback is informational and belongs to password creation. Device notes are marked optional. Three theme and three zoom choices use keyboard-operable native radios.

Temporary connection codes still contain eight digits. The new eight-box control supports typing, Backspace/Delete, directional navigation and a complete paste from any box, including fullwidth digits and spaces. Interior deletions preserve the positions of other digits. Invalid submission focuses the first box and never starts a network connection. Preventing pointer-down focus changes on submit avoids a blur-error insertion moving the submit button before its click completes.

The requested upload, date, price, location, school and tag examples have no corresponding business fields in RemoteAssist. This change does not add unrelated mock forms or claim SMS autofill support.

## Local administrator

User records now carry a constrained user/admin role. Registration always creates a user, rejects an injected role property and retains its existing password minimum. The protected GET /api/v1/admin/status endpoint rechecks the live stored role and disabled flag; the frontend shows its result in settings. This is a read-only service check, not a user-management console or Windows administrator elevation. All remote assistance still requires the host's explicit consent.

The operator seed tool reads a password from stdin and writes only an Argon2id hash. The ignored .local/admin-seed.json is accepted only with a literal loopback listening address and in-memory identity storage. A conflicting existing username/email is never silently promoted or reset. The operator-local fixture can accept the user's requested short password without weakening public registration.

Server mode in scripts/dev.ps1 automatically loads that existing seed. A restart recreates the seeded administrator with a new ID; other memory-backed accounts, device registrations and refresh sessions are lost. Per-account saved summaries may not follow the new ID. The README documents separate foreground server and desktop terminals. Production administrator provisioning is not implemented; the seed intentionally refuses a public bind or PostgreSQL configuration.

Both migration directories contain the same 002_user_roles.sql. Existing database accounts default to user. A live PostgreSQL migration was not available for this validation.

## Validation

PASS:

- scripts/test.ps1: 39 frontend tests, frontend build, Go tests/build, Rust check and 5 native tests.
- Final npm test and npm run build after the interaction refinements.
- Go vet, diff whitespace checks and PowerShell launcher static parsing/foreground-command inspection.
- Login and the longer password-setup step: document height equals the viewport; form panel scrollHeight equals clientHeight at 1280×720, 1280×700 and 1100×660. The account-details step and forward/back navigation were checked at 1100×660.
- Compact dashboard: document and workspace have no vertical overflow at the same three sizes. Large data lists have their own bounded scrolling.
- Floating label remains raised after filling and blur; help remains visible. Invalid username/password errors appear after blur, not while first typing. Password reveal/hide and weak-password feedback work.
- Eight-box code input advances focus; Backspace retreats; a fullwidth/spaced paste populates all eight positions; invalid submission focuses the first input.
- Zoom radios respond to arrow keys. Dark theme and larger text at 320px do not cause horizontal overflow.
- Local administrator login succeeds; settings shows administrator, memory storage and a passed server role check. HTTP tests cover anonymous 401, ordinary-user 403 and administrator 200.
- No browser console errors observed during the checks.
- Actual native app visibly displays the complete maximized login card with no page scrollbar. The app and the existing local service were left running.

NOT VERIFIED:

- Live PostgreSQL migration, production administrator setup or cloud deployment.
- Running all three newly edited launcher modes end-to-end; existing direct development processes remained active.
- Public TURN, two-machine capture/control, other DPI combinations and secondary displays. Earlier real-browser WebRTC loopback evidence does not establish those results.

No new dependency was added. Screenshots and local validation logs are in ignored .local/ui-check and .local/*.log. The final native capture contained a transient unrelated OS notification and was discarded; the retained captures show only this project.
