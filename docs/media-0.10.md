# Media quality and latency targets — 0.10

Reviewed 2026-11-20. These are configured ceilings and deterministic transport behaviors. They are not a claim of measured 4K60 delivery on the connected tablet.

## Source-aware 4K / 60 fps target

The old sender used 1.8 Mbps / 20 fps in Balanced and at most 4 Mbps / 30 fps in Sharp, even for the 2560×1600 source reported in the real-device session. The new Sharp target starts at 60 fps and 16 Mbps for a 1920×1080 source, increasing its bitrate budget by encoded pixel count to a 40 Mbps maximum. A 3840×2160 source can therefore request 40 Mbps / 60 fps at its original size. Smaller sources are never upscaled. Sources beyond 3840×2160 are scaled down to fit that bounding box while preserving aspect ratio.

| Profile | 1080p ceiling | FPS ceiling | Resolution policy |
| --- | --- | --- | --- |
| Sharp | 16 Mbps | 60 | Original size, bounded to 4K |
| Balanced | 8 Mbps | 60 | Original size, bounded to 4K |
| Constrained | 3 Mbps | 30 | Preserve original text resolution |
| Economy | 1 Mbps | 15 | Scale down by at least 2 |

These base budgets scale with the actual encoded pixels, between 0.5× and 2.5×. Text preference intentionally caps at 15 fps for mostly static documents. Motion preference uses up to 45 fps with 1.5× downscaling in Constrained. The automatic/default path requests the 60 fps ceiling. The host capture itself must produce frames at that rate; these parameters cannot manufacture frames or extra source resolution.

HostPeer now seeds `addTransceiver(...sendEncodings)` before the first offer, applies sender parameters again after local/remote descriptions, and samples quality every 1.5 seconds. Previously an initial connected stream could wait for the three-second monitor before receiving application encoding settings. Parameter application is serialized and browser rejection falls back to a reported “Browser managed” state. Existing hysteresis still requires two pressure samples to step down one level and three healthy samples to step up. Measured local RTP send queue delay prevents a bandwidth estimate alone from driving premature upgrades.

The app does not claim or force hardware encoding. Codec negotiation stays with the browser because advertised codec support does not prove that a hardware encoder, its 4K profile, or the tablet's hardware decoder is available. A high bitrate/quality target does not disable the browser's congestion controller. Poor Wi-Fi, CPU load, source capture cost, encoder limits, decoder limits and display refresh can lower actual FPS or resolution.

## Pointer and receive delay

The latest-position pointer queue now paces at 90 updates per second rather than 50. A fresh pointer can be delivered within a 60 Hz display interval, while remaining below the existing 120 input-events/sec gate with room for normal button/key input. The queue still retains only the newest pending movement, expires unsent motion after 150 ms, and discards it at click/release/disconnect barriers. This changes application pacing only; it does not remove the network round trip or video feedback delay.

When supported, the receiver requests `jitterBufferTarget = 30` milliseconds. This is a preferred buffer hold duration that balances delay against network jitter; it is not a zero-latency guarantee and unsupported/throwing WebViews retain browser defaults. No experimental codec or playout-delay SDP rewrite is used.

## Real statistics and visible input failures

Video telemetry separates actual interval FPS and video throughput from configured `targetFps` / `targetBitrateKbps` and the encoder's optional current `targetBitrate` estimate. Multiple simulcast streams do not have their frame rates added together; bitrate still sums streams. Missing counters remain unavailable rather than pretending to meet the target. Resolution, decoder/encoder time, packet loss, frame-drop counters, queue delay and network RTT keep their existing semantics. RTT is not input-to-photon latency.

Authenticated input failures are no longer all swallowed. Stale unordered motion after a sequence barrier remains intentionally ignored. Other rejected/limited input generates a bounded, at-most-once-per-second `input_status` message containing only a category and cumulative rejected count. It contains no input content, coordinate, key, token value or native exception text. Losing authorization or failing native delivery safely ends the connection. The controller exposes the count through `onInputStatus` for product feedback.

## Official sources consulted

- [MDN: RTCRtpSender.setParameters](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/setParameters), accessed 2026-11-20. `maxBitrate` and `maxFramerate` are upper bounds, and `scaleResolutionDownBy = 1` preserves the source size.
- [MDN: RTCRtpReceiver.jitterBufferTarget](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpReceiver/jitterBufferTarget), accessed 2026-11-20. The preferred hold duration uses milliseconds and trades playout delay against running out of frames; browser support varies.
- [W3C: Identifiers for WebRTC's Statistics API](https://www.w3.org/TR/webrtc-stats/), accessed 2026-11-20. Used for cumulative frame/time/byte counters, current encoder target bitrate and local packet send-delay semantics.

## Validation

PASS: deterministic tests for 4K60 ceilings, no source upscaling, the over-4K bounding scale, source-dependent bitrate, high-startup pressure hysteresis, fresh pointer pacing, bounded pointer expiry/backpressure/release barriers, distinct encoder target/actual throughput, and non-summed simulcast FPS. The full frontend regression suite passes. TypeScript compilation passes.

NOT VERIFIED: sustained real-device 3840×2160 at 60 decoded/rendered fps, hardware codec path, p50/p95 touch-to-photon latency, Android receiver buffer-hint behavior and weak-network calibration. The current native raw-frame IPC capture path also needs measurement; its throughput can be a bottleneck even when the WebRTC sender is allowed 4K60.

No package was added for this media/transport change.
