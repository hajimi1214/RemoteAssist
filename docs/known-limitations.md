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
- Version 0.12 captures the primary display through DXGI. scRGB HDR is converted to SDR by a tested software tone mapper, but real HDR output/color fidelity and moving-4K conversion cost have not been measured. Rotated displays, secondary displays, mode changes and multi-monitor DPI/input still need validation.
- Adaptive encoding and dual DataChannels passed a local browser loopback; target WebView2 behavior, the 0.13 emergency downgrade on a real weak link, stable 4K60 and input-to-photon latency need real-device/two-machine measurement. The latest physical capture sample was SDR and did not naturally produce a multi-rectangle delta packet.
- Version 0.15 streams video only; Windows system/game audio capture, Opus transport and receiver audio playback are not implemented. It is not yet a complete game-streaming replacement.
- The game camera path captures browser-relative pointer movement and injects standard Windows SendInput events. It is not a physical HID/Raw Input device, does not guarantee edge-free camera motion, and may be ignored by games or anti-cheat software. Qualification is per title; do not bypass game security controls.
