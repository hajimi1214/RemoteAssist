# Verification Matrix

This matrix describes evidence from the current source and current-machine checks. `VERIFIED` means a direct runtime check of the named scope. `AUTOMATED` means regression tests or a synthetic loopback cover the behavior, without proving it on a second physical endpoint. `IMPLEMENTED` means the code exists but the behavior is not sufficiently exercised. `UNVERIFIED` means the environment or evidence is missing. `UNSUPPORTED` means the product does not provide the capability.

| Area | Status | Evidence and scope |
|---|---|---|
| Windows DXGI primary-display capture | VERIFIED, limited sample | Explicit visible Windows smoke on 2560×1600. A 120-pull animated UI sample produced 120 valid packets. A second ambient desktop run reported 3 packets and 27 empty timeouts. Smoke reports request-window rate and P50/P95/P99/max latency. Neither is a sustained WebRTC stream benchmark. |
| DXGI dirty rectangles and move rectangles | AUTOMATED | Region planning, bounds, overlap, merge and pixel-coverage regressions pass. Visible samples emitted 27 and 31 delta regions. Multiple dirty rectangles from natural gameplay have not been evaluated. |
| DXGI SDR/HDR format conversion | AUTOMATED | Binary16 conversion, monotonic tone mapping and format-change baseline tests pass. Visible tests received BGRA8. Real HDR output/color fidelity is UNVERIFIED. |
| GPU image processing | IMPLEMENTED | Browser WebGL shader swaps BGRA to RGBA and draws deltas. No GPU timestamp query or device-level image-processing latency measurement exists. |
| Canvas video encoding | IMPLEMENTED | `canvas.captureStream(0)` and WebRTC sender parameters are used. Physical selected encoder and sustained bitrate/FPS are UNVERIFIED. |
| NVENC / AMF / QSV / Media Foundation | UNVERIFIED | Host has Radeon 780M and RTX 4060 Laptop GPU. No native integration exists. `nvidia-smi` showed zero active encoder sessions when checked. |
| Codec negotiation | AUTOMATED | WebRTC stats report negotiated codec when exposed; synthetic loopback coverage exists. Hardware acceleration and real WebView2 codec behavior are UNVERIFIED. |
| WebRTC peer/signaling protocol | AUTOMATED | Session API, WebSocket auth, offer/answer/ICE validation and loopback regressions. Two physical Windows endpoints, public ICE and TURN routes are UNVERIFIED. |
| Direct P2P and TURN route labeling | AUTOMATED | Selected candidate-pair and relay-protocol unit tests pass. Real WAN/TURN/UDP/TCP operation is UNVERIFIED. |
| TURN credential issuance | AUTOMATED | HMAC short-lived credentials, expiry bounds, and configuration checks exist and are covered. Public Coturn allocation and credentials against deployed DNS/EIP are UNVERIFIED. |
| Receive decode and presentation | AUTOMATED | RTCStats interval calculations are tested. WebView frame callback sampling is tested with synthetic counters. A second Windows installation and monitor scanout are UNVERIFIED. |
| Mouse absolute, relative, buttons, wheel | AUTOMATED | Mapping, coalescing, sequencing, validation and low-rate tests pass. Native game behavior and physical input-to-display are UNVERIFIED. |
| Keyboard, text and release-all | AUTOMATED | Event schema, authorization, payload, rate, expiry and release tests pass. Physical multi-key/game title compatibility is UNVERIFIED. |
| Native input expiry, lease and queue ordering | AUTOMATED | Rust tests cover token mismatch, event limits, expiry, heartbeat lease and pressed-input tracking. Frontend gate tests serialize IPC delivery, recheck authorization while queued and revoke on a saturated release edge. A physical disconnect/expiry test is UNVERIFIED. |
| Same-account device authorization | AUTOMATED | Go API tests enforce account/device ownership, online/revocation checks, direct-session activation and expiry. Physical two-device behavior is UNVERIFIED. |
| One-time Remote Assist code | AUTOMATED | Go session tests cover one-time code create/join/approve/expiry. Browser validated code-entry UI and invalid-code response. Different physical accounts joining and controlling a real Windows host are UNVERIFIED. |
| Capture diagnostics | AUTOMATED | Bounded P50/P95 windows, P99/max after 100 samples, parser validation and capture window counters have unit coverage. Browser presentation callback sampling is throttled to 4Hz and has tests for resets/staleness. Runtime metrics in a real RemoteAssist WebRTC session are UNVERIFIED. |
| Diagnostic report export | AUTOMATED | Field-whitelist report serialization, unavailable-value labels, media/capture/presentation fields and omission of identifiers/addresses are unit-tested. Clipboard permissions and user copy flow are not yet verified on a packaged client. |
| PostgreSQL migrations | AUTOMATED | Migration runner rollback/serialization tests and static migration/mirror checks pass. Migration 002 adds case-insensitive identity indexes after duplicate preflight. Applying that migration against a live PostgreSQL database is UNVERIFIED. |
| Windows development/release build | VERIFIED | Current Windows Rust check/tests pass. Current x64 NSIS installer builds, is unsigned, and contains no production service domain. Installing it on a second PC is UNVERIFIED. |
| Windows second-PC installation | UNVERIFIED | No current second-machine install result. |
| Android controller | IMPLEMENTED | ARM64 APK workflow exists. Current build/device behavior for this source revision is UNVERIFIED. |
| System/game audio | UNSUPPORTED | No WASAPI loopback, Opus audio track, playback, mute or audio/video sync pipeline is implemented. |
| Multi-monitor/rotation/HDR output | UNVERIFIED | Current capture targets the primary display. Real rotated/secondary display mapping, HDR output fidelity and DPI input mapping need device tests. |
| 30-minute session and recovery | UNVERIFIED | No physical long-duration, route-change or power/network-interruption run this turn. |
| Go race detector | UNVERIFIED | Windows Go has `CGO_ENABLED=0`; no Windows C compiler or WSL Go toolchain was present. Normal Go tests and `go vet` pass. The repository CI job is configured to run Race on Ubuntu, but the local branch was not pushed and has no remote CI result. |
| Go module checksums | VERIFIED | `go mod verify` reports all cached modules verified. |
| npm dependency audit | VERIFIED | `npm audit` reported 0 vulnerabilities. |
| Go/Rust advisory scan | UNVERIFIED | `govulncheck` download timed out because the configured Go proxy was unreachable. `cargo-audit` is not installed and its advisory database is unavailable. |

No test result in this matrix implies that physical input-to-photon latency, panel scanout, 4K60 gameplay or public relay capacity was measured.
