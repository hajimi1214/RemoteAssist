# Status

## Current milestone

M14 — 0.11.0-alpha negotiated quality profiles, dirty-region capture packets, responsive device layouts and mobile touchpad controls. Reviewed 2026-11-20.

## 0.11 update

- Device center now offers desktop, grid and list layouts with account-local preference, combined status/platform filters, search and favorites. The viewer adds touchpad input and a four-profile real sender-control channel; acknowledgments distinguish applied encoder settings from browser-managed settings.
- Native DXGI capture reuses a texture and transfers validated dirty-region updates for small changes, falling back to full frames for broad changes, moves or uncertain metadata. No frame pixels enter logs or disk.
- Actual opt-in primary-display capture sample on this 2560×1600 desktop: 108 changed-image packets over 2.148s, comprising 33 full and 75 delta updates. Bytes were 541,482,112 vs 1,769,474,160 full-frame-equivalent bytes (~69.4% less for this local sample). This is payload evidence only, not an FPS/codec/network benchmark.
- Browser synthetic direct session: received 2560×1600 at ~30fps from a ~30fps generator, exact 1280×720 fullscreen geometry, zero packet loss, sharp sender profile accepted with `applied=true`; no OS input was generated. Device layouts and account filters were exercised. Added a compact profile for shorter desktop workspaces; final physical font-scale variants still need checks.

PASS: frontend 76/76 and production build; Go tests/build/vet; Rust check and 9 normal tests (one real capture test ignored by default). The opt-in capture smoke passed separately. Android ARM64 APK (v2 development signature), Windows portable EXE and NSIS installer built for 0.11; hashes are in the ignored local release folder.

NOT VERIFIED: sustained 4K60, 4K source, end-to-end input latency, comparison against UU, weak-network conditions, physical Android 0.11 interaction, cloud deployment or production signing. Details: [0.11 notes](docs/direct-desktop-0.11.md), [capture packet design](docs/native-performance-0.11.md).

## Next acceptance

Reconnect a physical Android device to matching 0.11 clients and measure moving-content capture/encode/decode FPS and input latency on direct and relayed networks. Do not label the 4K60 target as achieved until measured from a real 4K source.

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
