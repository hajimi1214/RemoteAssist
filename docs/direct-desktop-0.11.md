# Remote desktop improvements — 0.11 alpha

This milestone makes the device center and live session controls more expressive while reducing local frame-copy work for desktop changes. Same-account direct access continues to start the primary display without a code, repeated confirmation or screen picker. The visible host can still pause or stop access.

## Device center and viewer

- Three account-local device layouts: desktop focus, card grid and list. Online/offline/Windows filters combine with search and favorites; device artwork is explicitly labelled as an illustration until a session starts.
- The full-viewport viewer exposes fit, fill-with-crop and zoom modes, actual received resolution/FPS/bitrate/loss/drop counters, measured network RTT, and mobile direct-touch or relative-touchpad input.
- Four negotiated sender profiles: automatic, sharp, smooth and economy. The host applies bounded `RTCRtpSender.setParameters` values while leaving WebRTC bandwidth estimation and congestion adaptation enabled. The phone receives an acknowledgment that distinguishes a successfully applied sender profile from browser-managed encoding.
- Ctrl/Alt/Shift one-shot modifiers and remote key chords release in reverse order; failure releases all held input. The floating toolbar compacts after inactivity while keeping fullscreen exit and disconnect accessible.

The sharp preset is a **4K/60 target**, not an upscaling promise. Source-size limits, adaptive congestion policy and encoder/browser support determine what actually arrives. The UI keeps targets separate from measured statistics.

## Native capture evidence

On the current 2560×1600 desktop, the opt-in 120-attempt DXGI smoke observed 108 changed-image packets in 2.148 seconds: 33 full and 75 dirty-region updates. Payload totals were 541,482,112 bytes versus 1,769,474,160 bytes if those same updates used full images (about 69.4% fewer bytes in this local sample). This is a capture/IPC payload comparison, **not** an FPS, encoded bitrate, network or input-to-photon benchmark. Static waits and initialization are included; fullscreen animation can trigger full-frame fallback.

## Verification

- PASS: frontend 76/76 tests and production build; Go service tests/build and `go vet`; Rust `cargo check --locked` and 9 normal tests (one opt-in real-capture test remains ignored by default).
- PASS: visible local same-account integration harness; synthetic 2560×1600 stream connected and filled exactly 1280×720; browser measured about 30 received fps / 1 ms synthetic local RTT / 0 packet loss, sharp profile acknowledgment `applied: true`, fullscreen and input readiness. The stream generator itself updates at about 30 fps, so this does not validate 60 fps.
- PASS: device desktop/grid/list navigation, online/offline filters, favorites/search and empty state; the tested 1280×720 view had no horizontal overflow. A compact CSS profile now reduces preview height at short desktop heights while preserving a 44px action-row target; exact hit testing at each production shell/text scale remains to be confirmed.
- PASS: native primary-display sample above; no frame content was written to disk or logs.

## Not verified

- Stable native 4K60, GPU encoder/decoder selection, end-to-end input latency, comparative superiority over UU, weak-network performance, or the current 0.11 APK on a physical tablet. The PC source is 2560×1600, so this session cannot provide a 4K source test.
- Physical Android touch accuracy/IME behavior. The connected USB device was unavailable in this turn.
- Cloud deployment, production signing, migration and second-PC installation.

Install and use matching 0.11 clients with a compatible updated signaling service. APK and Windows builds in `.local/releases/0.11.0-alpha/` are development alpha artifacts; configure the user's own HTTPS signaling origin in app settings.
