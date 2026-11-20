# Remote desktop improvements — 0.12 alpha

This milestone targets the frame-copy bottleneck for sparse screen updates, supports HDR desktop duplication through a tested conversion path, removes a synchronous query from the ordinary GPU frame loop, and surfaces directional connection-health hints inside the full-screen tools panel.

## Sparse multi-region capture

DXGI dirty rectangles are validated, overlapping regions merge conservatively, and sparse disjoint regions remain separate. A cost model compares payload bytes plus per-region headers against one bounding box and a full BGRA frame. It uses a multi-rect packet only when its encoded size and coverage are lower; more than 64 output regions, broad changes, move metadata or invalid metadata use safe fallback. D3D copies each selected region into the retained staging texture and maps once. The WebGL parser checks exact baseline sequence, bounds, lengths and rectangle overlap before applying any region.

## HDR to SDR

When Desktop Duplication returns `DXGI_FORMAT_R16G16B16A16_FLOAT`, the host reads little-endian scRGB half-float pixels and maps them to opaque BGRA8 for the existing SDR WebRTC path. A one-time 65,536-entry lookup table handles half-float conversion, a continuous highlight shoulder compresses values above scRGB reference white, and the standard sRGB transfer curve produces output bytes. This avoids interpreting HDR float bytes as BGRA or changing Windows display settings. Output is tone-mapped SDR, not HDR passthrough; synthetic color conversion tests pass, but the physical smoke returned SDR format 87 rather than HDR float.

HDR conversion uses CPU lookup/packing for changed pixels. Its real CPU cost on a moving 4K desktop has not been benchmarked, so this does not establish 4K60.

## GPU and connection feedback

The CanvasCaptureMediaStreamTrack remains explicitly paced one frame at a time. Per-frame `gl.getError()` was removed because synchronous error queries can serialize the browser and GPU pipelines; errors are checked at setup/texture resize, and context loss triggers normal stream teardown. This should reduce avoidable synchronization, but no isolated GPU wait-time benchmark is available.

The full-screen tools panel now reports directionally valid WebRTC health hints: sender queue/encode pressure, receiver loss/jitter/decode pressure, and high RTT. Static desktops with zero new frames are called out as quiet rather than falsely labeled stalled. RTT is not presented as touch-to-photon latency.

## Validation

- PASS: frontend tests and production build; Go service test/build/vet; Rust `cargo check --locked` and 17 unit tests (one real capture smoke remains operator opt-in).
- PASS: dirty-region pure tests cover disjoint sparse regions, overlap merging, complete pixel coverage, non-overlap, bounds, cost/count fallback and broad updates.
- PASS: binary16 tests cover zero, subnormal, normal, infinity and NaN; tone-map tests cover black, reference white, mid-gray, highlight compression, monotonicity/banding and opaque BGRA channel order.
- PASS: opt-in DXGI SDR capture sample on the current 2560×1600 desktop: 120 packets in 1.162 seconds (1 full, 119 delta, 0 multi-region packets); payload 52,255,948 bytes vs 1,966,082,400 same-sample full-image equivalent (~97.3% fewer). All deltas in this natural desktop sample contained one rectangle, so multi-region wire savings themselves were not observed in the smoke.
- PASS: frontend health tests distinguish receiver and sender counters and leave static low-FPS samples healthy. HDR conversion was covered with synthetic unit data; current physical smoke returned DXGI format 87 (SDR), not HDR float.

## Not verified

- Stable 4K60, 4K source, HDR path on HDR-returning hardware, HDR visual fidelity across applications, full-motion CPU cost, input-to-photon latency, weak-network performance or superiority over UU.
- Physical Android 0.12 interaction/IME, production signing/deployment, or long-duration thermal/power behavior.

Use matching 0.12 clients and compatible signaling service. The ARM64 Android APK is development-signed; production distribution needs the owner's release-signing configuration.
