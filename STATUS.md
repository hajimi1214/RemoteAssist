# Status

## G0 accepted; G1 in progress

- G0 accepted by the owner on 2026-11-28. The owner confirmed the bundled application icons were self-generated.
- The project license remains unselected and private vulnerability reporting is not configured. Both remain pre-public-redistribution gates.
- G1 work is on the separate branch `codex/g1-lan-self-hosting`. Initial scope is a documented, certificate-validated HTTPS signaling endpoint for trusted LAN tests, then self-host configuration/operations validation. Real two-Windows media/input, public HTTPS, and TURN acceptance remain pending.
- G1.1 adds a TLS-enabled standalone LAN signaling mode and certificate setup/runbook. Go TLS tests, Python certificate/ACL tests, 128 frontend tests, production build, `npm audit`, PowerShell syntax, and Docker Compose validation pass. A local Windows Schannel check succeeded with TLS 1.2 and the LAN CRL, rejected the wrong IP SAN and TLS 1.1, then removed the temporary CA trust and stopped the test listeners. See [G1 LAN HTTPS report](docs/g1-lan-https-progress.md).
- The optional LAN certificate helper's Python runtime and three pinned packages are recorded in the component inventory. The current inventory contains 556 components.
- A normal unsigned Windows x64 Release package was built with `https://<lan-host-ip>:8443` configured. Portable EXE SHA-256 is `A42D844CD01AE589D6DB03C1B6BBDF5AC3897F72C98463085217066BBB2D6744` and NSIS SHA-256 is `5BE60678C3D95722B408DDC5C9E817E930C2BF05A4298F8A40D203394676EAF0`.

