# Known Limitations

- Windows 10/11 is the first supported desktop target.
- macOS and Linux desktop behavior is NOT VERIFIED.
- Installing the NSIS package on another Windows 10/11 PC is NOT VERIFIED.
- The 0.9 tablet LAN test displayed the Windows desktop but reported touch/quality issues. The new 0.10 device protocol has browser integration and native-capture smoke evidence; physical tablet revalidation is pending.
- Public server deployment, DNS, TLS issuance, firewall rules, and TURN relay behavior are NOT VERIFIED without real infrastructure.
- Migration SQL structure and transactional runner regression tests pass. The 0.4 advisory-lock migration runner has not been tested against live PostgreSQL in this session; historical 0.2 migration checks do not validate the new runner.
- Bounded Unicode text and common navigation keys are supported; vendor mobile IME and scan-code-specific shortcuts still require real-device validation.
- Multi-monitor absolute coordinate mapping is normalized to the primary desktop coordinate range and needs manual DPI validation.
- Active sessions remain in memory; use one signaling replica. Restart ends active sessions.
- Version 0.10 automatically selects the primary display through DXGI. Rotated/HDR/unusual formats, secondary displays and mode changes remain limited. Verify DPI/input on real machines.
- Adaptive encoding and dual DataChannels passed a local browser loopback, but target WebView2 behavior and degraded-network performance need two-machine validation.
