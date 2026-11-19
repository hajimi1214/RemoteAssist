# 0.4 research and engineering decisions

Reviewed 2026-11-20. This release uses verified standards and selected recent research; it does not claim to implement a paper's transport algorithm or reproduce published performance gains.

## Sources and decisions

| Primary source | Evidence used | Decision in RemoteAssist |
| --- | --- | --- |
| [W3C WebRTC 1.0 Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/) | `RTCRtpSender.setParameters` controls encoding limits; it does not replace transport congestion control. | Apply three bounded encoder profiles through the browser API; leave congestion control to WebRTC. Fall back to browser-managed encoding if parameters are unsupported. |
| [W3C WebRTC Stats CR Draft, 2025-09-25](https://www.w3.org/TR/2025/CRD-webrtc-stats-20250925/) | The selected candidate pair identifies the active route. Bandwidth estimates can be absent; encoder limits distinguish CPU and bandwidth pressure. | Read the selected pair and both candidates, preserve the current profile when evidence is missing, use sustained samples before changing profiles, and include CPU encoder pressure in downgrade decisions. |
| [W3C Content Hints Working Draft, 2025-09-19](https://www.w3.org/TR/2025/WD-mst-content-hint-20250919/) | `text` is a hint for text-heavy video and resolution preservation. | Set capture content hint to `text` and prefer maintaining resolution. Balanced profile keeps original dimensions; Economy reduces them under sustained pressure. Hints are best effort. |
| [RFC 8831](https://www.rfc-editor.org/rfc/rfc8831) and [RFC 8832](https://www.rfc-editor.org/rfc/rfc8832), January 2021 | DataChannels support reliable ordered and partially reliable unordered delivery. | Separate disposable absolute pointer motion (`ordered:false`, `maxRetransmits:0`) from reliable button/key/release messages. Sequence numbers reject stale motion across channels; clicks carry their own coordinates. |
| [Sunshine input implementation](https://github.com/SunshineStream/Sunshine/blob/master/src/input.cpp), [release v2026.914.233613](https://github.com/SunshineStream/Sunshine/releases/tag/v2026.914.233613) | Mature streaming software tracks held inputs and resets them at disconnection; coordinate mapping accounts for stream/output geometry. | Independently implement held-key/button tracking, release on blur/disconnect/expiry/window close, and aspect-fit video coordinate mapping. No Sunshine code was copied; the project is GPL-3.0. |
| [Camel: Frame-Level Bandwidth Estimation for Low-Latency Live Streaming under Video Bitrate Undershooting, WWW 2026, arXiv v1 2026-02-10](https://arxiv.org/html/2602.09500v1) | Application-limited or undershooting video can distort bandwidth inference. Camel needs frame-level feedback and packet pacing control. | Never treat a static desktop's low send bitrate as proof of network congestion. Use WebRTC's estimates and encoder limitation reason. Camel itself is not implemented because browser APIs do not expose its pacing controls. Paper license: CC BY-NC-SA 4.0; cited ideas only. |
| [Dynamic Pacing for Real-time Satellite Traffic, v2 2025-10-01](https://arxiv.org/abs/2507.09798v2) | Queue behavior and network transition context matter; the proposal is specific to predicted satellite handovers. | Keep input queues bounded. Do not introduce satellite-specific prediction into a general-purpose remote assistance client. Paper license: CC BY 4.0. |

## Applied profiles

| Profile | Maximum video bitrate | Maximum fps | Resolution scale |
| --- | --- | --- | --- |
| Economy | 650 kbps | 12 | Half each dimension |
| Balanced | 1.8 Mbps | 20 | Original dimensions |
| Sharp | 4 Mbps | 30 | Original dimensions |

These are application ceilings, not guaranteed throughput or measured performance targets. Samples are read every three seconds. Two consecutive constrained samples lower quality; three consecutive qualifying samples raise it. Missing/invalid estimates do not trigger an upgrade. All statistics remain in the client; no screen recording or external telemetry was added.

## Transport and lifecycle

WebSocket authentication moved to a first frame, limited to 2 KiB and five seconds. URLs contain only session ID and role. The server removes session tokens from forwarded signaling. Old clients are deliberately incompatible: upgrade both endpoints and the signaling server together.

The server closes both peers after rejection, disconnection, or expiry. A one-second watcher catches idle session expiry; Windows separately rejects input at its local expiry deadline and releases held input. After a 30-second initial negotiation lease, authenticated DataChannel heartbeats renew an eight-second native input lease. A 500 ms native watcher revokes stale permission even if WebView timers stop. Normal session duration defaults to 30 minutes from creation (`SESSION_ACTIVE_TTL`, 1 minute to 8 hours), while the invitation code lasts five minutes. Ending sessions is fail-closed; automatic control resumption is not implemented.

## Validation and limits

- Deterministic tests cover adaptive profile hysteresis, invalid/missing estimates, CPU pressure, active-route selection, pointer letterboxing, and cross-channel input ordering.
- The real browser loopback harness in `tests/webrtc-loopback.html` uses two RTCPeerConnections with generated canvas video and a simulated native input sink. It checks video/latency, encoder parameters, dual input channels, input authorization, and shutdown. It never captures the desktop or injects OS input.
- Go tests use actual local WebSocket connections for first-frame authentication, role exclusivity, host approval, token redaction, disconnect, and idle expiry. Migration tests use a transactional SQL test driver, not live PostgreSQL.
- Native tests exercise input authorization/expiry, tracked input state, and signed wheel delta encoding without moving the user's mouse or typing keys.
- Two Windows machines, restrictive NAT/TURN, hardware encoding, desktop capture coordinate calibration, and real degraded networks still require acceptance testing. No latency or bandwidth improvement percentage is claimed.

## Next useful investments

1. Calibrate primary-monitor/window/multi-monitor capture geometry with Windows capture APIs; current native coordinate mapping remains primary-display based. Non-monitor capture is rejected and the native consent prompt requires the user to confirm the primary full display; automatic primary-display identification is not implemented.
2. Run a reproducible two-machine benchmark: 30/100/300 ms RTT, 0/1/3% loss, constrained bandwidth, resolution/fps/CPU/freeze-time measurements.
3. Add optional native hardware encoding only after profiling shows WebView capture/encoding is the bottleneck. AV1/WebCodecs or a new congestion controller is not automatically beneficial.
4. Persist session audit metadata and add coordinated state/pub-sub before running multiple signaling replicas. Current active sessions remain single-process and end on restart.
