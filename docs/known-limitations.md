# Known Limitations

- Windows 10/11 is the first supported desktop target.
- macOS and Linux desktop behavior is NOT VERIFIED.
- Installing the NSIS package on another Windows 10/11 PC is NOT VERIFIED.
- The 0.9 tablet LAN test displayed the Windows desktop but reported touch/quality issues. The 0.12 UI and media paths have synthetic browser coverage; physical 0.12 tablet revalidation is pending.
- Public server deployment, DNS, TLS issuance, firewall rules, and TURN relay behavior are NOT VERIFIED without real infrastructure.
- Migration SQL structure and transactional runner regression tests pass. The 0.4 advisory-lock migration runner has not been tested against live PostgreSQL in this session; historical 0.2 migration checks do not validate the new runner.
- Bounded Unicode text and common navigation keys are supported; vendor mobile IME and scan-code-specific shortcuts still require real-device validation.
- Multi-monitor absolute coordinate mapping is normalized to the primary desktop coordinate range and needs manual DPI validation.
- Active sessions remain in memory; use one signaling replica. Restart ends active sessions.
- The current Windows stream reads D3D11 staging data to CPU memory, copies frames through Tauri IPC, uploads them into WebGL, and uses browser-managed WebRTC encoding. No zero-copy D3D11-to-encoder path is implemented. Sustained 1440p60/4K60 and hardware encoding are NOT VERIFIED.
- Capture diagnostics report bounded frame-pull windows and browser-reported encoder/decoder implementation when available. P99/max are withheld below 100 timing samples. WebView presentation callbacks are optional and do not measure physical display scanout.
- Version 0.12 captures the primary display through DXGI. scRGB HDR is converted to SDR by a tested software tone mapper, but real HDR output/color fidelity and moving-4K conversion cost have not been measured. Rotated displays, secondary displays, mode changes and multi-monitor DPI/input still need validation.
- Adaptive encoding and dual DataChannels passed a local browser loopback; target WebView2 behavior, the 0.13 emergency downgrade on a real weak link, stable 4K60 and input-to-photon latency need real-device/two-machine measurement.
- Native smoke on 2026-11-25 measured two 2560×1600 SDR scenes. The animated pattern emitted 120 packets, 1 full and 119 delta, with 82.8% fewer payload bytes than full-frame equivalents. An ambient desktop burst returned 3 pixel frames and 27 empty DXGI timeouts. Details and timing windows are in `performance-baseline.md`. Neither sample measures WebRTC sustained output.
- Capture diagnostics now carry bounded pull counts, empty responses, failed pulls and full/delta/dirty-region counts over authenticated heartbeat. The controller can report WebView `requestVideoFrameCallback` cadence when supported. This measures callback timing, not physical display scanout. GPU execution timestamps remain unavailable. System/game audio and WASAPI loopback are not implemented.
- Version 0.15 streams video only; Windows system/game audio capture, Opus transport and receiver audio playback are not implemented. It is not yet a complete game-streaming replacement.
- The game camera path captures browser-relative pointer movement and injects standard Windows SendInput events. It is not a physical HID/Raw Input device, does not guarantee edge-free camera motion, and may be ignored by games or anti-cheat software. Qualification is per title; do not bypass game security controls.
