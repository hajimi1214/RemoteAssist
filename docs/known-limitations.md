# Known Limitations

- Windows 10/11 is the first supported desktop target.
- macOS and Linux desktop behavior is NOT VERIFIED.
- Installing the NSIS package on another Windows 10/11 PC is NOT VERIFIED.
- Dual-machine LAN operation is NOT VERIFIED in this environment.
- Public server deployment, DNS, TLS issuance, firewall rules, and TURN relay behavior are NOT VERIFIED without real infrastructure.
- PostgreSQL migration SQL, migration command, and a temporary Docker PostgreSQL migration run are verified.
- Keyboard mapping currently covers common keys and single-character keys; extended IME and scan-code-specific behavior need further hardening.
- Multi-monitor absolute coordinate mapping is normalized to the primary desktop coordinate range and needs manual DPI validation.
