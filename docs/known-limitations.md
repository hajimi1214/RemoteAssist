# Known Limitations

- Windows 10/11 is the first supported desktop target.
- macOS and Linux desktop behavior is NOT VERIFIED.
- Installing the NSIS package on another Windows 10/11 PC is NOT VERIFIED.
- Dual-machine LAN operation is NOT VERIFIED in this environment.
- Public server deployment, DNS, TLS issuance, firewall rules, and TURN relay behavior are NOT VERIFIED without real infrastructure.
- Migration SQL structure and transactional runner regression tests pass. The 0.4 advisory-lock migration runner has not been tested against live PostgreSQL in this session; historical 0.2 migration checks do not validate the new runner.
- Keyboard mapping currently covers common keys and single-character keys; extended IME and scan-code-specific behavior need further hardening.
- Multi-monitor absolute coordinate mapping is normalized to the primary desktop coordinate range and needs manual DPI validation.
- Active sessions remain in memory; use one signaling replica. Restart ends active sessions.
- Window/tab capture is rejected for remote control. The host must select and confirm the primary full display; automatic primary-display identification and secondary-monitor coordinate transforms are not implemented. Verify primary-display mapping on both machines.
- Adaptive encoding and dual DataChannels passed a local browser loopback, but target WebView2 behavior and degraded-network performance need two-machine validation.
