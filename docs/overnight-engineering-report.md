# Overnight Engineering Report

- Date: 2026-11-25
- Branch: `codex/overnight-engineering-hardening`
- Starting commit: `2e4806f57ecef4bc295a6cdda2e9639a930443a8`
- Starting worktree: clean. Existing commits and the current GitHub `main` were preserved.
- Release version: unchanged at `0.15.1-alpha`.

## Work completed

- Reviewed React/Tauri entry paths, native Rust capture and input, Go REST/WebSocket/session code, PostgreSQL migration setup, WebRTC stats/ICE/TURN configuration, Windows packaging scripts, threat model, current known limitations, and local CI checks.
- Fixed a stale deployment example that set `SESSION_ACTIVE_TTL=30m` despite the current server default and documentation saying 8 hours. `deploy/.env.example` now agrees with `docker-compose.yml` and the supported server bounds.
- Normalized newly registered usernames to lowercase and added migration 002 case-insensitive unique indexes for username/email, with an explicit legacy-duplicate preflight instead of renaming data silently. Kept the historical SQL mirror synchronized and added a test to enforce the mirror.
- Removed per-frame DXGI format logging from the normal smoke mode. Format diagnostics now require `REMOTEASSIST_CAPTURE_FORMAT_DEBUG=1` and only log when the source format changes. This matters because console output can itself animate the captured desktop and force full-frame transfers.
- Extended the visible DXGI smoke report with empty timeout count, wall/request windows, request throughput, response P50/P95/P99/max and frame/rectangle/byte totals. A static scene with no changed pixels is now distinguishable from a failed frame transfer. `REMOTEASSIST_CAPTURE_REQUIRE_FRAME=1` can require a dynamic scene for an operator-selected run.
- Extended host capture telemetry with bounded request-window counts for full frames, delta frames, delta regions, cursor packets, empty responses and failed requests. Percentiles require enough samples: P50/P95 at 10 samples and P99/max at 100. These summaries are carried by the existing authenticated heartbeat path, not sent for every frame.
- Added browser video-frame callback statistics using `requestVideoFrameCallback` where supported. Summaries are limited to four per second, use a 2-second sample window with storage compaction exercised at 60 FPS, and leave values unavailable when the API or samples are missing.
- Added stats extraction for the browser-reported encoder and decoder implementation when WebRTC exposes those fields. The label says browser-reported implementation and does not claim hardware acceleration. Unit coverage exercises exposed implementation names.
- Added regression coverage for percentiles, malformed/runtime capture summaries, frame presentation counter resets and reported encoder/decoder implementation.
- Added a one-click copyable diagnostic report from a field whitelist, with absent metrics labeled unavailable and no identifiers, candidate addresses or session/input content.
- Restricted the LAN-test package CSP to Tauri IPC, loopback and the selected exact HTTP/WS origin. The generated package configuration contains no wildcard HTTPS/WSS origins.
- Serialized native Tauri input deliveries so unordered pointer-channel IPC cannot overtake reliable button/key barriers. A bounded backlog rejects transient work; if a release arrives at capacity, native authorization is revoked immediately to release held controls. Added regressions for order, authorization changes while queued, and overflow release behavior.
- Added this report, [verification matrix](verification-matrix.md), [two-PC runbook](lan-two-pc-runbook.md), and appended measurements to [performance baseline](performance-baseline.md).

## Captured baseline

On the current 2560×1600 SDR desktop, the controlled synthetic moving pattern produced 120 pixel packets: 1 full and 119 delta, 359 regions total, 82.8% fewer bytes than equivalent full frames. The native request window was 512.8ms, with reply P50/P95/P99/max of 3.99/5.15/5.90/18.77ms. During that sequential burst the calculated pixel FPS was 234.0, which is not a negotiated or sustained stream rate.

