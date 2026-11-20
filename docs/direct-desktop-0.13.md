# Remote desktop latency and layout improvements — 0.13 alpha

This milestone responds to remote-operation stutter and delay by making severe sender pressure lower its quality ceiling immediately, while keeping normal recovery hysteresis to avoid visible quality oscillation. The device focus layout also fixes a CSS cascade that could let large artwork reclaim space from the action row on short desktop windows.

## Immediate pressure response

When a host sample reports an outgoing queue of at least 250 ms, an available outgoing estimate below 300 kbps, or CPU-limited encoding with at least 120 ms mean encode time, the adaptive policy drops one or two quality levels on that sample. The monitor normally samples about every 1.5 seconds. Recovery still requires consecutive good samples. The aim is to relieve sender pressure sooner; the resulting change in queue delay has not been measured on a real weak link.

Native capture still pulls one frame at a time. Pointer pacing keeps only the newest waiting position, expires it after 150 ms, and sends motion on an unordered channel when available; buttons, key events and release barriers remain reliable.

## Layout fix

The larger desktop artwork sizing applies from 801 px viewport height. Desktop-width windows up to 800 px tall retain the compact preview rules. Fullscreen mobile tools scroll within their panel.

## Validation

- PASS: frontend tests 80/80, `npx tsc --noEmit`, and production build.
- PASS: severe queue/bandwidth/CPU downgrade tests and hysteretic recovery.
- PASS: actual browser hit-testing at 1024×768 and 1280×720; 44 px remote-control button remained visible and hit-testable, with no document horizontal overflow.
- PASS: the synthetic loopback received 2560×1600 video. At 393×820 the viewer covered the full viewport, the tools panel scrolled internally with no horizontal overflow, and exit and disconnect remained reachable.
- PASS: Go service tests/build/vet, Rust check and 17 tests (one manual capture smoke ignored), Windows builds, and Android ARM64 APK v2 development signature verification.

## Not verified

Stable 4K60, end-to-end input latency, weak-network behavior on two physical machines and physical Android 0.13 interaction remain unverified.
