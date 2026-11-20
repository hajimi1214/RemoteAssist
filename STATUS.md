# Status

## Current milestone

M9 — 0.6.0-alpha communication and quality refinement. Reviewed 2026-11-20.

## Completed

- Host quality preferences: automatic balance, text first, motion first. Four adaptive levels move gradually; moderate pressure first preserves text resolution.
- Live sender/receiver diagnostics: actual codec, dimensions, interval fps/bitrate/loss, jitter/RTT, mean encode/decode time, local send queue, jitter-buffer residence and frame-drop/freeze counters where the browser reports them.
- Heartbeats correlate bounded probe IDs and local monotonic time. Late pongs are no longer confused with newer probes; missing authenticated keepalives terminate control.
- Peer negotiation has its own 25-second deadline, separate from signaling-ready timeout. Reliable input-channel opening defines usable readiness.
- Fresh ICE/TURN credentials are fetched at negotiation rather than before the approval wait.
- Latest-value pointer coalescing preserves the final position and cancels old queued movement before buttons/releases. Input/heartbeat/signaling sends handle congestion and send exceptions.
- Shared peer lifecycle removes duplicated cleanup and bounds queued signals. No automatic remote-control resumption is added.
- The supplied professional remote-desktop research was reviewed; applicable browser statistics/queue/quality advice is implemented. Native GPU, HDR/4:4:4 and true input-to-photon measurement remain separate work.
- Decisions/formulas: docs/communication-quality-0.6.md. Validation: docs/validation-0.6.md.

## Validation

- Frontend policy/timing/telemetry suite: PASS, 24 tests; production build PASS.
- Real browser media loopback: PASS, including fresh ICE callbacks, telemetry, live text-preference change, final pointer position and authorization rejection.
- Real browser watchdog tests: PASS for missing SDP answer and missing native keepalive acknowledgement.
- scripts/test.ps1: PASS — 24 frontend tests/build, all Go tests/service build, Rust check and 5 native tests. npm audit: zero reported vulnerabilities.
- Portable Windows EXE/NSIS 0.6.0-alpha: PASS, packaged with the example HTTPS endpoint. Operational deployment requires the actual domain.

## Remaining limits

- Two-machine LAN/public TURN, Windows native capture/input, physical display/DPI calibration, native consent and second-machine installation remain NOT VERIFIED.
- No hardware encoder, zero-copy, HDR/4:4:4 or high-refresh guarantee is made. Browser chooses the negotiated codec; hints and bitrate/fps settings are best effort.
- Diagnostics are aggregates in local memory, not a complete per-frame capture-to-display trace or true input latency measurement.
- Host confirms the primary display; window/secondary-monitor input remains unsupported. Active sessions are single-process and end on server restart.
- Both endpoints must use the 0.6 heartbeat protocol. Existing 0.4+ server signaling remains compatible.
- Example-domain installer must be rebuilt with the user's real HTTPS service address.
- Total model concurrency is limited to 2 including the main agent.

## Next milestone

M10 — actual cloud/two-machine acceptance, controlled weak-network tests, calibrated native capture, durable audit metadata and a measured native-media prototype.
