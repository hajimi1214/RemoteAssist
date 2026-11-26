# Overnight Engineering Report

- Date: 2026-11-25, follow-up: 2026-11-26
- Branch: `codex/overnight-engineering-hardening`
- Starting commit: `2e4806f57ecef4bc295a6cdda2e9639a930443a8`
- Starting worktree: clean. Existing commits and the current GitHub `main` were preserved.
- Release version: unchanged at `0.15.1-alpha`.

## Work completed

- **My Devices** opens control with one click from its focus preview, sidebar row, grid tile, or list name. The preview says `远程电脑`, and duplicate control/watch buttons were removed. The in-session toolbar can pause input while keeping the desktop visible.
- On Windows, the app awaits native Tauri fullscreen before mounting the controller. The main-window capability explicitly grants `setFullscreen`. After the first video frame, remote input activates automatically, so no control-enable click is required. Disconnect and Escape restore the previous window mode and release held inputs.
- Tightened DXGI frame pacing. Each request passes the sender FPS target; `AcquireNextFrame` waits at most the corresponding frame interval, capped at 40 ms. This lowers the 60 FPS wait ceiling from 40 ms to 17 ms without changing the frame protocol. It is a scheduling optimization and does not establish a measured end-to-end latency improvement.
- Added direct-device activation tests plus frame-pacing tests for 60/45/30/15 FPS, invalid values and the native timeout cap.
- 2026-11-26 follow-up starts automatic encoding at `Balanced` instead of `Sharp`. A 4K source has a 20 Mbps configured startup ceiling instead of 40 Mbps. Automatic upgrades still require measured headroom, and the manual sharp setting remains available. This is a bounded startup-load reduction, not a physical latency result.
- Fresh Chromium integration checks observed `Balanced` as the first applied HostPeer profile before switching to game mode. The generated 640×360 source received a 1,120 kbps game target. A synthetic viewer preview with the app CSS filled a 1280×720 viewport, auto-enabled input after video metadata, and collapsed the toolbar to its floating control. This does not verify native Tauri fullscreen or physical two-PC latency.
- A synthetic `DeviceWorkspace` preview verified each of the focus preview, sidebar device, grid preview and list name starts exactly one connection callback for the same online Windows device. Grid/list “Enter desktop” buttons share that callback.
- In the running in-memory signaling service, two test accounts completed one-time code creation/join, replay rejection and host rejection. Two temporary same-account Windows devices created and accepted a direct session. Both temporary devices were revoked and confirmed absent afterward. These live HTTP checks do not exercise remote media or physical input.

- Added an active-session WebSocket heartbeat regression. It proves a controller ping is answered locally with the original timestamp, the token is omitted from the pong, and the host receives no relayed probe. The test passed 50 normal repetitions and 25 Race-enabled repetitions. `go test ./...`, `go vet ./...` and `go test -race ./...` pass after the addition.

- Follow-up hardening continued from local commit `bd9334c8daeeccec4d81157330d575aec89e9fa7`, retaining the `0.15.1-alpha` app version.
- `govulncheck` initially found 14 reachable findings across the Go 1.26.4 standard library, Gorilla WebSocket 1.5.3 and old `x/crypto` packages. Upgraded to the patched Gorilla WebSocket commit, `golang.org/x/crypto` v0.59.0 and selected `x/net`/`x/sys` dependencies. This raises the Go module floor from 1.24 to 1.26.0. Pinned local module and CI toolchains to Go 1.26.11, where `govulncheck ./...` reports no vulnerabilities.
- Ran `go test -race ./...` successfully with a temporary LLVM-MinGW C compiler and `CGO_ENABLED=1`. The compiler archive was stored outside the repository and no runtime dependency was added.
- Pinned the Go container build to `golang:1.26.11-alpine` and added pinned Go/Rust advisory scans to CI. The Docker registry manifest lookup confirmed the tag exists. A local Docker image build was unavailable because Docker Desktop's service is not accessible on this host.
- Cargo audit found two Rust vulnerabilities in transitive `url` 2.5.8 and `cookie` 0.18.2. Updated them to 2.5.9 and 0.18.3. Updated `rustix` 1.1.4 to 1.1.6 after a related advisory review. The refreshed audit reports zero vulnerabilities. Three informational advisories remain, covering transitive `chrono` and `proc-macro-error` maintenance status and GTK `glib` soundness on non-Windows targets.
- Corrected the account index migration's sequence to 003 because 002 was already used for user roles. Strengthened the migration test to assert the complete existing order and SQL mirror.
- Verified migrations 001–003 and failure rollback with the Go migration runner against both PGlite/PostgreSQL WASM and a temporary PostgreSQL 18.2 Windows server bound to loopback. Legacy duplicate username and email cases each failed with an actionable error and left no partial indexes or version row. Re-running a clean migration completed idempotently. Production and Compose PostgreSQL instances remain untested.
- Added optional `EXT_disjoint_timer_query` sampling around native-frame WebGL upload/draw operations. It samples each 30 drawn updates, bounds pending queries at eight, checks result availability before reading, rejects disjoint samples, and releases resources at stream stop. Unsupported extensions and query errors leave capture enabled with the metric unavailable.
- Added diagnostic display/export and automated coverage for GPU update-time P50/P95/P99/max. This is GPU upload/draw execution duration, not panel scanout, Canvas/WebRTC encoding or input-to-display latency.
- Standalone Chromium smoke used valid WebGL shaders and a hardware renderer of NVIDIA RTX 4060 Laptop GPU via ANGLE/Direct3D 11. `EXT_disjoint_timer_query` returned a non-disjoint 1.090336 ms result for 100 triangle draws with `gl.getError() == NO_ERROR`. This verifies that browser's GPU timer mechanism only; it is not a packaged RemoteAssist/WebView2 session measurement.
- Research documents downloaded successfully for NVENC 13.1, AMD AMF, Intel VPL shared surfaces/hardware acceleration, Windows Media Foundation H.264 and WebGL disjoint timer queries. Their local hashes and source metadata are recorded in `.local/research/pc-game-0.16/manifest.json`.

