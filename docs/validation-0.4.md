# 0.4 validation record

Date: 2026-11-20. Local Windows development environment.

## Real browser WebRTC loopback — PASS

Executed `http://127.0.0.1:1425/tests/webrtc-loopback.html` in the in-app browser with the current source modules. The page displayed:

```text
PASS real PeerConnection negotiation, received video, ping/pong RTT
PASS sender accepts adaptive encoding parameters (Balanced)
PASS pointer channel delivers validated normalized motion
PASS reliable key order and release-all delivery
PASS invalid input token rejected
PASS revoked input gate rejects further delivery
PASS release events bypass action-rate saturation
PASS closing peers stops all further input
RESULT: PASS
```

The fixture generated canvas frames and substituted only native input delivery. It did not bypass production authorization, request capture permission, move the mouse, or type into Windows. Backend protocol tests are separate real WebSocket tests.

## Reproduction

Requires Node 24 for native TypeScript test execution, the installed Go toolchain, Rust, and Windows build tools.

```powershell
npm ci
.\scripts\test.ps1
npm run dev -- --port 1425
```

Open the loopback harness URL and click **Run loopback checks**. The fixture is outside `src/` and is not part of the production Vite bundle.

## NOT VERIFIED

- Two-machine LAN/public TURN, real screen/window capture, native input delivery, IME/multiple monitor mapping.
- Controlled packet-loss/congestion benchmarks; no numeric performance improvement is claimed.
- Live PostgreSQL concurrency/restore and hardened container runtime; Docker daemon was unavailable.
- Go `-race` locally: CGO was disabled and GCC/Clang unavailable. Concurrent regression tests ran normally; Linux CI is configured for the race detector.
- GitHub-hosted CI execution, code signing, second-machine installer execution.
