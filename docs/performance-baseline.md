# Performance Baseline

## Automated Measurements

- Frontend production build: PASS.
- Go unit tests: PASS.
- Go service build: PASS.
- Tauri Rust check: PASS.
- Portable Windows release EXE build: PASS.
- Go `/healthz` runtime check: PASS.
- Docker Compose config validation: PASS.

## Manual Measurements

- LAN video latency: NOT VERIFIED.
- TURN relay latency: NOT VERIFIED.
- CPU and memory during long sessions: NOT VERIFIED.
- Multi-monitor DPI mapping: NOT VERIFIED.
- NSIS installer generation: FAIL due download timeout.