With the moving pattern closed, an ambient desktop sample had 3 changed pixel packets and 27 DXGI timeout replies in a 1,338.1ms request window. Reply P50/P95/P99/max was 46.35/50.99/51.13/51.13ms. This is not a controlled static image because other desktop activity still changed the screen. A smoke test from an earlier quiet window returned 30 empty timeouts and zero pixel packets.

These native samples exclude the complete Canvas/WebRTC encode, network path, remote decode, physical presentation and input-to-display time. They do not constitute an optimization A/B comparison or sustained stream FPS.

The installed host exposes an AMD Radeon 780M and NVIDIA RTX 4060 Laptop GPU. `nvidia-smi` reported zero active encode sessions during the check. The app source still performs DXGI GPU copy to CPU staging, IPC to WebView, WebGL upload, Canvas capture and browser-managed WebRTC encoding. No native NVENC, AMF, QSV or Media Foundation encoding integration was introduced.

Hardware encoder evaluation: NVENC is a candidate on this host's RTX 4060 and AMF is a candidate on its Radeon 780M. No Intel GPU was enumerated. The runtime packages no encoder SDK and does not feed the D3D11 duplication texture directly into an encoder. The project's stored NVENC 13.1 guide and SDK landing-page fetch entries are marked `FAIL` in `.local/research/pc-game-0.16/manifest.json` because source retrieval was unavailable; therefore this run did not claim a source-level API feasibility verification. A future experiment must establish a real selected implementation and preserve WebRTC congestion control/fallback before replacing the browser path. AV1/HEVC availability and interoperability across both deployed endpoints are also NOT VERIFIED.

## Validation results

- Frontend: `npm test` PASS, 113/113.
- Frontend: `npm run build` PASS.
- Go server: `go test ./...` PASS.
- Go server: `go vet ./...` PASS.
- Go module cache: `go mod verify` PASS for the modules already downloaded.
- Go module checksums: `go mod verify` PASS for downloaded modules.
- Rust: `cargo fmt --check`, `cargo check --locked`, `cargo test --locked` PASS. The unit suite has 23 tests, 1 visible-desktop test is ignored by default, and 23 normal tests pass after adding the percentile test.
- DXGI visible desktop: dynamic smoke PASS for the animated UI pattern. A no-update run returned 30 empty DXGI timeout replies and zero pixel frames, reported as no pixel transfer rather than as a fabricated zero-FPS stream.
- Compose: `docker compose --env-file deploy/.env.example -f deploy/docker-compose.yml config --quiet` PASS. This validates compose syntax and not actual public networking.
- npm dependency audit: PASS, zero reported vulnerabilities.
- Go race detector: NOT VERIFIED because this Windows Go installation has `CGO_ENABLED=0` and no C compiler. WSL is installed without a Go toolchain. Normal Go tests and Vet pass.
- Go advisory scan: NOT VERIFIED because fetching `govulncheck` from `proxy.golang.org` timed out. `go list -m all` also needed uncached module metadata from that proxy and could not complete.
- Rust dependency tree: inspected from `Cargo.lock`; some transitive version duplicates are present under Tauri, Reqwest and build tooling. No dependency was added or upgraded.
- Rust advisory scan: NOT VERIFIED because `cargo-audit` is not installed and the advisory database is not available locally.
- Current Windows NSIS x64 installer: PASS, 2,429,607 bytes, SHA-256 `B11CC44CBE8984D85359F5CF64086B9E6B319A4DB5CF236916091BA48B0613E2`, `NotSigned`.
- Portable Windows EXE: PASS, 10,604,032 bytes, SHA-256 `36954B133AFF4406B87679172F71F74CEED0B07C2731244663AA5B1573F2DCBA`, `NotSigned`.
- Current LAN test NSIS package: PASS, 3,213,539 bytes, SHA-256 `66F5CD8B01B2B8EA8CB4891638411C622E19F0082905A5F97BFBCBF1EDDF3026`, configured for `192.168.1.102:8080` with a matching exact-origin HTTP/WS CSP.
- Neither artifact embeds a production signaling domain. They verify build/packaging only and require a configured HTTPS service before operational use.
- Physical second-Windows installation, same-LAN flows, public STUN/TURN and long-session behavior: NOT VERIFIED.

