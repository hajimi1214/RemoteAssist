# Performance Baseline

## Current engineering run — 2026-11-25

Source baseline `2e4806f57ecef4bc295a6cdda2e9639a930443a8`, local branch `codex/overnight-engineering-hardening`; initial worktree clean. Host OS Windows 11 x64. Primary output 2560×1600 SDR. Installed GPUs AMD Radeon 780M and NVIDIA RTX 4060 Laptop GPU.

M28 follow-up source state continues from commit `bd9334c8daeeccec4d81157330d575aec89e9fa7`. It adds capability-gated, asynchronous WebGL GPU timing and updates Go/Rust dependency versions after advisory scans. No release version change or push was made.

M30 follow-up adds one-click direct-device entry and full-window control, and limits each DXGI acquire wait to the sender frame interval. It changes request scheduling but does not itself demonstrate a measured latency or sustained-FPS improvement.

M30 follow-up on 2026-11-26 changes the automatic encoder policy startup from `Sharp` to `Balanced`. For a 3840×2160 source, the configured initial bitrate ceiling changes from 40 Mbps to 20 Mbps. The policy still uses measured WebRTC headroom before upgrading, while a manually selected sharp profile keeps its previous ceiling. This is a bounded startup-load change; no physical before/after session was measured.

A same-browser Chromium WebRTC loopback then observed the initial Balanced HostPeer profile before a controller-selected game profile. For the synthetic 640×360 source, the game target ceiling was 1,120 kbps. A separate generated-canvas preview confirmed the viewer filled a 1280×720 viewport and auto-enabled input after video metadata. These checks cover browser behavior only, not a physical Windows session.

### DXGI request samples

Two opt-in smokes on 2026-11-26 failed before receiving a frame. In each, `DuplicateOutput1` rejected the preferred BGRA format with `DXGI_ERROR_UNSUPPORTED (0x887A0004)`; the `DuplicateOutput` compatibility fallback returned `E_ACCESSDENIED (0x80070005)`. The smoke wrote no pixels. These runs are FAIL; whether a protected/unavailable desktop session or a product issue caused them remains UNVERIFIED. The Windows automation helper also denied cursor access in this session. Further capture attempts await an unlocked desktop.

The explicit visible smoke pulls one DXGI frame at a time, validates the packet, and reports numeric counters only. It never writes or prints pixel data. Request-window throughput is a sequential native request burst, not negotiated WebRTC FPS. Native response time includes DXGI acquire/wait, D3D11 copy/map, packet assembly and Tauri IPC response.

| Scene | Pixel frames | Full / delta | Delta regions | Packet bytes / full equivalent | Request window / request rate | Pixel FPS during burst | Reply P50/P95/P99/max |
|---|---:|---:|---:|---:|---:|---:|---:|
| Visible animated UI pattern, 120 pulls | 120 | 1 / 119 | 359 total, 119 multi-region packets | 338,778,700 / 1,966,082,400, 82.8% fewer | 512.8ms / 234.0 requests/s | 234.0 | 3.99 / 5.15 / 5.90 / 18.77ms |
| Ambient desktop after pattern closed, 30 pulls | 3 | 1 / 2 | 3 total, 1 multi-region packet | 18,887,416 / 49,152,060, 61.6% fewer | 1,338.1ms / 22.4 requests/s | 2.2 | 46.35 / 50.99 / 51.13 / 51.13ms |

The synthetic UI sample is not a game or sustained stream test. The ambient run still contained incidental desktop activity, so it is not a strictly static image. A prior quiet-window run yielded 30 empty timeout responses and zero pixel frames. This is expected when DXGI sees no changed pixels; zero changed-frame FPS is not a capture failure. None of these runs provides an optimization A/B comparison.

An earlier smoke implementation logged DXGI format details for each smoke frame. Console redraws contaminated that run, producing a full-frame-only sample; it is excluded from the table. Format logging is now separately gated by `REMOTEASSIST_CAPTURE_FORMAT_DEBUG=1` and emits only when the source format changes. The normal smoke flag no longer enables format logging.

### Capture and presentation diagnostics

