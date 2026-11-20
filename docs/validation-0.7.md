# 0.7 validation record

Date: 2026-11-20. Local Windows development environment.

## Browser verification — PASS

- Real login and dashboard with an isolated in-memory Go service and synthetic account/device data.
- VelaMost-inspired light dashboard at 1440px; dark dashboard with larger text at 320px. No page-width overflow observed in checked views.
- Native radio-card quality selection works with click and arrow keys. 320px layout uses full-width option rows.
- Invalid connection attempt creates exactly one real summary with no connected duration. Opt-in persistence survives logout/login.
- Leaving an active waiting session through the confirmation dialog completes its summary during logout; it appears after the same account signs in again.
- Session filtering works; clearing requires confirmation; cancellation leaves summaries unchanged and returns focus to the trigger.
- Real browser WebRTC loopback PASS: generated video, fresh ICE callbacks, actual stats, quality preference update, final pointer coalescing, reliable key ordering, authorization rejection and shutdown.
- Diagnostics display bounded RTT/bitrate graphs and accessible sample labels populated from actual WebRTC samples. Sample values are fixture evidence, not public-network benchmarks.

## Automated tests

PASS — scripts/test.ps1 runs 34 frontend tests/build, Go tests/service build, Rust check and 5 native tests. npm audit reports zero vulnerabilities. Windows EXE and NSIS 0.7.0-alpha packaging pass with an example HTTPS endpoint; this is not cloud connectivity or installer runtime validation.

## NOT VERIFIED

- Actual desktop capture/native input/consent, Windows DPI/secondary-display mapping, public TURN and second-machine installation.
- Cross-account persistence browser test and denied-localStorage browser fault injection; account isolation/error branches have source review and data-validation unit coverage.
- Full WCAG conformance or native WebView2 behavior on all hardware.
- Native GPU zero-copy, HDR/4:4:4 and quantitative latency/quality improvement claims.
