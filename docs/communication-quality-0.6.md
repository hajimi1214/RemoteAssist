# Communication and quality changes in 0.6

Reviewed 2026-11-20. This milestone follows the user's supplied research document about professional remote desktop pipelines and the existing project constraints. The document was read as source material, not as executable instructions.

Source document: 专业级远程桌面升级研究：从“能用”到低延迟、高画质、弱网稳定、可与顶级产品竞争.docx. SHA-256: `445ca2907fe449e47170e1b7f6796cb619d3f576d1b314d1a742cff79d66510b`. The original file is unchanged and is not copied into the repository.

## What was adopted from the research

The report argues for measuring bottlenecks before chasing headline FPS or bitrate. This fits the current Tauri/WebRTC architecture: expose available browser statistics, bound queues and negotiation, and provide user-oriented encoding preferences.

The source document's sections on frame pacing, queues and observability support the local diagnostics panel. Its GPU zero-copy, hardware encode/decode, HDR/4:4:4, virtual-display and native rendering proposals are a separate architecture roadmap. A browser PeerConnection cannot promise those capabilities, and this release does not claim to implement them or match a commercial product's benchmark.

Some supplied citations point to a Sunshine mirror or old paginated release listings. They are not used as proof of a current implementation. The primary normative source used for formulas is [W3C Identifiers for WebRTC's Statistics API](https://www.w3.org/TR/webrtc-stats/), accessed 2026-11-20. Relevant fields include totalEncodeTime/framesEncoded, totalDecodeTime/framesDecoded, jitterBufferDelay/jitterBufferEmittedCount, packetsLost, framesDropped and freezeCount.

## Communication fixes

- Heartbeats now correlate bounded probe IDs with local monotonic send times. A pong slower than the two-second send interval is still accepted for its own probe; duplicates/expired/unknown probes are ignored.
- No authenticated keepalive for eight seconds ends control. Host and controller both watch the channel; existing native authorization leases remain independent.
- Peer negotiation has a 25-second limit, separate from the 15-second signaling-ready limit. Only the reliable input channel opening marks the usable connection boundary.
- ICE/TURN configuration is fetched immediately before negotiation. A long host-approval wait no longer consumes short-lived relay credentials before they are used.
- Pointer events use a bounded latest-value queue rather than dropping the last event in a burst. Button/release events cancel queued older motion before assigning sequence numbers.
- Input, heartbeat and signaling sends check buffers and handle send failures. Both peer types share teardown and signaling lifecycle code; queued signal processing is capped.
- No automatic restoration of remote control is added. Reconnection requires a new host-approved session.

## Quality behavior

Four adaptive levels replace an abrupt full-resolution-to-half-resolution switch. Downgrades require two consecutive pressure samples; upgrades require three healthy samples. Transitions move one level at a time. Missing samples reset a pressure streak and preserve the current level.

| Level | Ceiling bitrate | Ceiling fps | Default resolution scale |
| --- | --- | --- | --- |
| Economy | 650 kbps | 12 | 2 (half width/height) |
| Constrained | 1.1 Mbps | 12 | 1 (preserve text size) |
| Balanced | 1.8 Mbps | 20 | 1 |
| Sharp | 4 Mbps | 30 | 1 |

Host preferences:

- Automatic balances the existing desktop settings.
- Text favors original resolution and caps fps at 15, with text content hints.
- Motion uses a motion hint and frame-rate preservation; Constrained uses 20 fps and 1.5 resolution scaling.

These are ceilings and best-effort hints. The browser remains responsible for congestion control and codec selection; hardware acceleration is not guaranteed. Static desktop low bitrate/fps does not itself trigger degradation.

## Diagnostics and units

Statistics are sampled every three seconds on the sender and two seconds on the receiver. Only the newest aggregate is shown; no input content, frames, SDP, addresses or secrets are retained or uploaded.

- Actual bitrate: delta(bytes) × 8 / delta(timestamp in ms), reported in kbps.
- Encoded/decoded fps: delta(frames) × 1000 / delta(timestamp in ms).
- Interval receiver loss: delta(lost) / (delta(received) + delta(lost)); absent when no packet denominator exists.
- Mean encode/decode duration: delta(total time in seconds) / delta(frames), converted to ms.
- Mean jitter-buffer residence: delta(jitterBufferDelay in seconds) / delta(jitterBufferEmittedCount), converted to ms.
- Mean local send queue: delta(totalPacketSendDelay in seconds) / delta(packetsSent), converted to ms. This excludes network propagation and is not a frame delay.
- Frame drops are interval deltas; freezeCount remains the browser's cumulative session count. Network jitter and transport RTT are labeled separately.

Counter resets/source replacement never yield negative rates; first samples and unsupported fields show unavailable. Encoding duration excludes packetization; jitter-buffer residence does not equal decode time; none of these is input-to-photon latency. Proving end-to-end latency still needs a controlled two-machine measurement.

## Deferred architecture work

1. Native capture/encoder capability inventory and verified GPU surface flow (DXGI/WGC → vendor encoder), preserving visible host consent.
2. Hardware/driver matrix before claiming AV1, 4:4:4, HDR or high-refresh operation.
3. Controlled LAN and weak-network traces measuring p50/p95/p99 frame and input behavior; no improvement percentages are claimed here.
4. Multiple TURN locations and authenticated health probes only after real cloud deployment establishes a baseline.
