# Transport refinement: bounded pointer delivery and sender queue pressure

Reviewed 2026-11-20 against the official sources below. These changes keep the existing WebRTC transport, codec negotiation, explicit host approval, input lease, and fail-closed disconnect behavior. They add no dependency and no automatic reconnection or restoration of control.

## 1. Preserve the final pointer position during brief backpressure

Previously, `LatestPointer` removed a position before attempting the DataChannel send. If the channel buffer exceeded 8 KiB, `deliverInput` dropped that position. When the user stopped moving, there was no subsequent event to deliver the final position after congestion cleared.

The sender now reports whether delivery was accepted. The queue retains only the newest unsent position while the channel is temporarily full. It retries on `bufferedamountlow` at a 4 KiB low-water mark, with the existing 20 ms pacing timer as a bounded fallback. A queued position expires 150 ms after its most recent replacement; delayed timers check its age before sending. The age limit applies to the application's unsent position, not bytes already accepted by SCTP.

Mouse buttons, release-all, disconnect, and peer teardown still discard pending motion. Sequence numbers are allocated only when actually attempting a send. Clearing a closed peer also removes the buffer event handlers. Keys and button releases stay on the reliable channel and never enter the pointer retry queue. Buffer events cannot reopen a connection or grant input authorization.

The 150 ms lifetime and 4/8 KiB thresholds are product choices, not values prescribed by WebRTC. This bounds stale application motion while covering short local queue spikes. Persistent congestion can still drop pointer updates intentionally.

## 2. Respond to sustained local RTP queue delay

The diagnostics sampler already calculates mean local packet send delay as:

`delta(totalPacketSendDelay) / delta(packetsSent) * 1000` milliseconds.

This signal now participates in the existing sender quality policy. A high bandwidth estimate alone no longer causes a quality upgrade while the measured local send queue remains elevated.

| Mean local packet delay | Policy effect |
| --- | --- |
| More than 120 ms | Request the Economy ceiling, stepping down one level at a time |
| More than 50 ms | Request the Constrained ceiling, stepping down one level at a time |
| 25–50 ms | Do not upgrade quality |
| Less than 25 ms | Permit the existing bandwidth/RTT recovery checks |
| Unavailable | Use the existing bandwidth/RTT/encoder signals |

Two consecutive pressure samples are still needed to step down; three healthy samples are needed to step up. Sampling remains every three seconds. A single spike does not change the profile. Zero-packet intervals, unsupported counters, and counter resets remain unavailable rather than being treated as a healthy zero-delay measurement. A pressure ceiling never upgrades an already lower profile: continued CPU or queue pressure cannot promote Economy to Constrained.

The multi-stream limitation aggregation also preserves `bandwidth` pressure when a later stream reports `none`, using the documented priority bandwidth, CPU, other, none. The previous iteration-order-dependent aggregation could erase a real bandwidth limit.

These thresholds are conservative application heuristics that require weak-network calibration. They do not alter the browser's congestion controller. `maxBitrate` and `maxFramerate` remain upper bounds, not promised throughput or frame rates. The queue statistic measures time between RTP packetization and handoff to the OS socket; it excludes network transit, rendering, and input-to-photon latency. No physical signal-strength improvement or latency reduction percentage is claimed.

## Sources actually consulted

- [MDN: RTCDataChannel bufferedamountlow event](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedamountlow_event), accessed 2026-11-20. The event fires when buffered bytes cross from above to at or below `bufferedAmountLowThreshold`; it is used as a delivery opportunity, with an age-bounded timer fallback.
- [W3C: Identifiers for WebRTC's Statistics API](https://www.w3.org/TR/webrtc-stats/#dom-rtcoutboundrtpstreamstats-totalpacketsenddelay), accessed 2026-11-20. Defines `totalPacketSendDelay`, `packetsSent`, and the quality-limitation reason priority. The delay counter advances with transmitted packets and is cumulative, requiring interval deltas.
- [MDN: RTCRtpSender.setParameters](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/setParameters), accessed 2026-11-20. Defines encoding ceilings and `degradationPreference`; no unsupported decoder-buffer setting or codec promise is introduced.

## Validation

- PASS: deterministic regressions for final-position delivery after buffer drain, latest-value replacement, pacing, pointer expiry after a delayed timer, discard/close barriers, and synchronous send failure without a new timer.
- PASS: deterministic policy regressions for persistent/transient/invalid queue samples, gradual recovery, no promotion under continued pressure, and stream-order-independent limitation aggregation.
- PASS: telemetry regression for idle, missing, reset, and subsequently valid packet-send counters.
- PASS: `npm test`, 48 tests.
- NOT VERIFIED: real two-machine weak-network behavior, p50/p95 input-to-photon latency, browser/WebView2 buffer-event behavior under sustained congestion, and hardware encoder performance. Unit tests establish queue and policy behavior; they are not network benchmarks.
