# Security review — connection and input boundaries

Reviewed 2026-11-25 against the local engineering branch. The product has two session-creation paths: owner-authenticated **My Devices** direct sessions and authenticated, single-use eight-digit **Remote Assist** code sessions. This source review does not constitute a penetration test.

## PASS — reviewed and tested

- **My Devices** requires the controller and target device to belong to the same live account. The native host receives an owner-validated acceptance from the service.
- **Remote Assist** requires authenticated code creation and join. The host itself generates and presents the one-time code, so revealing it consents to this session. The join consumes the pending code capability.
- The shared native capture path validates the approval response, session ID, active state, bounded expiry and host-device ID for direct sessions. Each input event remains token-, lease-, timestamp-, structure- and rate-validated.
- After a session is active, an authorized controller's WebSocket ping is acknowledged locally. Regression tests verify timestamp correlation, token omission, and that the host does not receive the controller's probe.
- The host stays visible. Disconnect, logout, device revocation, peer heartbeat loss and expiry release pressed inputs and stop capture.
- release-all is a sequence barrier: older lossy pointer messages are rejected after local control release. Reliable button releases remain accepted.
- Zero reported bandwidth triggers adaptation; missing/invalid estimates remain distinct.
- Local summary serialization uses a field whitelist, local random IDs, bounded retention and validated dates. It excludes codes/tokens/addresses/device names/screenshots/video/input contents.
- Local persistence is opt-in per account. Default records remain in memory for the current login. Late termination callbacks can write only to their original account's opted-in store.
- Corrupt local records/storage failures cannot prevent control revocation. Save versus delete failures show different retry messages.
- Diagnostic trends retain only bounded aggregate samples; missing data is not fabricated and static low bitrate/fps does not imply a broken connection.
- No hidden operation, shell/command execution, autostart, silent installation or screen/keyboard recording was added.
- Actual local browser lifecycle tests and unit regressions passed; historical unverified deployment claims were not promoted to PASS.

The eight-digit code API is intentionally active for **Remote Assist**. It is not used by **My Devices**. Both paths still use short-lived host/controller capabilities, server session state and the host's native lease.

## Configured-service CSP and TLS decision — 2026-11-28

RemoteAssist supports user-operated signaling servers, so desktop and Android Tauri `connect-src` directives allow the HTTPS and WSS schemes instead of pinning one publisher-owned origin. The remaining CSP policies keep documents self-only, disable objects and framing, and restrict scripts to the bundled source. Scheme-wide HTTPS/WSS sources are not an exact host allowlist. A script already running in the app context could attempt a connection to another HTTPS/WSS host, subject to browser CORS and server authorization.

The user-configured transport path is constrained elsewhere:

- The shared service-address dialog normalizes input to an HTTPS root origin, without credentials, paths, queries or fragments. Explicit LAN test builds may use private IPv4 HTTP. The underlying `SignalingClient` independently rejects insecure non-LAN schemes, credentials, paths, queries and fragments before issuing requests.
- API requests omit browser cookies and attach bearer credentials only to the selected service URL. WebSocket URLs preserve the configured host and port while upgrading HTTPS to WSS.
- The Go server validates browser CORS and WebSocket origins against exact `APP_ORIGINS` entries. Deployment validation rejects wildcard origins. Native WebSocket connections may omit `Origin`, but still pass normal session-token and lease checks.
- Normal Android builds use the HTTPS WebView scheme and set cleartext traffic to false. The Android LAN test build trusts a generated test CA for the selected address. The Windows desktop LAN test build separately permits private-LAN HTTP at one compiled IPv4 origin.
- HTTPS certificate validation uses the platform's normal trust store. The LAN Android test CA is limited to its package's selected host and does not replace system trust.

Regression coverage is in `connectionSecurityConfig.test.ts`, `signaling.test.ts`, `mobileInput.test.ts`, `lanTest.test.ts`, Go `TestCORSAllowsExactConfiguredOriginAndRejectsOthers`, Go `TestWebSocketCheckOriginUsesExactAllowlist`, and the deployment verifier. This decision supports user-managed endpoints while retaining secure transport, app-document isolation, and server-side origin validation.

## Dependency advisory follow-up

- Go `govulncheck ./...` on Go 1.26.11 reported no reachable vulnerabilities after upgrading the vulnerable Go toolchain and dependencies. The local Go Race suite also passed.
- RustSec audit reports zero vulnerabilities after upgrading `url`, `cookie`, and `rustix`. It continues to report informational advisories for transitive `chrono`/`proc-macro-error` maintenance status and GTK `glib` soundness. The GTK package is outside the Windows target graph, and the Windows-target audit reports zero vulnerabilities.

## Dependency advisory refresh — 2026-11-28

- `npm audit --audit-level=high` scanned all 88 lockfile packages and reported zero vulnerabilities.
- `go run golang.org/x/vuln/cmd/govulncheck@v1.10.0 ./...` with Go 1.26.11 reported `No vulnerabilities found` across the server packages.
- Rust `cargo-audit` 0.23.0 scanned `src-tauri/Cargo.lock` and 447 resolved crate dependencies against 1,571 RustSec advisories. It reported zero vulnerabilities. The lockfile contains three separate findings: unmaintained `chrono` 0.4.45 (RUSTSEC-2026-0543), unmaintained `proc-macro-error` 1.0.4 (RUSTSEC-2024-0370), and `glib` 0.18.5 unsoundness (RUSTSEC-2024-0429). The `src-tauri` Windows/MSVC dependency graph does not include `glib` or GTK, as confirmed by `cargo tree --locked --target x86_64-pc-windows-msvc --invert glib` and its `gtk` counterpart. These are maintenance/platform findings, not reported vulnerability advisories.
- The RustSec advisory database was refreshed to commit `c5279d0b0c9e8b70df666eb6d1edbabcfd1176bd`. The audit binary was built under ignored `.local` with no project manifest or lockfile change.

## Limits

The interactive same-account and code flows remain unverified on two physical Windows PCs. Public TURN behavior, revocation during live cross-account assistance, production/Compose PostgreSQL migration, and hardware codec selection remain unverified. Per-account local browser storage is not OS-level isolation from other users of the same profile. No full penetration test, privacy audit, accessibility certification, cloud deployment or hardware codec capability validation is claimed.
