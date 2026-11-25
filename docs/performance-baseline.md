# Performance Baseline

## Current engineering run — 2026-11-25

Source baseline `2e4806f57ecef4bc295a6cdda2e9639a930443a8`, local branch `codex/overnight-engineering-hardening`; initial worktree clean. Host OS Windows 11 x64. Primary output 2560×1600 SDR. Installed GPUs AMD Radeon 780M and NVIDIA RTX 4060 Laptop GPU.

### DXGI request samples

The explicit visible smoke pulls one DXGI frame at a time, validates the packet, and reports numeric counters only. It never writes or prints pixel data. Request-window throughput is a sequential native request burst, not negotiated WebRTC FPS. Native response time includes DXGI acquire/wait, D3D11 copy/map, packet assembly and Tauri IPC response.

| Scene | Pixel frames | Full / delta | Delta regions | Packet bytes / full equivalent | Request window / request rate | Pixel FPS during burst | Reply P50/P95/P99/max |
|---|---:|---:|---:|---:|---:|---:|---:|
| Visible animated UI pattern, 120 pulls | 120 | 1 / 119 | 359 total, 119 multi-region packets | 338,778,700 / 1,966,082,400, 82.8% fewer | 512.8ms / 234.0 requests/s | 234.0 | 3.99 / 5.15 / 5.90 / 18.77ms |
| Ambient desktop after pattern closed, 30 pulls | 3 | 1 / 2 | 3 total, 1 multi-region packet | 18,887,416 / 49,152,060, 61.6% fewer | 1,338.1ms / 22.4 requests/s | 2.2 | 46.35 / 50.99 / 51.13 / 51.13ms |

The synthetic UI sample is not a game or sustained stream test. The ambient run still contained incidental desktop activity, so it is not a strictly static image. A prior quiet-window run yielded 30 empty timeout responses and zero pixel frames. This is expected when DXGI sees no changed pixels; zero changed-frame FPS is not a capture failure. None of these runs provides an optimization A/B comparison.

An earlier smoke implementation logged DXGI format details for each smoke frame. Console redraws contaminated that run, producing a full-frame-only sample; it is excluded from the table. Format logging is now separately gated by `REMOTEASSIST_CAPTURE_FORMAT_DEBUG=1` and emits only when the source format changes. The normal smoke flag no longer enables format logging.

### Capture and presentation diagnostics

- The capture window tracks requests, pixel frames, full/delta packets, dirty-region count, cursor-only packets, empty timeout responses and failed pulls. Summaries are bounded and ride the existing authenticated two-second heartbeat.
- Capture response and WebGL parse/draw-command submission P50/P95 are available after 10 samples. P99/max are withheld until 100 samples. The reported draw metric is CPU-side command submission; it is not a GPU timestamp.
- The receiver reports WebRTC decoded FPS and optional `requestVideoFrameCallback` cadence separately. The callback summary is computed at most four times per second from a 2-second bounded window. It does not measure panel scanout.
- A copyable diagnostic report exports the current metrics using a field whitelist. It omits credentials, candidate addresses, session identifiers, image/video data and input contents. The clipboard action itself has unit coverage for serialization, while packaged-client clipboard permission/behavior has not been verified.
- A sample with a reset counter, zero sample window, stale callback or unavailable browser API remains unavailable. No missing value is rewritten as zero.

### Media path and encoder feasibility

The current Windows path is DXGI Desktop Duplication → D3D11 staging texture → CPU map and BGRA packet → Tauri IPC → WebGL texture upload/draw → `CanvasCaptureMediaStreamTrack` → browser-managed WebRTC encoding. Damage metadata chooses bounded non-overlapping delta packets with cost-checked full-frame fallback. scRGB HDR is tone-mapped to SDR on CPU.

`getStats()` now records the negotiated codec and browser-reported encoder/decoder implementation when exposed. The host reports an RTX 4060 Laptop GPU and Radeon 780M. `nvidia-smi` showed zero active encoder sessions when checked outside a live RemoteAssist stream, so hardware selection in a real session remains UNVERIFIED. The source has no native NVENC, AMF, QSV or Media Foundation encoder path and no vendor SDK dependency. Direct D3D11 texture sharing is a research candidate, not a verified optimization.

GPU execution timing remains unavailable. Hardware encoding, 1440p60/4K60 sustained output and physical input-to-display delay remain UNVERIFIED.

## Current automated and build results

- Frontend: `npm test` PASS, 113/113. `npm run build` PASS.
- Go server: `go test ./...`, `go vet ./...`, and `go build ./cmd/signaling` PASS.
- Go module cache: `go mod verify` PASS for the modules already downloaded.
- Rust: `cargo fmt --check`, `cargo check --locked`, and `cargo test --locked` PASS. 23 tests passed and one visible-desktop smoke test is ignored by default.
- Explicit DXGI smoke: PASS for the animated pattern with `REMOTEASSIST_CAPTURE_REQUIRE_FRAME=1`. Empty/static scene results are reported as empty responses, not as fabricated throughput.
- Compose syntax: `docker compose --env-file deploy/.env.example -f deploy/docker-compose.yml config --quiet` PASS. This does not validate an actual deployment.
- `npm audit`: PASS, zero reported vulnerabilities.
- Rust dependency tree: inspected from `Cargo.lock`; Tauri/Reqwest build and runtime graphs contain several transitive versions. No dependency was added or upgraded.
- Windows x64 NSIS installer: PASS, 2,429,607 bytes, SHA-256 `B11CC44CBE8984D85359F5CF64086B9E6B319A4DB5CF236916091BA48B0613E2`, `NotSigned`.
- Portable Windows EXE: PASS, 10,604,032 bytes, SHA-256 `36954B133AFF4406B87679172F71F74CEED0B07C2731244663AA5B1573F2DCBA`, `NotSigned`.
- LAN test NSIS installer: PASS, 3,213,539 bytes, SHA-256 `66F5CD8B01B2B8EA8CB4891638411C622E19F0082905A5F97BFBCBF1EDDF3026`, configured for `192.168.1.102:8080`. Generated CSP allows Tauri IPC, loopback and that exact HTTP/WS origin.
- Release artifacts contain no production signaling domain. They build and package successfully but need a configured HTTPS service before operational use.

## Verification gaps

- Go race: NOT VERIFIED. Windows Go reports `CGO_ENABLED=0`, no compiler is installed, and WSL has no Go toolchain. `go test -race` refuses to run without cgo. Existing repository CI runs Race on Ubuntu, but this branch was not pushed and no remote CI result is claimed.
- Go advisory scan: NOT VERIFIED. `govulncheck` download from `proxy.golang.org` timed out. Rust advisory scan: NOT VERIFIED because `cargo-audit` and its advisory database were unavailable.
- No physical second Windows PC, two-account code session, same-account session, public DNS/TLS, TURN UDP/TCP, weak-network run, 30-minute session, or route-change recovery was tested in this run.
- No sustained WebView2 encoder selection/FPS, actual monitor scanout, 4K game capture or physical input-to-photon P50/P95 was measured. A synchronized optical measurement is required for input-to-display latency.

## Historical repository baseline

The prior repository record measured a different 2560×1600 sample with 120 packets, 1 full and 119 delta, and approximately 97.3% less payload than full-frame equivalents. Prior package hashes and test counts in earlier sections of `STATUS.md` describe their recorded source revisions and are historical, not this run's build output.