- Reviewed React/Tauri entry paths, native Rust capture and input, Go REST/WebSocket/session code, PostgreSQL migration setup, WebRTC stats/ICE/TURN configuration, Windows packaging scripts, threat model, current known limitations, and local CI checks.
- Fixed a stale deployment example that set `SESSION_ACTIVE_TTL=30m` despite the current server default and documentation saying 8 hours. `deploy/.env.example` now agrees with `docker-compose.yml` and the supported server bounds.
- Normalized newly registered usernames to lowercase and added migration 003 case-insensitive unique indexes for username/email, following the existing migration 002 user-role schema. The new migration preflights legacy duplicates instead of renaming data silently. Kept the historical SQL mirror synchronized and added an ordering/mirror test.
- Removed per-frame DXGI format logging from the normal smoke mode. Format diagnostics now require `REMOTEASSIST_CAPTURE_FORMAT_DEBUG=1` and only log when the source format changes. This matters because console output can itself animate the captured desktop and force full-frame transfers.
- Extended the visible DXGI smoke report with empty timeout count, wall/request windows, request throughput, response P50/P95/P99/max and frame/rectangle/byte totals. A static scene with no changed pixels is now distinguishable from a failed frame transfer. `REMOTEASSIST_CAPTURE_REQUIRE_FRAME=1` can require a dynamic scene for an operator-selected run.
- Extended host capture telemetry with bounded request-window counts for full frames, delta frames, delta regions, cursor packets, empty responses and failed requests. Percentiles require enough samples: P50/P95 at 10 samples and P99/max at 100. These summaries are carried by the existing authenticated heartbeat path, not sent for every frame.
- Added browser video-frame callback statistics using `requestVideoFrameCallback` where supported. Summaries are limited to four per second, use a 2-second sample window with storage compaction exercised at 60 FPS, and leave values unavailable when the API or samples are missing.
- Added capability-gated asynchronous WebGL disjoint timer queries around texture upload and draw operations. Sampling occurs once per 30 pixel draws; the queue is capped at eight, results are read only when available, and GPU disjoint samples are discarded. Unsupported or failing queries do not stop capture.
- Added stats extraction for the browser-reported encoder and decoder implementation when WebRTC exposes those fields. The label says browser-reported implementation and does not claim hardware acceleration. Unit coverage exercises exposed implementation names.
- Added regression coverage for percentiles, malformed/runtime capture summaries, frame presentation counter resets and reported encoder/decoder implementation.
- Added a one-click copyable diagnostic report from a field whitelist, with absent metrics labeled unavailable and no identifiers, candidate addresses or session/input content.
- Restricted the LAN-test package CSP to Tauri IPC, loopback and the selected exact HTTP/WS origin. The generated package configuration contains no wildcard HTTPS/WSS origins.
- Serialized native Tauri input deliveries so unordered pointer-channel IPC cannot overtake reliable button/key barriers. A bounded backlog rejects transient work; if a release arrives at capacity, native authorization is revoked immediately to release held controls. Added regressions for order, authorization changes while queued, and overflow release behavior.
- Added this report, [verification matrix](verification-matrix.md), [two-PC runbook](lan-two-pc-runbook.md), and appended measurements to [performance baseline](performance-baseline.md).

