# Status

## M30 — direct fullscreen control entry and capture wait pacing

- **My Devices** now opens control with one device click from focus, sidebar, grid and list layouts. The duplicate view-only card action was removed; the in-session toolbar still pauses input while leaving the desktop visible.
- Windows controller awaits native Tauri fullscreen before opening the session. The visible main-window capability allows `setFullscreen`. Once video arrives, remote input activates automatically. The remote view occupies the full app window during setup and control. Disconnect and Escape restore the previous window mode. Compact in-session controls retain pause, tools and stop.
- DXGI acquire wait follows the requested sender FPS interval, capped at 40 ms. The 60 FPS target maps to a 17 ms wait. Frontend and Rust boundary tests cover 60/45/30/15 FPS, invalid values and the native cap. No before/after physical latency improvement is claimed.
- Automatic video quality now starts at the measured-policy `Balanced` tier instead of `Sharp`. At 4K the initial bitrate ceiling is 20 Mbps rather than 40 Mbps; sharp mode remains available, and automatic upgrades require measured headroom. This reduces startup load but has not yet been measured on the two Windows PCs.
- PASS after the final quality change: frontend tests 122/122 and production build; `scripts/test.ps1` passes frontend, Go tests/build and Rust check/tests; separate Go Vet and module verification pass; Rust format check passes with 25 tests and one visible-desktop smoke test ignored.
- PASS, unsigned Windows x64 release: NSIS installer 2,434,253 bytes, SHA-256 `1948AD0A82F63DDC7AC073F00C9B338823F9868E374F13967DD558C7F608A88B`; portable EXE 10,601,472 bytes, SHA-256 `03608738EA34F7B9375D6E1B09D3F9698D1BBC2BFF4989521A07F22D8E23E690`.
- PASS, unsigned LAN debug installer: 3,229,002 bytes, SHA-256 `750B7EECF85A5F045AF5EC1A5D77E1BE295E1DF73DFE751C7D62D5B779AF6C64`, configured for `192.168.0.101:8080`. It is copied to `.local/lan-test-download/` for LAN distribution.
- Real WebView2 acquisition/presentation, installed-client input behavior, physical two-PC session, and measured latency remain NOT VERIFIED.
- The Go Race attempt could not start because the current shell has `CGO_ENABLED=0` and no C compiler in `PATH`; the earlier M29 Go Race result remains recorded separately.

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
