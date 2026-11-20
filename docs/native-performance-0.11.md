# Native desktop update packets — 0.11

The Windows host previously copied and transferred every changed desktop as a full raw BGRA image. A 3840×2160 image is about 33 MB before encoding, so 60 full updates per second would push nearly 2 GB/s through GPU readback, native IPC and WebView texture upload. Raising the encoded bitrate alone does not remove that local cost.

## Changed-region path

The Desktop Duplication worker now checks DXGI move and dirty metadata after acquiring a frame. When there are no moves and the bounded dirty-rectangle list is valid, it aggregates those rectangles into one conservative bounding box. If the box covers at most 60% of the desktop, `CopySubresourceRegion` updates only that region of the staging texture, and the host copies and sends only those rows/columns. The renderer reuses its GPU texture and applies the received rectangle with `texSubImage2D`.

The first frame, a display-size change, move metadata, missing/invalid/oversized metadata, or a box above the area threshold uses a full update. The bounding box can include clean pixels between dirty regions; it cannot omit a reported change. Move regions intentionally use full fallback so overlapping GPU moves cannot corrupt the retained baseline. Fullscreen video and games may consequently use the full-frame path most of the time.

Cursor-only updates keep the existing 16-byte header and redraw the cursor against the retained desktop texture. They do not perform a full desktop readback. There is still only one native pull in flight, one bounded request slot, and no persistent frame queue. Stop, request cancellation, token expiry and device-session teardown retain the existing authorization and generation checks. No frame contents are written to disk or logs.

## Packet validation

All fields are little-endian. The common first 16 bytes contain width, height and signed cursor X/Y. The high two width bits identify the packet:

| Kind | Marker | Remaining fields |
| --- | --- | --- |
| Cursor / legacy full | 0 | A 16-byte packet is cursor-only; legacy full packets contain width×height×4 bytes after the header |
| Full v1 | `0x40000000` | Sequence, then width×height×4 BGRA bytes |
| Delta v1 | `0x80000000` | Sequence, exact baseline sequence, rectangle count, then each X/Y/width/height header and packed BGRA bytes |

Native currently emits one rectangle per delta. The TypeScript parser accepts at most 64 nonoverlapping rectangles and checks dimensions, GPU texture limits, total pixel limits, exact packet length, positive rectangle sizes, bounds, trailing data, operation marker and sequence order before updating the GPU. A delta requires the exact prior full/delta baseline and the next sequence. A cursor packet cannot initialize a baseline. Full v1 packets can establish a new baseline, but cannot rewind a known sequence. Native sequences do not wrap; exhaustion ends that capture. These packets are private native IPC, not a new remote input capability.

An ordinary full update after one or more deltas replaces the entire GPU baseline, including when display dimensions change. A self-contained full update may bridge a sequence gap. A mismatched or corrupted delta is not applied: the capture session stops rather than displaying silently corrupted pixels. There is currently no separate in-session request-keyframe protocol for this native IPC path. The single-flight Tauri IPC path is local and reliable; network loss is handled later by WebRTC's separate RTP retransmission/keyframe machinery, not by these dirty packets.

## Measurement and limits

The explicit opt-in capture smoke test now reports actual full/delta/cursor packet counts, transferred bytes, the equivalent bytes for the same updates as full images, and total elapsed time. Cursor packets count as 16 bytes in both totals so the reported delta savings do not incorrectly credit the earlier cursor optimization. The timer includes initialization and any waits for desktop changes. It is a local capture/IPC-payload sample, not a WebRTC encode/decode, network or input-to-photon benchmark.

After the visible application is running on an unlocked desktop, an operator can run:

```powershell
$env:REMOTEASSIST_CAPTURE_SMOKE = "1"
$env:REMOTEASSIST_CAPTURE_SAMPLES = "120"
cargo test --locked --manifest-path src-tauri/Cargo.toml primary_display_capture_smoke -- --ignored --nocapture
```

Without the samples override it stops after three image updates or twelve acquisition attempts. The override is bounded to 300 attempts; a static desktop may produce few image updates. This command captures the real primary display in memory only. It must not run as part of unattended ordinary tests.

The frame limit remains a 60 fps target. A full update still needs readback, native IPC and texture upload, and WebRTC still encodes the canvas output. This change is expected to reduce work for text editing and small UI changes; it is not evidence of stable 4K60 or performance superiority to another remote desktop product. No source-size upscale is introduced. Real workload, codec, GPU, decoder and network measurements remain necessary.

## Validation

- PASS: parser tests for full/delta/cursor state, stale/mismatched sequences, invalid dimensions, truncation, out-of-bounds and overlapping rectangles, unknown markers and trailing bytes.
- PASS: full-after-delta replacement, self-contained full recovery over a gap, and display-size baseline replacement.
- PASS: synthetic patch application reconstructs the same pixel buffer as the expected full image.
- PASS: native dirty-bounds tests cover conservative aggregation, invalid/out-of-screen/empty/excessive rectangles and widespread-change fallback.
- PASS: Windows `cargo check --locked`; ordinary native tests pass with the real capture test ignored.
- NOT VERIFIED: sustained 4K60, a physical Android decode test and end-to-end latency. The parent acceptance smoke observed 75 delta and 33 full updates in 2.148 seconds; these packet counts are not an FPS measurement.

## Sources consulted

Accessed 2026-11-20:

- [Microsoft Desktop Duplication API](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api): move regions and dirty regions describe updates relative to the previous acquired desktop; a correct renderer must handle both.
- [Microsoft `GetFrameDirtyRects`](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_2/nf-dxgi1_2-idxgioutputduplication-getframedirtyrects): required buffer sizes and metadata validity are checked before selecting the optimized path.

No dependency was added for this optimization.