## Captured baseline

On the current 2560×1600 SDR desktop, the controlled synthetic moving pattern produced 120 pixel packets: 1 full and 119 delta, 359 regions total, 82.8% fewer bytes than equivalent full frames. The native request window was 512.8ms, with reply P50/P95/P99/max of 3.99/5.15/5.90/18.77ms. During that sequential burst the calculated pixel FPS was 234.0, which is not a negotiated or sustained stream rate.

With the moving pattern closed, an ambient desktop sample had 3 changed pixel packets and 27 DXGI timeout replies in a 1,338.1ms request window. Reply P50/P95/P99/max was 46.35/50.99/51.13/51.13ms. This is not a controlled static image because other desktop activity still changed the screen. A smoke test from an earlier quiet window returned 30 empty timeouts and zero pixel packets.

These native samples exclude the complete Canvas/WebRTC encode, network path, remote decode, physical presentation and input-to-display time. They do not constitute an optimization A/B comparison or sustained stream FPS.

The installed host exposes an AMD Radeon 780M and NVIDIA RTX 4060 Laptop GPU. `nvidia-smi` reported zero active encode sessions during the check. The app source still performs DXGI GPU copy to CPU staging, IPC to WebView, WebGL upload, Canvas capture and browser-managed WebRTC encoding. No native NVENC, AMF, QSV or Media Foundation encoding integration was introduced.

Hardware encoder evaluation: NVENC is a candidate on this host's RTX 4060 and AMF is a candidate on its Radeon 780M. No Intel GPU was enumerated. The NVENC guide describes opening an encode session against a DirectX device and registering/mapping externally allocated input textures. Supported input formats depend on the selected hardware, so the current BGRA/scRGB staging path is not a directly verified encoder surface. Intel VPL documents import of D3D11 textures without mapping/copying through system memory, with a copy fallback when shared surfaces are unavailable. The AMF header documents low-latency usage modes and DirectX memory selection. Media Foundation's H.264 MFT documents NV12/I420/YUY2-family input, H.264 output and codec latency parameters. These establish plausible APIs, not runtime support, selected hardware, zero-copy behavior, or WebRTC integration on this machine. The host has both AMD and NVIDIA adapters, so adapter identity and cross-adapter transfer cost must be measured. The current application still has no native encoder integration. AV1/HEVC availability and interoperability across deployed endpoints remain UNVERIFIED.

## Validation results

