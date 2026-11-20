# Status

## Current milestone

M18 — 0.15.0-alpha game-oriented relative mouse control, bounded sender/renderer work, expanded Aliyun TURN docs and desktop media research. Reviewed 2026-11-21.

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