## Security review notes

No new P0 or P1 issue was found in the reviewed code. Existing authentication, one-time host/controller capabilities, same-account device ownership, session expiry, WebSocket size/rate bounds, native input token/expiry/lease checks, and release-all behavior remain in the active path. The code-based cross-account workflow is explicitly the host-created single-use control code. The native host still visibly runs, and this work adds no hidden service, default autostart, UAC bypass, shell execution, screen recording or credential logging.

This is a source and regression-test review, not a penetration test or a complete formal security audit. Public deployment, cross-network TURN and revocation under real two-PC load remain unverified.

## Issues found and disposition

| Priority | Finding | Disposition |
|---|---|---|
| P2 | `deploy/.env.example` still set a 30-minute active TTL, conflicting with the current 8-hour server default and deployment docs. | Fixed the example to 8 hours. |
| P2 | PostgreSQL's existing exact-case unique constraints permitted case variants although login queries match lowercased usernames/emails. | Registration now stores lowercase usernames. Migration 002 preflights existing case-folded collisions and adds unique expression indexes. Live PostgreSQL migration remains unverified. |
| P2 | The native smoke test emitted a format line for every frame when its smoke flag was set, which could dirty the captured screen and corrupt the benchmark. | Fixed by a separate opt-in format-debug flag and change-only logging. |
| P2 | Capture timing lacked P99/max, and diagnostics could not distinguish full/delta/cursor/empty/failure windows. | Added sample-gated percentiles and bounded host counters. |
| P2 | Controller reported decoded frames but not browser video-frame callbacks. | Added a separately labeled, capability-gated callback measurement. It is not physical scanout. |
| P2 | Presentation callback samples were only compacted after 128 stale samples, a threshold unreachable in ordinary 60 FPS windows. | Lowered the compaction threshold and changed the long-session test to a 60 FPS callback cadence. |
| P2 | Browser-reported codec was visible, but implementation detail was omitted. | Added encoder/decoder implementation fields only when exposed by WebRTC stats. |
| P2 | The LAN-test CSP allowed generic HTTPS/WSS sources even though its signaling URL targeted one private test host. | Removed generic HTTPS/WSS sources, rebuilt the package and verified the generated CSP against the selected address. |
| P2 | DataChannel callbacks issued independent asynchronous Tauri input commands, so native completion order could differ from event validation order under IPC load. | Serialize native event delivery and fail closed on a full backlog; a saturated release edge revokes native authorization, which releases held controls. Regression-tested. |
| P2 | `go test -race` was requested by CI but this host lacked cgo tooling. | Recorded as NOT VERIFIED. CI's Ubuntu job remains the authoritative race check when available. |
| P2 | `govulncheck` download failed due network timeout; Cargo audit binary/advisory DB were unavailable. | Recorded as NOT VERIFIED. No dependencies were added. |

## Next five investments

1. Repeat the LAN runbook on two currently reachable Windows PCs, test same-account and one-time-code flows separately, and measure a 30-minute session.
2. Capture WebRTC sender/receiver statistics while the real stream runs. Confirm the `encoderImplementation`, codec, actual receive callback cadence, queue and drop counters.
3. Measure physical mouse input-to-display with a repeatable optical test. Do not substitute RTT or frame callback metrics.
4. Design a D3D11 texture-sharing prototype and compare it with the current staging readback using identical scenes before adding a native encoder. Keep WebRTC congestion control and fallback behavior in scope.
5. Run Go Race/Vet and advisory scans in network-enabled CI, then decide whether a native Media Foundation/NVENC/AMF/QSV path is justified by measurements.