- Frontend: `npm test` PASS, 122/122. `npm run build` PASS.
- Go server: `go test ./...` PASS.
- Go server: `go vet ./...` PASS.
- Go module cache: `go mod verify` PASS for the modules already downloaded.
- Go module checksums: `go mod verify` PASS for downloaded modules.
- Rust: `cargo fmt --check`, `cargo check --locked`, `cargo test --locked` PASS. The unit suite has 26 tests, 1 visible-desktop test is ignored by default, and 25 normal tests pass.
- Go Race: PASS across all packages using temporary LLVM-MinGW GCC, `CGO_ENABLED=1`, and Go 1.26.11.
- `govulncheck ./...`: PASS, no reachable Go vulnerabilities on Go 1.26.11.
- Cargo audit: PASS, zero Rust vulnerabilities. It reports three informational warnings, covering `chrono` and `proc-macro-error` maintenance status and GTK `glib` soundness on non-Windows targets. The Windows-target audit also reports zero vulnerabilities.
- Fresh 2026-11-26 scans: `govulncheck v1.10.0` reported no reachable Go vulnerabilities on Go 1.26.11. `cargo-audit 0.23.0` loaded 1,568 advisories, reported the same three allowed Rust warnings, and exited successfully. `npm audit` reported zero vulnerabilities.
- PostgreSQL migration runner: PASS against a temporary PostgreSQL 18.2 Windows server bound to loopback. Clean application and rerun, both unique indexes, each duplicate preflight error and transaction rollback were checked. Production and Compose PostgreSQL instances remain UNVERIFIED.
- DXGI visible desktop: dynamic smoke PASS for the animated UI pattern. A no-update run returned 30 empty DXGI timeout replies and zero pixel frames, reported as no pixel transfer rather than as a fabricated zero-FPS stream.
- 2026-11-26 current-session DXGI smoke: FAIL at initialization. `DuplicateOutput1` rejected the preferred BGRA format with `DXGI_ERROR_UNSUPPORTED (0x887A0004)` and fallback `DuplicateOutput` returned `E_ACCESSDENIED (0x80070005)`. No frame was acquired. HRESULTs are logged only on initialization failure. Cause is not proven to be environmental or product-related; repeat with an available unlocked desktop.
- A subsequent smoke configured for three samples in the same desktop state failed before the first frame request with the same pair of errors. Further attempts await an unlocked desktop.
- A read-only `OpenInputDesktop` probe in the command runner also failed with Win32 access denied (5). The runner cannot access the interactive desktop; the DXGI result does not classify capture behavior for a user-launched desktop client.
- Compose: `docker compose --env-file deploy/.env.example -f deploy/docker-compose.yml config --quiet` PASS. This validates compose syntax and not actual public networking.
- Deployment verifier: `scripts/verify-deploy-config.ps1` PASS with a temporary synthetic fixture and rendered Compose JSON. Generated test-only secrets and a reserved hostname were used, then the fixture was removed. This does not validate live infrastructure.
- npm dependency audit: PASS, zero reported vulnerabilities.
- Go race detector: PASS using a temporary LLVM-MinGW compiler and `CGO_ENABLED=1`. No compiler files were added to the repository.
- Go advisory scan: PASS with Go 1.26.11 and the patched dependency versions. The final `govulncheck ./...` run reports no reachable vulnerabilities.
- Rust dependency audit prompted safe lockfile updates to patched `url`, `cookie` and `rustix` versions. No new runtime feature dependency was added.
- Rust advisory scan: PASS with zero vulnerabilities. Three informational advisories remain, including two unmaintained transitive crates and a GTK `glib` soundness advisory for non-Windows targets.
- Current Windows NSIS x64 installer: PASS, 2,434,253 bytes, SHA-256 `1948AD0A82F63DDC7AC073F00C9B338823F9868E374F13967DD558C7F608A88B`, `NotSigned`.
- Portable Windows EXE: PASS, 10,601,472 bytes, SHA-256 `03608738EA34F7B9375D6E1B09D3F9698D1BBC2BFF4989521A07F22D8E23E690`, `NotSigned`.
- Current LAN test NSIS package: PASS, 3,229,002 bytes, SHA-256 `750B7EECF85A5F045AF5EC1A5D77E1BE295E1DF73DFE751C7D62D5B779AF6C64`, configured for `192.168.0.101:8080`. The generated Tauri CSP contains only that private HTTP/WS origin plus IPC and loopback.
- Neither artifact embeds a production signaling domain. They verify build/packaging only and require a configured HTTPS service before operational use.
- Physical second-Windows installation, same-LAN flows, public STUN/TURN and long-session behavior: NOT VERIFIED. Current host address is `192.168.0.101`; the network is classified Public and observed peer service ports are closed. A final audit identified two pre-existing RemoteAssist test processes bound to stale `192.168.1.102:8080` and `:8090` addresses. After verifying their command lines, they were stopped following the runbook cleanup instruction. An unrelated loopback development service remains active.
- LAN reachability recheck on 2026-11-26: `192.168.0.100` answers ICMP, its TCP 8080/8090 ports are closed, and `192.168.0.102` does not answer ICMP. No signaling/download service was started and no firewall setting changed.
- Subsequent 2026-11-26 LAN setup: started the in-memory signaling service and static installer server on `.101:8080` and `.101:8090`. Local health/download requests returned 200. Disposable `hajim` and `hajim-assist` accounts passed local login/logout checks. Cross-PC TCP reachability and remote control remain NOT VERIFIED; services stay active for the user test and must be stopped afterward.
- Service sessions were later restarted as hidden local helpers after the foreground test handles expired. Current endpoints remain scoped to `.101`. The refreshed unsigned installer is 3,226,303 bytes, SHA-256 `F7D071B86AD8E36CFB32CC5A37F4AF14D2DB574C0F088F6B3A0E5DB4EE627BA8`; a full HTTP download matched the local artifact. Disposable accounts were recreated, live code/direct API flows were rechecked and temporary devices removed. `.100` remains unreachable on the test ports.
- Latest check: both test accounts log in and receive one public STUN entry, but neither has a registered device. TURN is not configured. No remote PC has yet registered with this memory service.
- Current acceptance remains pending: no targetable RemoteAssist window or `.100` connection exists. Both LAN services on `.101` are live. The command runner cannot access the input desktop, and local DXGI duplication returns access denied. User-launched unlocked host/peer clients are required before native capture, media, input, latency or screenshot-prompt behavior can be verified.
- On 2026-11-26, Go 1.26.11 normal tests, Vet, signaling build, module verification, and fresh `go test -race -count=1 ./...` all passed. The Race run used the preserved temporary LLVM-MinGW toolchain. `CGO_ENABLED` and compiler `PATH` were scoped to the command and restored afterward. The signaling executable was written outside the repository. Go source files were unchanged in this follow-up.