- Dependency advisory refresh on 2026-11-28: npm audit found 0/88 vulnerable packages; govulncheck v1.10.0 on Go 1.26.11 found no reachable Go vulnerabilities; cargo-audit 0.23.0 found 0 vulnerabilities among 447 locked crates against RustSec database commit `c5279d0b0c9e8b70df666eb6d1edbabcfd1176bd`. Three unmaintained/unsound informational findings remain. `glib` and GTK are absent from the Windows/MSVC target dependency graph. Details are recorded in [`security review`](docs/security-review-latest.md).
- Current-source Windows x64 Release package: PASS from application source revision `e0416dc`. Portable EXE SHA-256 `730E9321F814740BF46C937A48BAC6BB7BE76839B1BB3BF027C9171F6A5CA368` at 10,602,496 bytes. NSIS installer SHA-256 `4A4075B647F393AC60558B2872D7D9A1817624DEF5BDD84C4AC5DCF320E7C5A9` at 2,434,732 bytes. Authenticode status is `NotSigned`. The Release binary and extracted NSIS executable contain no localhost HTTP/WS backend addresses. The embedded application executable matches all standalone PE sections except Tauri's expected `UNK` to `NSS` three-byte bundle marker. The NSIS archive contains no LICENSE/NOTICE/COPYING file. Build passed; independent installation and launch remain unverified.
- Container supply-chain reproducibility: pinned the two Dockerfile bases and three Compose services to five multi-platform OCI index digests. Docker Hub HEAD responses matched all five digests on 2026-11-28. The component inventory now reads image references directly from Dockerfile/Compose and fails if an external image is unpinned or absent from its license inventory.
- PASS on 2026-11-28. `docker compose ... config --quiet` and `config --images` show the three digest-qualified upstream services while keeping `remoteassist-signaling:local` as the locally built project image. Together with the two pinned Dockerfile bases, all five external references are digest-locked. `npm run licenses:check`, generator syntax check, and actionlint 1.7.7 also pass after the change. Docker image pull/build remains NOT VERIFIED because Docker Engine is unavailable.
- Cargo license target scope: nine MPL-2.0 or multi-license crates were matched to `Cargo.lock` checksums. Windows x64 has one MPL-2.0 normal runtime crate. All four Android package targets use four MPL-2.0 runtime crate/version paths through Wry. Other Windows MPL entries occur in host build/proc-macro paths. `r-efi` is absent from Windows and all four Android graphs. The shared [`MPL-2.0` text](docs/third-party-licenses/MPL-2.0.txt) normalizes one trailing space from the official copy; original and included hashes are recorded in the [`target dependency crosswalk`](docs/cargo-target-license-scope.csv). Runtime notice inclusion in release packages remains unverified.
- CSP/endpoint security review on 2026-11-28: recorded the HTTPS/WSS scheme design for self-hosted endpoints and its residual CSP scope. Production Release no longer contains localhost HTTP/WS backend origins. The new Tauri debug overlay explicitly allows loopback port 8080. The desktop dev script rejects external HTTP origins. PASS, Tauri Debug overlay build, frontend tests 128/128, production build, and npm audit with 0 vulnerabilities. Existing Go CORS/WebSocket tests verify exact configured app origins.
- 2026-11-28 follow-up: independently rechecked the public `main` ref at `2e4806f57ecef4bc295a6cdda2e9639a930443a8` and extended the Caddy binary crosswalk. Source audit identified the complete upstream MIT grant and notice in both non-test files for the imported `go.uber.org/zap/exp/zapslog` package. The Caddy crosswalk now maps 123/123 Go records, including `command-line-arguments` to the Apache-2.0 Caddy main source. The five SPDX `CONTAINER` roots represent aggregate images, and 169 total image SBOM records carry raw `NOASSERTION` metadata.
- Caddy main provenance: the exact v2.8.4 Linux/amd64 image history verifies the release binary SHA-512. Go BuildInfo identifies module v2.8.4 and the generated main path. Upstream `cmd/caddy/main.go` SHA-256 matches the cached module source, and its header states Apache-2.0 and the xcaddy copy workflow.
- Go toolchain image follow-up: the Go 1.26.11 root `LICENSE` matches the exact upstream tag by SHA-256. A scoped crosswalk links 10 `cmd/*` and the `go` records to BSD-3-Clause for Go-authored source. The 13 vendored notices byte-match the Go module archives at their `modules.txt` versions; individual command-binary module composition remains unresolved.
- Go 1.26.11 vendored licenses: all 13 license files are present in the checksum-verified official Linux/amd64 archive and byte-identical to exact module archives listed in `modules.txt`. Linux/amd64 `go list -deps` maps five modules to binaries in that archive; seven others have no imports from its ten packaged main binaries. Crosswalk entries record Go archive hash, module sums, upstream commits, file hashes, and binary consumers. Syft's 11 toolchain package records remain `NOASSERTION`.
- Coturn image follow-up: all 20 Debian SBOM package records were matched to exact Debian snapshot archives with verified SHA-1 hashes. Seventeen binary copyright files were hashed. The supplemental [package license review](docs/container-image-sbom/coturn-package-license-review.csv) maps five binaries to SPDX expressions and one to a public-domain declaration without an SPDX-listed identifier; 14 Debian binary records remain unresolved. A follow-up verified SHA-1/SHA-256 hashes for all six reviewed Debian binaries and SHA-256 hashes for their six associated copyright files. Five generic CPE aliases match packages and source versions in the final image package status, with four mapped to Debian SPDX expressions. Package-to-file attribution remains incomplete for Kerberos. See the [Debian package crosswalk](docs/container-image-sbom/coturn-debian-license-evidence.csv), [CPE crosswalk](docs/container-image-sbom/coturn-generic-cpe-crosswalk.csv), and [Kerberos text-match inventory](docs/container-image-sbom/coturn-krb5-license-text-inventory.csv).
- Coturn Debian notice-text sweep: ScanCode Toolkit 32.5.0 matched 12 unique copyright files from the verified Debian package archive set. The consolidated crosswalk contains 107 candidate rows and 171 qualifying matches, associated with the Debian source package and installed package versions. These are source notice leads, not binary package license conclusions. Binary `NOASSERTION` records remain unchanged. See [`Coturn copyright-text inventory`](docs/container-image-sbom/coturn-debian-license-text-inventory.csv).
- Coturn CPE verification: the final dpkg status file SHA-256 is `be71f047ef09874dec3d721bba9d5c88cace3be0bd0f66e1529c6dd4dc66a22a`, in OCI layer `sha256:e229fde44d96d5262c5044f8570ebf19fd6f5abed30061ef3f6a36aa4a09da80`. Four generic CPE aliases link to Debian package SPDX expressions. The Kerberos family retains its legacy copyright-text finding.
- Kerberos notice follow-up: ScanCode Toolkit 32.5.0 found 24 distinct rule labels across 58 total matches in the exact `krb5` Debian copyright file. The inventory contains 43 match occurrences above its documented score and span thresholds. File-to-binary mappings are absent, so the four runtime package SPDX conclusions remain `NOASSERTION`. See [`Kerberos text-match inventory`](docs/container-image-sbom/coturn-krb5-license-text-inventory.csv).
- PostgreSQL 16.16 image crosswalk: `moby/sys/user` and `tianon/gosu` are Apache-2.0, `golang.org/x/sys` is BSD-3-Clause, and the server's source COPYRIGHT matches SPDX `PostgreSQL`. The virtual `.postgresql-rundeps` APK group and OCI root are classified as aggregates. Evidence is in [`PostgreSQL crosswalk`](docs/container-image-sbom/postgres-license-evidence.csv).
- Cargo target-license review: exact locked crate archives and Windows x64/Android ABI target graphs are recorded in [`cargo-target-license-scope.csv`](docs/cargo-target-license-scope.csv). Windows and Android runtime includes MPL-2.0 `option-ext`; Android's Wry runtime also includes MPL-2.0 cssparser/selectors/dtoa-short. The canonical MPL text is included in [`docs/third-party-licenses/MPL-2.0.txt`](docs/third-party-licenses/MPL-2.0.txt). No installer or APK notice bundle has yet been inspected.
- The G0 review branch is published on `origin/codex/g0-open-source-audit`; the verified `main` ref remains unchanged. The owner accepted G0 on 2026-11-28, and work is moving to G1 on its stage branch.
- PASS on 2026-11-28: frontend tests 128/128, npm audit with 0 vulnerabilities, production build, 552-component license-inventory check, Go tests/Vet/module verification, Rust format/check/tests (25 passed, the visible-desktop smoke ignored), actionlint 1.7.7, Docker Compose config, both Issue form YAML parses and updated audit-document links.
- PASS: Go Race re-ran on 2026-11-28 using Go 1.26.11, LLVM-MinGW Clang 23.1.6, `CGO_ENABLED=1`, and `GOMAXPROCS=2`. `go test -race -count=1 -p=1 ./...` passed across all server packages. The compiler is stored in ignored `.local` with no project dependency change. Docker-based signaling image build and SBOM re-scan remain NOT VERIFIED because Docker Engine is unavailable.
- The 2026-11-27 initial `main` check resolved to `2e4806f57ecef4bc295a6cdda2e9639a930443a8`; the separate audit branch had not been pushed at that point.
- Added [`G0 audit`](docs/g0-open-source-audit.md), updated [`PLANS.md`](PLANS.md) to the G0–G5 stages, clarified the no-author-operated-service model in `README.md`, and updated the [`verification matrix`](docs/verification-matrix.md).
- Added `README.zh-CN.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, sanitized bug/feature Issue forms, and a PR template. Both Issue form YAMLs parsed with temporary PyYAML 6.0.3 under `.local/`. Issue forms direct security disclosures away from public Issues, but no private vulnerability intake is configured yet.
- Added [`third-party component inventory`](docs/third-party-components.csv) and reproducible `npm run licenses:generate` / `npm run licenses:check` commands. CI now checks inventory drift. The current inventory has 552 components across npm, Cargo, Go, container images, GitHub Actions, Gradle, and WebView2.
- Pinned all GitHub Actions to immutable commit SHAs. The checkout v7.0.1, setup-node v7.1.0 and setup-go v6.2.0 manifests declare Node 24, replacing the previous Node 20 actions. `actionlint` 1.7.7 passes. Remote GitHub Actions execution remains NOT VERIFIED.
- Generated five SPDX 2.3 Linux/amd64 upstream image SBOMs by platform digest using checksum-verified Syft 1.57.2. The snapshots contain 392 package records, including 169 raw `NOASSERTION` entries. Five are aggregate OCI `CONTAINER` roots, one is a virtual APK dependency group, and 163 are software-component records. The Caddy crosswalk identifies all 123 Go source records. See [`container image SBOM notes`](docs/container-image-sbom/README.md), crosswalks, and per-image summaries.
- NOT VERIFIED: the Dockerfile-built signaling image after `apk add ca-certificates wget`, non-amd64 images, and upstream packages without license metadata. Docker Engine is not available on this host.
- PASS: npm audit reports 0 vulnerabilities; frontend tests 122/122 and frontend build; serialized Go tests and Vet plus `go mod verify`; Rust format/check and 25 tests passed with one visible-desktop smoke ignored; Compose config; component inventory generation/check; workflow lint.

## M42 — two-sided live diagnostics

- The two-PC report shows a local P2P/UDP route with 1–2 ms RTT and 0% packet loss. Receive decode time is about 4.4–4.5 ms and average jitter-buffer delay about 20.7–20.8 ms. These samples do not point to network RTT or decoder cost as the primary source of the reported page-switch stutter.
- During changing content, reported host capture cadence was 29.4 fps, capture reply P95 26.2–28.4 ms with maxima 163.2–197.5 ms, and receiver presentation cadence 23.1–27.7 fps with P95 intervals up to 158.4 ms. The captures implicate occasional capture/presentation pacing stalls but do not isolate their cause.
- Code review found HostPeer already samples sender WebRTC statistics, but the same-account direct-host UI did not subscribe to or display them. Wired sender statistics and host capture summaries into the visible direct-host diagnostics so the next reproduction can compare encoder FPS/latency/queue with receiver metrics. No credentials, input payloads, or frame data are exposed.
- PASS: `npm test` (122/122), `npm run build`, and LAN debug NSIS package build. The new unsigned package is `.local/lan-test-download/RemoteAssist_0.15.1-alpha-diagnostics_x64-setup.exe`, 3,228,160 bytes, SHA-256 `203A13988DBE181B0F2C60807A7F6CDC7B5D3DEFE02314BD265469F7E7E5C0A3`. HTTP HEAD from `.101:8090` returned 200 with the matching content length.
- NOT VERIFIED: root cause of the first-seconds/page-switch stutter, because sender encoder stats were not visible during the supplied run and the two endpoints' display/driver/load details have not yet been compared. Install the diagnostics package on the host, reproduce a moving page switch, and compare host sender/capture statistics with controller receiver/presentation statistics.

## M41 — current-source Windows Release package

- Rebuilt the normal Windows x64 Release installer and portable executable after adding the DXGI HRESULT diagnostics. Release NSIS: 2,434,731 bytes, SHA-256 `B69ACE2BE21927E2EF9A9022AF579AA23FA42B1885D63335E9DB03539E05F685`. Portable EXE: 10,602,496 bytes, SHA-256 `0A7119F3FE9542BD958B72F1E100D671DADDC39FFCCA9F4B8AD2021E1108DBD0`. Both are unsigned.
- The separate current LAN debug installer remains configured for `.101:8080`, 3,226,303 bytes, SHA-256 `F7D071B86AD8E36CFB32CC5A37F4AF14D2DB574C0F088F6B3A0E5DB4EE627BA8`.
- `cargo clippy --locked --all-targets -- -D warnings` is not clean due the documented existing lints; no source auto-fixes were applied.

## M39 — awaiting interactive Windows acceptance

- Rechecked Windows app discovery and the known `.100` peer. No targetable RemoteAssist desktop window or registered peer device is present; `.100` TCP 8080/8090 remain unreachable from this host. The `.101` health endpoint remains HTTP 200 and its two LAN test services stay available.
- The local capture runner cannot open the Windows input desktop (`OpenInputDesktop` returns access denied), and DXGI fallback returns `E_ACCESSDENIED`. A normal user-launched, unlocked desktop is required to distinguish runner isolation from a product capture issue.
- Remaining acceptance requires the user to start RemoteAssist on the Windows host and install/launch the package on `.100`, then confirm reachability and run the media/input flow. No firewall changes were made.

## M38 — DXGI initialization denial diagnosed

- Ran the ignored, opt-in primary-display smoke with 12 requested samples. `DuplicateOutput1` rejected the BGRA preference with `DXGI_ERROR_UNSUPPORTED (0x887A0004)`; its compatibility fallback `DuplicateOutput` then returned `E_ACCESSDENIED (0x80070005)`. `Capture::start()` failed before acquiring any frame.
- Added HRESULT-only stderr diagnostics for the preferred format attempt and final duplication failure; no pixels, credentials or window content are logged. This narrows diagnosis but does not resolve whether access denial is from the desktop/session environment or the capture path.
- Rechecked with a fresh smoke configured for three samples in the same desktop state; it failed before the first frame request with the same preferred-format and fallback errors. Further capture retries are deferred until the desktop is unlocked/available.
- A separate read-only `OpenInputDesktop` probe in the command runner also failed with Win32 access denied (5), confirming this runner cannot access the interactive desktop. This makes the DXGI failure inconclusive for a user-launched interactive client.
- Full `scripts/test.ps1`, `cargo fmt --check`, frontend 122/122 and production build pass. The actual capture result for this execution is FAIL; rerun after the Windows desktop is unlocked/available before classifying the Windows capture path.
- `cargo clippy --locked --all-targets -- -D warnings` was also attempted and failed on existing structural/style lints: `items_after_test_module`, two `manual_is_multiple_of` cases, one eight-argument helper, and two `needless_return` reports in cfg-specific credential-store branches. No Clippy autofix was applied because moving a large test module or changing MSRV/authorization plumbing would be unrelated churn.

## M40 — persistent LAN test services and refreshed package

- Replaced expired foreground service sessions with hidden, explicitly named local helper processes. Signaling listens only on `192.168.0.101:8080`; package serving listens only on `.101:8090`. Logs go to ignored `.local/lan-service-log/` files. No firewall or network profile changes were made.
- Rebuilt the LAN installer from the latest diagnostic source and downloaded it back over HTTP. Source and downloaded file both measure 3,226,303 bytes and SHA-256 `F7D071B86AD8E36CFB32CC5A37F4AF14D2DB574C0F088F6B3A0E5DB4EE627BA8`. It is unsigned and its test CSP/bundle target `.101:8080`.
- Recreated the two disposable accounts after the memory-service restart. Live API checks again passed code creation/join, replay rejection, host rejection, same-account device connection and host acceptance. Temporary devices were revoked and the account device lists returned to empty.
- `.100` still cannot reach `.101` TCP 8080/8090 and has not registered a device. Native capture remains unverified in a user desktop because the current command runner cannot open the input desktop; its DXGI smoke fails with `E_ACCESSDENIED` after the preferred-format fallback.
- Outbound UDP smoke sent five RFC 5389 Binding Requests to the configured `stun.l.google.com:19302`; all five matching responses arrived. Probe RTT was 187–203 ms (median 188 ms). This only measures this host's path to that STUN endpoint.

## M36 — native fullscreen runtime check attempt

- Launched a temporary Tauri dev page that calls `isFullscreen` and `setFullscreen`, then restores the prior window mode. The Windows automation helper returned `GetCursorPos access denied` and exposed no targetable RemoteAssist window, so no UI action or runtime result was obtained.
- Stopped the temporary dev process and removed the smoke page/config. No product capability or firewall setting changed. Native Tauri fullscreen remains UNVERIFIED beyond successful build/config validation.

## M37 — direct-device UI entry checks

- Added a synthetic `DeviceWorkspace` preview with a local connection counter. Playwright clicked the focus preview, sidebar device, grid preview and list device name. Each click invoked the direct-connect callback exactly once for the same eligible online Windows device. The grid/list “Enter desktop” buttons remain explicit alternate entry points using that callback.
- `npm test` passes 122/122 and `npm run build` passes. This verifies UI routing, not real signaling or native fullscreen. The temporary Vite server and Playwright browser were stopped.
- Final process check: only the intended `.101:8080` signaling and `.101:8090` package listeners remain. Health and package HEAD requests still return 200, with a 3,229,002-byte installer.

## M35 — live signaling API flow checks

- In the running in-memory service, two different test accounts created and joined a one-time assistance code. Reusing the code was rejected; the host then rejected the pending session.
- Under `hajim`, two temporary Windows device records completed direct-session creation and host acceptance, returning `AUTHORIZED_ACTIVE`. The test revoked both temporary devices and confirmed none remained.
- These checks exercise live HTTP signaling endpoints only. No real device media, input, or cross-PC network path was exercised.

## M34 — LAN test service and accounts prepared

- Started the in-memory signaling service on `192.168.0.101:8080` and a static package server on `192.168.0.101:8090`. `/healthz` and the installer HEAD request returned 200; the served installer is 3,229,002 bytes with the recorded SHA-256.
- Recreated disposable `hajim` and `hajim-assist` accounts in the memory store. Both local login/logout checks passed. Account records are lost when the signaling process stops.
- `.100` responds to ICMP. TCP reachability from `.100` to `.101` still awaits checking on that PC. No firewall setting was changed. Keep the test services open only for the manual run, then stop them.
- Follow-up read-only check: both accounts still authenticate and receive one STUN ICE server, but each device list is empty. No remote PC has registered with the restarted in-memory service yet, and no TURN server is configured.

## M33 — Chromium loopback verifies startup profile and immersive viewer

- Extended the existing real-PeerConnection loopback to assert the host applies `Balanced` before negotiation, then accepts a controller switch to the game profile. Chromium reports the 640×360 game target at 1,120 kbps under the Balanced tier, and the full loopback sequence passes.
- Updated the synthetic screen preview to load the application's viewer CSS. Playwright confirmed the remote surface fills a 1280×720 viewport, input auto-enables after video metadata, and the toolbar collapses to its floating button.
- The page uses generated canvas frames and simulated input. This validates WebView behavior, not native Tauri fullscreen, physical Windows input or two-PC latency.

## M31 — Go Race revalidation

- Located the previously downloaded LLVM-MinGW compiler and Go 1.26.11 toolchain in external caches. Fresh `go test -race -count=1 ./...` passed across all server packages.
- `CGO_ENABLED=1`, `CC`, and the compiler directory in `PATH` were scoped to the test command, then restored. No compiler or runtime dependency was added to the repository.
- Under Go 1.26.11, normal Go tests, Vet, signaling build and `go mod verify` also passed. The signaling binary was written to a temporary directory outside the repository.
- `govulncheck v1.10.0` found no reachable Go vulnerabilities. `cargo-audit 0.23.0` scanned the locked Rust dependencies against 1,568 advisories and exited successfully with three allowed warnings for unmaintained `chrono`, unmaintained `proc-macro-error`, and Linux-target `glib` unsoundness. `npm audit` reports zero vulnerabilities. The audit CLI was installed outside the repository and added no product dependency.
- Source inspection confirms the Windows capture path uses DXGI and has no screenshot-picker or browser `getDisplayMedia` flow. Any OS/runtime prompt on the installed two-PC build still needs direct observation.
- LAN recheck: `.100` responds to ICMP, but TCP `:8080` and `:8090` are closed; `.102` does not respond to ICMP. This host remains `.101` on a Public Windows network profile, with no local test listener. No firewall changes were made.

## M32 — deployment configuration verification

- Ran `scripts/verify-deploy-config.ps1` against a temporary fixture with generated test-only secrets, a reserved `.invalid` hostname and a public placeholder IP. The full validator and rendered Docker Compose configuration passed.
- The fixture was removed after the check. No real `deploy/.env`, secret or firewall setting was read or changed. This verifies configuration invariants, not an actual public deployment.

## M30 — direct fullscreen control entry and capture wait pacing

- **My Devices** now opens control with one device click from focus, sidebar, grid and list layouts. The duplicate view-only card action was removed; the in-session toolbar still pauses input while leaving the desktop visible.
- Windows controller awaits native Tauri fullscreen before opening the session. The visible main-window capability allows `setFullscreen`. Once video arrives, remote input activates automatically. The remote view occupies the full app window during setup and control. Disconnect and Escape restore the previous window mode. Compact in-session controls retain pause, tools and stop.
- DXGI acquire wait follows the requested sender FPS interval, capped at 40 ms. The 60 FPS target maps to a 17 ms wait. Frontend and Rust boundary tests cover 60/45/30/15 FPS, invalid values and the native cap. No before/after physical latency improvement is claimed.
- Automatic video quality now starts at the measured-policy `Balanced` tier instead of `Sharp`. At 4K the initial bitrate ceiling is 20 Mbps rather than 40 Mbps; sharp mode remains available, and automatic upgrades require measured headroom. This reduces startup load but has not yet been measured on the two Windows PCs.
- PASS after the final quality change: frontend tests 122/122 and production build; `scripts/test.ps1` passes frontend, Go tests/build and Rust check/tests; separate Go Vet and module verification pass; Rust format check passes with 25 tests and one visible-desktop smoke test ignored.
- PASS, unsigned Windows x64 release: NSIS installer 2,434,253 bytes, SHA-256 `1948AD0A82F63DDC7AC073F00C9B338823F9868E374F13967DD558C7F608A88B`; portable EXE 10,601,472 bytes, SHA-256 `03608738EA34F7B9375D6E1B09D3F9698D1BBC2BFF4989521A07F22D8E23E690`.
- PASS, unsigned LAN debug installer: 3,229,002 bytes, SHA-256 `750B7EECF85A5F045AF5EC1A5D77E1BE295E1DF73DFE751C7D62D5B779AF6C64`, configured for `192.168.0.101:8080`. It is copied to `.local/lan-test-download/` for LAN distribution.
- Real WebView2 acquisition/presentation, installed-client input behavior, physical two-PC session, and measured latency remain NOT VERIFIED.

## M29 — active WebSocket heartbeat regression

- Added a lifecycle regression with real test WebSocket connections. An authorized controller's active-session ping receives a local pong with the original timestamp, the capability token stays private, and the host does not receive the controller's ping.
- PASS: `go test ./...`, `go vet ./...`, and `go test -race ./...` on Go 1.26.11. The active-ping lifecycle regression also passed 50 normal repetitions and 25 Race-enabled repetitions. No signaling behavior change was needed.
- Local-only follow-up commit, with no push or release.

## M28 — dependency hardening and asynchronous GPU timing

- Continued from local commit `bd9334c8daeeccec4d81157330d575aec89e9fa7`. All work remains on the local engineering branch; no push or release was performed.
- Found and fixed reachable Go vulnerability advisories, including the 2026 Gorilla WebSocket issue and Go standard-library advisories. Upgraded Gorilla WebSocket to its patched upstream commit, `golang.org/x/crypto` to v0.59.0, its selected `x/net`/`x/sys` dependencies, and pinned CI/toolchain to Go 1.26.11.
- Pinned the Go Docker build image to `golang:1.26.11-alpine` after confirming the registry tag exists. Added pinned `govulncheck` and Rust `cargo-audit` gates to CI.
- PASS: `govulncheck ./...` reports no vulnerabilities on Go 1.26.11. `go test -race ./...`, normal Go tests, Vet and module verification pass using a temporary LLVM-MinGW C compiler outside the repository.
- Fixed the migration sequence collision by renaming the case-insensitive account migration to 003 after the pre-existing user-role migration 002. A local PostgreSQL-wire server backed by PostgreSQL WASM exercised the Go migration runner, idempotent repeat, both unique indexes, both legacy collision failures, and rollback without partial indexes.
- Upgraded Rust `url` to 2.5.9, `cookie` to 0.18.3, and `rustix` to 1.1.6. Cargo audit reports zero vulnerabilities. Informational warnings remain for transitive `chrono` and `proc-macro-error` maintenance status and Linux GTK `glib` unsoundness; the GTK issue is outside the supported Windows target.
- Added asynchronous WebGL disjoint timer queries, sampled once per 30 drawn updates, with at most eight pending queries, no synchronous result wait, disjoint-result rejection and cleanup on stream stop. The diagnostic reports GPU image-update P50/P95 and P99/max only after sufficient samples. It measures queued GPU upload/draw execution, not Canvas/WebRTC encoding, scanout or input-to-display delay.
- PASS, Chromium capability smoke: standalone WebGL 1 on RTX 4060/ANGLE D3D11 returned a non-disjoint 1.090336 ms query for 100 valid triangle draws, with `gl.getError() == NO_ERROR`. Packaged RemoteAssist/WebView2 measurements remain NOT VERIFIED.
- PASS: frontend tests 118/118 and production build. Rust `cargo fmt --check`, locked check/test pass with 24 tests passing and one visible-desktop smoke test ignored by default. Sustained WebView2 GPU counter availability and real values remain NOT VERIFIED.
- PASS, unsigned Windows Release: NSIS 2,433,729 bytes, SHA-256 `0CD6A59F966098F613EFC3CB05DF6CB7B077F7C141D424C03D787C8F88A1BCF2`; portable EXE 10,611,712 bytes, SHA-256 `46924AC879BAA12BB7551142A1EACA393D2260885B4572AED4B2FE230C9CF5DC`.
- PASS, unsigned LAN debug installer: built for current `192.168.0.101:8080`, 3,228,005 bytes, SHA-256 `0FFDE82F1D7C79F80BCF778BFF98C045E6671D51583E4519480E3A6864D8240F`. Generated JavaScript bundle and CSP both contain that exact HTTP/WS origin, with no generic HTTPS/WSS sources.
- LAN status: `192.168.0.101` is assigned to this host. `.100` and `.102` responded to ICMP probes, while tested signaling/download ports on `.100` and port 8080 on `.102` were closed. Windows classifies the active Ethernet network as Public. This turn did not start a service or change firewall rules. A final audit found pre-existing RemoteAssist signaling and download processes bound to stale `192.168.1.102` addresses. After confirming their process command lines, I stopped those two test processes under the runbook cleanup instruction. The separate `127.0.0.1:8080` development process remains running. Two-PC application acceptance remains NOT VERIFIED.
- PASS: Go migration runner applied migrations 001–003 twice against a temporary PostgreSQL 18.2 Windows server bound to loopback. Both unique indexes rejected case-folded duplicates; duplicate username/email preflight failures left no migration record or partial index.
- NOT VERIFIED: production or Compose PostgreSQL instance, two physical Windows computers, actual hardware encoder selection, public STUN/TURN, 30-minute session and physical input-to-display latency.

## M27 — engineering hardening and media observability

- Starting commit `2e4806f57ecef4bc295a6cdda2e9639a930443a8`; local-only branch `codex/overnight-engineering-hardening`.
- Add authenticated bounded capture-window counts, sampling-window P99/max after 100 samples, decoded-vs-WebView-presented callback cadence, and browser-reported encoder/decoder implementation when exposed. Presentation summaries are capped at four updates/second, and their sample storage is compacted during ordinary 60 FPS sessions. No per-frame logs or image persistence were added.
- Add copyable aggregate-only diagnostics with fields whitelisted for route, codec, rates, timing and drops; absent values stay unavailable.
- Fix `deploy/.env.example` to match the current eight-hour active-session default. Disable per-frame DXGI format logging during the smoke test; retain optional change-only format diagnostics on a separate explicit flag.
- Normalize new usernames to lowercase and add PostgreSQL migration 003 for case-insensitive username/email uniqueness, following the existing 002 user-role migration. The new migration refuses to proceed if legacy case-folded collisions exist; no accounts are rewritten automatically.
- Serialize native input deliveries to preserve event order across Tauri IPC. Bound pending work at 256 events; if a release edge arrives at capacity, revoke native authorization and release all held inputs instead of allowing stale input to follow it.
- PASS: frontend tests 113/113 and production build; Go tests/build/Vet/module checksum verification; Rust format/check and 23 tests pass with one opt-in visible capture test ignored by the normal suite; npm audit reports zero vulnerabilities; Compose config syntax validates; release and LAN test installers build.
- PASS, package unsigned: final Windows x64 NSIS installer is 2,429,607 bytes, SHA-256 `B11CC44CBE8984D85359F5CF64086B9E6B319A4DB5CF236916091BA48B0613E2`. The release portable EXE is 10,604,032 bytes, SHA-256 `36954B133AFF4406B87679172F71F74CEED0B07C2731244663AA5B1573F2DCBA`. Both are unsigned and have no production signaling domain configured.
- PASS, LAN test package: built for `192.168.1.102:8080`, 3,213,539 bytes, SHA-256 `66F5CD8B01B2B8EA8CB4891638411C622E19F0082905A5F97BFBCBF1EDDF3026`. Generated CSP allows only Tauri IPC, loopback and this exact HTTP/WS origin. The WLAN is classified Public; TCP probes to `192.168.1.100:8080` and `:8090` did not establish connections.
- VERIFIED, limited: animated 2560×1600 DXGI burst, 120 packets, 1 full/119 delta, 359 regions, 82.8% fewer bytes than full-frame equivalent, 512.8 ms request window and 3.99/5.15/5.90/18.77 ms reply P50/P95/P99/max. A separate ambient desktop burst returned 3 pixel packets and 27 empty timeouts.
- NOT VERIFIED: case-insensitive username/email migration on a live PostgreSQL instance; two-PC install/use; sustained 60 FPS stream; selected hardware encoder under live capture; GPU execution time; public P2P/TURN; 30-minute session; input-to-photon delay; and physical monitor scanout.
- Environment: Go Race is unavailable on this Windows installation (`CGO_ENABLED=0`, no C toolchain; WSL has no Go toolchain). `govulncheck` network download timed out. `cargo-audit`/advisory data were unavailable.

## M26 — distinct device and one-time assistance workflows

- Separate the dashboard, same-account device list, and remote-assistance entry page. The latter uses the existing eight-digit, single-use code API for a different signed-in user, while **My Devices** keeps direct same-account connections.
- The Windows host creates and displays a code. Code entry activates the session without another approval dialog, and the code is consumed by the first join. The host can stop it from the visible share panel. Both connection modes use the same native capture authorization and input lease.
- Collapse the in-session toolbar to a small floating control after 1.4 seconds. Opening it exposes pause, display, tools, and disconnect actions. Disconnect returns to the workflow that started the session.
- Reduce the requested receive jitter-buffer target on healthy paths to 15 ms for desktop and 10 ms for game mode. Raise the hint to 30/40 ms when measured loss or jitter is high. Browser implementations may clamp or ignore it.
- PASS: frontend tests 100/100, production build, Rust format/check and 22 Rust tests (one visible-desktop capture smoke ignored); Playwright confirmed distinct dashboard/device/assistance pages and a friendly response to an invalid code. Existing Go tests cover the one-time code create/join/approve protocol.
- NOT VERIFIED: the new code flow and floating control on two physical Windows machines, whether the user's repeated screenshot prompt is from RemoteAssist/Windows/the target app, and measured physical input-to-display improvement. The current screenshot's reported 1 ms RTT, 60 decoded fps, 0% loss, and 8 ms frame timing do not establish end-to-end mouse latency.

## M25 LAN acceptance preparation

- Add a dedicated Windows debug installer and a local in-memory signaling launch script for same-router testing. Only debug builds with the explicit `lan-test` Cargo feature allow RFC1918 IPv4 HTTP; normal builds continue to require HTTPS. The signaling listener binds to the selected local interface and keeps the existing exact Tauri origin allowlist.
- PASS: frontend tests 99/99, production build, Rust format check and 22 tests (one visible-desktop capture smoke ignored); Windows debug NSIS installer built. LAN health endpoint returns HTTP 200 and an in-memory `hajim` test account was created on `192.168.0.100:8080`.
- NOT VERIFIED: second Windows machine `192.168.0.102` downloading/installing the LAN package, firewall reachability, same-account video/input, direct UDP selection, and sustained performance. The local account/devices disappear when the foreground signaling process stops. LAN test credentials use cleartext HTTP and must not be reused outside this isolated test.
- NETWORK CHANGED: on 2026-11-24 this workstation no longer has `192.168.0.100`; its active WLAN address is `10.250.218.84`. `10.250.218.102` did not respond on the local subnet. Rebuild the LAN package with the current stable host address after both PCs are back on the same private LAN.

## Current milestone

M29 — active WebSocket heartbeat regression. Go test, Vet, and Race validation passed. M28 packages and dependency gates remain intact. Two-Windows application acceptance remains NOT VERIFIED.

## Direct connection workflow

- Remove the unused legacy host-consent dialog and Tauri commands. Current clients expose same-account direct device selection, server ownership checks, and a visible host pause/stop control.
- Remove stale guest/code-entry screens, unused client request/approval APIs, the registration-only direct-access checkbox, and the unused eight-digit code entry widget. Existing sign-in and account ownership checks remain.
- Windows sign-in continues to be remembered by default in Credential Manager. Active direct sessions default to eight hours.
- PASS: 98/98 frontend tests and production build; Rust format check and 21 tests passed, one visible-desktop capture smoke ignored; browser check confirms the guest and registration flows no longer show the old connection-code, consent prompt or registration checkbox.
- NOT VERIFIED: installed Windows client behavior with the latest build and a long two-PC session.
- UU's public PC and phone guides describe sign-in, online device selection, one-tap desktop entry and in-session controls. Its remote-wake feature is outside this change. [PC guide](https://uuyc.163.com/help/20241203/40220_1197651.html), [phone guide](https://uuyc.163.com/help/20241203/40220_1197649.html).

## Game quality profile

- Raise the game mode's highest encoding target from 1080p60 at 12 Mbps to 1440p60 at 18 Mbps. Existing congestion feedback still steps down through the bounded Balanced, Constrained and Economy profiles.
- Scale each game's bitrate ceiling by the source pixels that remain after aspect-preserving profile scaling. A 720p host does not receive the 1440p profile's full bitrate ceiling.
- PASS: 101/101 frontend tests and production build; Chrome WebRTC loopback confirms the 640×360 source uses the 60 fps ceiling and a 1.125 Mbps game-profile bitrate ceiling; settings preview displays the 1440p60 target.
- NOT VERIFIED: visual quality, sustained frame rate, encoder selection, or input-to-display behavior on physical two-PC game sessions. 1440p60 and 18 Mbps are ceilings, not achieved performance.

## Capture and route diagnostics

- Track up to 300 updated frames locally and report P50/P95 Tauri frame-response time plus browser parse/draw command-submission time. Timing reports travel over the existing authenticated WebRTC data channel and expire after five seconds without fresh host samples.
- Show the selected ICE candidate protocol and TURN `relayProtocol` when the browser reports them. Unknown protocol details remain unknown. Candidate addresses, frames and input payloads are not added to diagnostics.
- PASS: 101/101 frontend tests and production build; synthetic Chrome WebRTC loopback delivered host capture timing to the controller, rendered the P50/P95 fields, and identified the selected loopback route as direct UDP.
- NOT VERIFIED: timings from the native DXGI/Tauri host under game load, actual screen-present cadence, representative gameplay, or direct-vs-TURN performance. Reported Tauri response time includes native wait/copy/IPC, while browser draw timing measures command submission and is not GPU completion or input-to-display latency.

## 0.15.1 input/capture follow-up

- Rebuild the DXGI staging texture when the source pixel format changes, even if dimensions stay the same; send a complete baseline after the change so SDR/HDR pixels cannot be mixed across a partial update.
- Accumulate fractional relative mouse movement across browser samples, with bounded large deltas and resets when sensitivity, pointer-lock/input state, focus, geometry, or mouse-button edges change. Ignore repeated key-down events only while game pointer lock is active.
- Keep relative camera samples queued across independent keyboard, wheel and quality events; mouse-button, release, disconnect and text-input barriers still discard queued motion.
- PASS: 97/97 frontend tests and production TypeScript/Vite build; Rust format check and locked check; 21 Rust tests passed, one visible-desktop capture smoke test ignored by default.
- NOT VERIFIED: camera control in a representative physical game, actual Windows display-format/HDR transitions, or real remote gameplay. The existing physical-game/P2P/TURN acceptance remains outstanding.

## 0.15.1 settings and UX

- Installed and read `frontend-design` and `web-design-guidelines` skills from their upstream repositories at pinned revisions. Recorded provenance and the design/QA plan in [settings UX notes](docs/settings-ux-0.15.md); no runtime dependency was added.
- Organized real settings into general, remote experience, connection service, account/device and about sections. Added search with keyboard selection and focus to the matching control, exact sensitivity input alongside its slider, inline blur validation, and confirmed restoration of interface/remote defaults.
- Mobile categories are all visible in a wrapping grid. Long account/device strings wrap safely; theme, larger text and reduced-motion preferences remain supported.
- Unified local preference reads/writes with in-memory fallback. Failed persistence displays “only this run”, and success on another setting cannot hide unresolved failures. Automatic host capability fallback no longer rewrites the user's saved default or selected mode from a delayed host status.
- PASS: 94/94 frontend tests and production build; Chrome search/focus, bounds and step validation, slider sync, preference reload, default-reset cancel/confirm and unrelated-setting preservation; blocked-storage UI and consumer fallback; all five sections without horizontal overflow at 320/390/768/1024 px using synthetic long account/device strings, plus a desktop 1440 px view and dark/large-text tablet review.
- PASS: Chrome synthetic WebRTC loopback still negotiates game quality, carries relative motion, rejects invalid/revoked input, and stops delivery on teardown. Windows x64 NSIS 0.15.1 package built (2,415,178 bytes), SHA-256 `7C450222831F9839A136250AA87E003F243172A29B6DA2AC31588028E670CDF6`.
- NOT VERIFIED: native Windows visual behavior, updated Android package/device touch, or real remote gameplay for this settings-only milestone.

## 0.15 update

- Added a manually enabled pointer-lock mode for relative mouse camera input, per-game sensitivity, bounded delta validation, sub-frame delta coalescing, and release on unlock/blur/pause/stop/disconnect. Native authorization and input rate limits remain active.
- Added a negotiated game encoder profile targeting up to 1080p60, with bitrate caps following congestion tiers. Host capture pull rate follows sender settings after they are applied; no frames are queued to hide missed deadlines.
- Fixed the saved game mode being downgraded by a stale capability callback, and apply the optional receive jitter-buffer target immediately when game mode is acknowledged. The target remains a browser hint and responds to measured jitter/loss.
- Clarified that remote mouse input uses standard Windows input simulation, not a physical HID/Raw Input device; some games may ignore it. The displayed receive FPS is labeled as decoded FPS, not display presentation rate.
- Added local WebGL scissor updates for desktop deltas and old/new cursor footprints; first/full/resize/unsupported-precision frames redraw completely. Capture-video frame requests happen after drawing.
- Expanded the TURN relay deployment guide for Aliyun ECS; local Docker Compose validation passed with a temporary placeholder-free config and no production credentials.
- Offline FSRCNN x2 CPU benchmark: 720p synthetic input PSNR 21.53 dB vs bicubic 20.77 dB, but inference median 1,064.75 ms/frame. The model/runtime remain research-only and are not packaged or connected.

PASS: 90/90 frontend tests and production build; Chrome synthetic WebRTC loopback including game capability/profile negotiation and relative-motion delivery; Chrome pointer-lock entry, relative motion and Esc release; 390×844 mobile layout without horizontal overflow; Rust check and 20 tests (one visible-desktop capture smoke ignored); Go tests, vet and server build; temporary-fixture Compose/deployment validation; Windows x64 NSIS build. Installer SHA-256: `A6F8CF69CCC267A97800426A82BA188D6836DEFFBF5B0D0242FAE0B609440E45`.

NOT VERIFIED: camera control inside representative games, two-machine 1080p60 or P50/P95 input-to-photon, public ECS EIP/TURN/WAN behavior, physical Android game control, stable 4K60, or an advantage over UU. Version 0.15 also has no remote system-audio track, so it is not a complete game-streaming release yet. Pointer Lock uses browser-relative movement and standard Windows input simulation; games requiring physical Raw Input may not accept it. See [game-streaming research](docs/game-streaming-research.md), [known limitations](docs/known-limitations.md) and [Aliyun deployment and acceptance guide](docs/aliyun-game-deployment.md).

## 0.13 baseline

Emergency sender-pressure downgrades, compact 701–800 px focus layout and 44 px action row. Details: [0.13 notes](docs/direct-desktop-0.13.md).

## Next acceptance

Use a physical game, test direct P2P and selected TURN UDP separately, verify which routes accept pointer lock, and measure camera-turn input-to-display p50/p95. Check ECS egress bandwidth from measured relay bitrate.

## 0.14 baseline

Windows capture pacing follows the applied sender frame-rate limit; the viewer adds picture/input/connection tabs and partial-damage scissor redraw. Super-resolution stayed out of the runtime after the CPU model benchmark missed the frame budget. Details: [0.14 research](docs/desktop-research-0.14.md).

## 0.13 baseline

## 0.12 update

- Sparse disjoint DXGI dirty rectangles use multiple patches when their packet cost beats one bounding box; overlaps merge, and broad damage, moves, excessive count or invalid metadata fall back. The native path maps once and the WebView validates each region before texture updates.
- HDR scRGB half-float frames have an SDR BGRA conversion with a cached lookup table and a bounded highlight shoulder. Synthetic binary16/color tests pass; this physical smoke returned SDR format 87, so HDR hardware output/fidelity was not verified.
- Removed `gl.getError()` from every frame; setup/resize checks and context-loss teardown remain. Expected sync-query savings have not been isolated in a GPU benchmark.
- Fullscreen tools include measured sender/receiver health advice and identify static desktops as quiet rather than stalled.
- Opt-in capture sample on this 2560×1600 desktop: 120 packets in 1.162s; 1 full, 119 single-region delta, 0 multi-region packets; 52,255,948 bytes versus 1,966,082,400 full-frame-equivalent bytes (~97.3% less for this sample). Payload counts are not an FPS or latency result.

PASS: frontend 78/78 and production build; Go tests/build/vet; Rust check and 17 tests (one real capture smoke ignored by default). Android ARM64 debug APK and Windows portable/installer built for 0.12; hashes in `.local/releases/0.12.0-alpha/SHA256.json`.

NOT VERIFIED: stable 4K60, multi-region savings on a natural desktop sample, HDR path on HDR output, moving-4K CPU/tone-map cost, input-to-photon delay, UU comparison, weak-network and physical Android 0.12 behavior. Details: [0.12 notes](docs/direct-desktop-0.12.md) and [native capture](docs/native-performance-0.12.md).

## 0.11 baseline

Added account-local desktop/grid/list device layouts, relative touchpad input, four negotiated sender profiles, validated dirty-region frame packets and actual-versus-target telemetry. Details and sample limits: [0.11 notes](docs/direct-desktop-0.11.md).

## 0.10 baseline

### Completed

- Same-account device selection replaces connection codes, repeated host confirmation and screen picking, as explicitly requested by the user. The Windows client stays visible and logged in, identifies an active controller, and offers immediate stop/pause. No hidden service, autostart, UAC bypass or remote shell is added.
- Server-enforced account/device ownership, online/revocation checks, one-time activation, bounded pending sessions and active-session revalidation prevent cross-account access, including by another account's administrator.
- Native acceptance independently checks the exact session with the service before opening capture/input. DXGI selects the primary display, binary IPC carries one frame at a time, and a reused GPU texture converts BGRA to WebRTC video. Scoped request cancellation, bounded queues and the native lease/watchdog stop stale capture/input.
- The device workspace uses a side list and desktop-entry card. The viewer opens across the viewport with floating tools; fit shows the complete image, while fill preserves ratio and crops excess. Android uses transient-swipe immersive system bars.
- Direct sessions enable input after actual video/connection readiness. Resize and quality changes release held input without silently disabling operation. Backgrounding releases input. Rejected input has explicit bounded feedback.
- Sharp targets native source size up to 3840×2160 / 60fps with source-dependent 16–40Mbps ceilings. Actual FPS/bitrate/RTT/loss/drop statistics remain separate. Mouse pacing targets 90Hz with expiry/backpressure bounds.
- Android ARM64 debug APK and Windows portable/NSIS packaging are supported. Runtime service configuration avoids a baked-in example domain. The optional LAN helper uses short-lived IP certificates and exact-IP debug trust, with no OS CA/firewall changes.

### Verification

PASS:

- Frontend regressions/build, Go service tests/vet/build and Rust check/8 normal tests. One real-capture test is ignored by default and was explicitly run separately.
- Real DXGI primary display smoke: 2560×1600 BGRA8, 3 actual frames / 49,152,048 bytes, initialization plus capture 395ms. This is not a throughput benchmark. An initial unsupported-format result was diagnosed before the final explicit-BGRA implementation passed.
- Browser integration through the real HTTP/WebSocket service with two same-account devices and a synthetic 2560×1600 stream: direct entry, automatic input/fullscreen, right-click/Unicode/Enter delivery to memory, pause/resume and disconnect. It did not emit OS input.
- Fullscreen equals the viewport at 1280×720, 820×393, 393×820 and 320×640. Device layouts also cover 1024×768 without horizontal overflow. Hit testing exposed/fixed a legacy sticky-toolbar overlap blocking lower touch controls.
- LAN proxy Go tests/vet and certificate tests. The earlier physical 0.9 tablet session displayed the Windows desktop, and the user reported the touch/quality problems addressed here.
- Android signature verification and Windows portable/NSIS generation; artifact hashes and final counts are recorded in docs/direct-desktop-0.10.md.

### Not verified

- Sustained native 4K60, hardware encoder selection and touch-to-photon latency. Raw IPC and browser encoding can limit throughput; this desktop's source is 2560×1600.
- The latest 0.10 build on the physical tablet (USB currently disconnected), real IME/immersive behavior, public TURN and two-machine weak-network performance.
- Production Android signing, installation on a second Windows PC, cloud deployment and live PostgreSQL migration.
