# Status

## Current milestone

M16 — 0.13.0-alpha emergency sender-pressure response and responsive layout cascade fix. Reviewed 2026-11-21.

## 0.13 update

- On the first sample showing a severe sender-side queue (≥250 ms), critically low estimated bandwidth (<300 kbps), or CPU-limited encoding (≥120 ms mean), lower the adaptive quality ceiling by one or two levels. Recovery still requires consecutive good samples.
- Fixed a CSS cascade that overrode compact device-focus sizing on short desktop viewports. Verified actual action hit-testing at 1024×768 and 1280×720; the 44px control is visible/clickable and document width matches viewport.
- PASS: frontend 80/80 and production build, Go tests/build/vet, and Rust check plus 17 tests (one manual capture smoke ignored). Windows portable and NSIS installer, and development-signed Android ARM64 APK built for 0.13.
- PASS: synthetic same-account loopback received 2560×1600 video; at 393×820 the expanded viewer filled the viewport, tools scrolled internally and fullscreen exit and disconnect were reachable.

NOT VERIFIED: two-machine weak-network responsiveness, stable 4K60, end-to-end input latency, and physical Android 0.13 interaction. Immediate downgrade is a pressure response; it does not remove hardware/network bottlenecks. Details: [0.13 notes](docs/direct-desktop-0.13.md).

## Next acceptance

Run a sustained two-machine weak-network test and compare telemetry (sender queue, encoder limit, receiver decode/jitter) with observed interaction delay; separately retest on physical Android.

## 0.12 baseline

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