## Security review notes

No new P0 or P1 issue was found in the reviewed code. Existing authentication, one-time host/controller capabilities, same-account device ownership, session expiry, WebSocket size/rate bounds, native input token/expiry/lease checks, and release-all behavior remain in the active path. The code-based cross-account workflow is explicitly the host-created single-use control code. The native host still visibly runs, and this work adds no hidden service, default autostart, UAC bypass, shell execution, screen recording or credential logging.

This is a source and regression-test review, not a penetration test or a complete formal security audit. Public deployment, cross-network TURN and revocation under real two-PC load remain unverified.

## Issues found and disposition

| Priority | Finding | Disposition |
|---|---|---|
| P2 | `deploy/.env.example` still set a 30-minute active TTL, conflicting with the current 8-hour server default and deployment docs. | Fixed the example to 8 hours. |
| P2 | PostgreSQL's existing exact-case unique constraints permitted case variants although login queries match lowercased usernames/emails. | Registration now stores lowercase usernames. Migration 003 preflights existing case-folded collisions and adds unique expression indexes. |
| P2 | The native smoke test emitted a format line for every frame when its smoke flag was set, which could dirty the captured screen and corrupt the benchmark. | Fixed by a separate opt-in format-debug flag and change-only logging. |
| P2 | Capture timing lacked P99/max, and diagnostics could not distinguish full/delta/cursor/empty/failure windows. | Added sample-gated percentiles and bounded host counters. |
| P2 | Controller reported decoded frames but not browser video-frame callbacks. | Added a separately labeled, capability-gated callback measurement. It is not physical scanout. |
| P2 | Presentation callback samples were only compacted after 128 stale samples, a threshold unreachable in ordinary 60 FPS windows. | Lowered the compaction threshold and changed the long-session test to a 60 FPS callback cadence. |
| P2 | Browser-reported codec was visible, but implementation detail was omitted. | Added encoder/decoder implementation fields only when exposed by WebRTC stats. |
| P2 | The LAN-test CSP allowed generic HTTPS/WSS sources even though its signaling URL targeted one private test host. | Removed generic HTTPS/WSS sources, rebuilt the package and verified the generated CSP against the selected address. |
| P2 | DataChannel callbacks issued independent asynchronous Tauri input commands, so native completion order could differ from event validation order under IPC load. | Serialize native event delivery and fail closed on a full backlog; a saturated release edge revokes native authorization, which releases held controls. Regression-tested. |
| P2 | Reachable Go advisories affected Go 1.26.4, Gorilla WebSocket 1.5.3 and selected `x/crypto` calls. | Upgraded the toolchain and dependencies; the repeat symbol scan reports no vulnerabilities. Go Race also passes with a locally downloaded temporary compiler. |
| P2 | Cargo audit found RustSec advisories in transitive `url` and `cookie` versions. | Updated both to fixed releases and upgraded the affected `rustix`; rescan reports zero vulnerabilities. Three non-vulnerability informational advisories remain. |
| P2 | Capture timing lacked a GPU execution measurement. | Added bounded, capability-gated asynchronous WebGL timer queries and synthetic tests. Real WebView2 counter availability and measurements remain unverified. |
| P2 | The identity-index migration used sequence 002, already assigned to the user-role migration. | Renamed the new migration to 003, strengthened ordering/mirror tests, and verified it using the production Go runner against temporary PostgreSQL-wire test databases. |

## Next five investments

1. Repeat the LAN runbook on two currently reachable Windows PCs, test same-account and one-time-code flows separately, and measure a 30-minute session.
2. Capture WebRTC sender/receiver statistics while the real stream runs. Confirm the `encoderImplementation`, codec, actual receive callback cadence, queue and drop counters.
3. Measure physical mouse input-to-display with a repeatable optical test. Do not substitute RTT or frame callback metrics.
4. Design a D3D11 texture-sharing prototype and compare it with the current staging readback using identical scenes before adding a native encoder. Keep WebRTC congestion control and fallback behavior in scope.
5. Keep Go Race and advisory scans in CI, resolve or document the remaining Rust informational advisories, then decide whether a native Media Foundation/NVENC/AMF/QSV path is justified by measurements.