- The capture window tracks requests, pixel frames, full/delta packets, dirty-region count, cursor-only packets, empty timeout responses and failed pulls. Summaries are bounded and ride the existing authenticated two-second heartbeat.
- DXGI `AcquireNextFrame` wait now follows the capture request's target FPS interval, capped at 40 ms. At 60 FPS this requests a 17 ms maximum wait, at 30 FPS 34 ms. An idle desktop may still return an empty timeout. The earlier installed build used a fixed 40 ms wait. No controlled performance A/B or physical input-to-display measurement has been performed.
- Automatic sessions now begin at the balanced sender profile. The 4K configured ceiling is 20 Mbps, half the former sharp startup ceiling of 40 Mbps. Configured ceilings are not observed throughput or achieved FPS. No two-PC comparison is available yet.
- Capture response and WebGL parse/draw-command submission P50/P95 are available after 10 samples. P99/max are withheld until 100 samples. The reported draw metric is CPU-side command submission; it is not a GPU timestamp.
- When `EXT_disjoint_timer_query` is exposed, GPU upload/draw execution is sampled once per 30 drawn pixel updates, with a maximum of eight pending queries. Results are read only after availability is reported. P50/P95 require 10 GPU results; P99/max require 100. Unsupported, disjoint, malformed or missing samples stay unavailable. No packaged WebView2 runtime sample was captured in this turn.
- The receiver reports WebRTC decoded FPS and optional `requestVideoFrameCallback` cadence separately. The callback summary is computed at most four times per second from a 2-second bounded window. It does not measure panel scanout.
- A copyable diagnostic report exports the current metrics using a field whitelist. It omits credentials, candidate addresses, session identifiers, image/video data and input contents. The clipboard action itself has unit coverage for serialization, while packaged-client clipboard permission/behavior has not been verified.
- A sample with a reset counter, zero sample window, stale callback or unavailable browser API remains unavailable. No missing value is rewritten as zero.

### GPU timer-query capability smoke

On 2026-11-25, a standalone WebGL 1 page in the installed Playwright Chromium browser used valid shaders and 100 triangle draw calls inside one `EXT_disjoint_timer_query` interval. Chromium reported the NVIDIA GeForce RTX 4060 Laptop GPU through ANGLE/Direct3D 11, the timer-query extension was available, the result was not disjoint, and `gl.getError()` returned `NO_ERROR`. This one smoke query returned 1.090336 ms and became available after two polls. It establishes that the Chromium runtime/driver pair can return a valid asynchronous query. It is not a RemoteAssist WebView2 runtime measurement, an A/B benchmark, or a sustainable-workload latency sample.

### Media path and encoder feasibility

The current Windows path is DXGI Desktop Duplication → D3D11 staging texture → CPU map and BGRA packet → Tauri IPC → WebGL texture upload/draw → `CanvasCaptureMediaStreamTrack` → browser-managed WebRTC encoding. Damage metadata chooses bounded non-overlapping delta packets with cost-checked full-frame fallback. scRGB HDR is tone-mapped to SDR on CPU.

`getStats()` now records the negotiated codec and browser-reported encoder/decoder implementation when exposed. The host reports an RTX 4060 Laptop GPU and Radeon 780M. `nvidia-smi` showed zero active encode sessions outside a live RemoteAssist stream, so hardware selection in a real session remains UNVERIFIED. The source has no native NVENC, AMF, QSV or Media Foundation encoder path.

