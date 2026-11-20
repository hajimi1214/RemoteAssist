# 0.6 communication and quality validation

Date: 2026-11-20. Windows development environment, browser canvas fixtures, simulated native input sink. No real desktop capture or OS input was performed.

## Browser media loopback — PASS

The real HostPeer and ControllerPeer established two PeerConnections. The fixture reported:

```text
PASS ICE credentials are not loaded before negotiation
PASS real PeerConnection negotiation, received video, ping/pong RTT
PASS sender accepts adaptive encoding parameters (Balanced)
PASS both peers load fresh ICE credentials at negotiation
PASS real receive codec dimensions fps and interval bitrate measured
PASS text-oriented encoder preference accepted during streaming
PASS pointer channel delivers validated normalized motion
PASS pointer burst preserves its final position
PASS click cancels older pending pointer movement
PASS reliable key order and release-all delivery
PASS invalid input token rejected
PASS revoked input gate rejects further delivery
PASS release events bypass action-rate saturation
PASS closing peers stops all further input
RESULT: PASS
```

The diagnostics UI expanded and showed real VP8/640×360/10-fps fixture statistics, interval bitrate/loss and available decode/buffer measurements. This verifies field wiring, not representative desktop/public-network performance.

## Real browser watchdogs — PASS

The separate watchdog test ran to the actual deadlines (without accelerating its clocks):

```text
PASS missing SDP answer ends negotiation within its deadline
PASS missing authenticated keepalive ends an otherwise-open connection
RESULT: PASS
```

Negotiation ends after 25 seconds without a usable reliable channel. A connection whose native heartbeat sink stops acknowledging ends after the eight-second keepalive window. No unattended reconnection is attempted.

## Deterministic regressions

Tests cover late/duplicate/invalid/expired heartbeat acknowledgements, final-pointer preservation/cancellation, gradual quality changes, unavailable estimates, CPU pressure, interval telemetry units, counter resets and static-frame behavior. Existing authorization and pointer-mapping regressions remain in the suite.

Final local suite: PASS, 24 frontend tests plus production build, all Go tests/service build, Rust check and 5 native tests. npm audit: zero reported vulnerabilities.

## Reproduce

Run `npm test`, then `npm run dev -- --port 1425`. Open `/tests/webrtc-loopback.html`, click **Run loopback checks**, then **Run watchdog checks**. The diagnostics panel is populated by the real receiver stats. The watchdog test takes about 35 seconds.

## NOT VERIFIED

- Public TURN allocation/credential expiry on an actual relay; callback timing is verified but relay traffic was not exercised.
- Two-machine desktop capture/native input and WebView2 hardware encoder behavior.
- Controlled loss/jitter/bandwidth benchmarks, input-to-photon latency, objective text/chroma quality and CPU/GPU utilization.
- AV1/HDR/4:4:4/zero-copy hardware paths. No such capability is claimed by this browser-layer refinement.
- Live PostgreSQL/cloud deployment, code signing and second-machine installation.