Source-document feasibility review found that NVENC can register/map externally allocated DirectX input textures, Intel VPL can import shared D3D11 surfaces and allows copy fallback, AMD AMF exposes low-latency modes and DirectX memory selection, and Media Foundation H.264 uses a defined NV12/I420/YUY2 input set. None verifies adapter interoperability or selected hardware on this machine. The current path uses D3D11 staging-to-CPU, then BGRA over Tauri IPC, WebGL upload, Canvas and browser WebRTC encode. An NVENC adapter different from the Desktop Duplication device could add cross-adapter transfer costs. Preserving WebRTC congestion handling and a tested software fallback remains a design requirement for any later prototype. No encoder implementation, codec preference or frame protocol was changed in this research step. [NVIDIA Video Codec SDK guide](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/nvenc-video-encoder-api-prog-guide/index.html), [AMD AMF encoder header](https://github.com/GPUOpen-LibrariesAndSDKs/AMF/blob/master/amf/public/include/components/VideoEncoderVCE.h), [Intel VPL shared surfaces](https://intel.github.io/libvpl/latest/programming_guide/VPL_prg_surface_sharing.html), [Intel VPL hardware acceleration](https://intel.github.io/libvpl/latest/programming_guide/VPL_prg_hw.html), [Media Foundation H.264 encoder](https://learn.microsoft.com/en-us/windows/win32/medfound/h-264-video-encoder).

The GPU timer measures asynchronous GPU execution between the timer-query markers, including upload/draw commands issued inside that interval. It does not measure physical scanout, browser WebRTC encoding, network time or input-to-display latency. Hardware encoding, sustained 1440p60/4K60 output and optical input-to-display delay remain UNVERIFIED. Timer query semantics are documented by [MDN](https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query).

## Current automated and build results

- Frontend: `npm test` PASS, 122/122. `npm run build` PASS.
- Go server: `go test ./...`, `go vet ./...`, and `go build ./cmd/signaling` PASS.
- Go module cache: `go mod verify` PASS for the modules already downloaded.
- Rust: `cargo fmt --check`, `cargo check --locked`, and `cargo test --locked` PASS. 25 tests passed and one visible-desktop smoke test is ignored by default.
- Go Race: `go test -race ./...` PASS on Go 1.26.11 using a temporary LLVM-MinGW compiler with `CGO_ENABLED=1`.
- Go symbol advisory scan: `govulncheck ./...` PASS, no reachable vulnerabilities after dependency updates.
- Rust advisory scan: PASS, zero vulnerabilities after updating `url` 2.5.9, `cookie` 0.18.3 and `rustix` 1.1.6. Three informational warnings remain for unmaintained transitive crates and Linux GTK `glib` soundness.
- PostgreSQL migrations 001–003: PASS through the Go migration runner against PostgreSQL 18.2 on loopback. Production/Compose PostgreSQL remains UNVERIFIED.
- Explicit DXGI smoke: PASS for the animated pattern with `REMOTEASSIST_CAPTURE_REQUIRE_FRAME=1`. Empty/static scene results are reported as empty responses, not as fabricated throughput.
- Compose syntax: `docker compose --env-file deploy/.env.example -f deploy/docker-compose.yml config --quiet` PASS. This does not validate an actual deployment.
- Full deployment config verifier: PASS with a removed temporary fixture. It checked required settings, exact origins, public TURN address, subnet/port-range invariants, Compose interpolation and Coturn arguments. No live deployment was exercised.
- `npm audit`: PASS, zero reported vulnerabilities.
- Fresh scans on 2026-11-26: `govulncheck v1.10.0` on Go 1.26.11 reports no reachable vulnerabilities; `cargo-audit 0.23.0` loads 1,568 advisories and exits successfully with three allowed warnings. `npm audit` reports zero vulnerabilities in the preceding result.
- Rust advisory remediation updated `url`, `cookie` and `rustix` in the lockfile. No GPU timer or runtime vendor SDK dependency was added.
- Windows x64 NSIS installer: PASS, 2,434,253 bytes, SHA-256 `1948AD0A82F63DDC7AC073F00C9B338823F9868E374F13967DD558C7F608A88B`, `NotSigned`.
- Portable Windows EXE: PASS, 10,601,472 bytes, SHA-256 `03608738EA34F7B9375D6E1B09D3F9698D1BBC2BFF4989521A07F22D8E23E690`, `NotSigned`.
- LAN test NSIS installer: PASS, 3,229,002 bytes, SHA-256 `750B7EECF85A5F045AF5EC1A5D77E1BE295E1DF73DFE751C7D62D5B779AF6C64`, configured for `192.168.0.101:8080`. Generated Tauri CSP allows only that private HTTP/WS origin, Tauri IPC and loopback.
- Release artifacts contain no production signaling domain. They build and package successfully but need a configured HTTPS service before operational use.

## Verification gaps

- Go Race and Go advisory scans passed on the upgraded local Go toolchain. The temporary cross-compiler is not part of the product or repository.
- Go 1.26.11 follow-up on 2026-11-26: normal Go tests, Vet, signaling build, module verification, and fresh `go test -race -count=1 ./...` passed. The Race run used the preserved temporary LLVM-MinGW compiler with environment changes scoped to the command.
- Cargo audit reported three informational Rust advisories after fixing all vulnerabilities. The `glib` soundness advisory is limited to GTK's Linux target and is not in the Windows target dependency graph. The two unmaintained crates are transitive build/runtime dependencies with no fixed version currently offered by RustSec.
- No physical RemoteAssist session, two-account code session, public DNS/TLS, TURN UDP/TCP, weak-network run, 30-minute session, or route-change recovery was tested. The latest host address is `192.168.0.101`, and Windows currently classifies its network as Public. Final process cleanup stopped the two pre-existing project test listeners bound to stale `192.168.1.102:8080` and `:8090`. An unrelated loopback development service remains active.
- LAN reachability recheck on 2026-11-26: peer `.100` responds to ICMP but ports 8080/8090 are closed; `.102` does not respond to ICMP. The host has no current 8080/8090 listener.
- Subsequent LAN setup started `.101:8080` signaling and `.101:8090` installer serving. Local health/download requests returned 200; TCP reachability from `.100` remains unverified.
- Final listener check confirms those two intended services are still available; the package endpoint reports 3,229,002 bytes. The temporary browser/dev server used for UI entry tests is closed.
- No sustained WebView2 encoder selection/FPS, actual monitor scanout, 4K game capture or physical input-to-photon P50/P95 was measured. A synchronized optical measurement is required for input-to-display latency.

## Historical repository baseline

The prior repository record measured a different 2560×1600 sample with 120 packets, 1 full and 119 delta, and approximately 97.3% less payload than full-frame equivalents. Prior package hashes and test counts in earlier sections of `STATUS.md` describe their recorded source revisions and are historical, not this run's build output.
