# Security review — same-account direct connection

Reviewed 2026-11-21. Scope: visible same-account device access, local input authorization, expiry and control-release behavior.

## PASS — reviewed and tested

- Current clients no longer expose the legacy connection-code workflow or its per-session Windows approval dialog. The controller must authenticate as the device owner and select an online device from that account.
- The native host accepts only the server-validated host device, account owner and current session capability. Each input event remains token-, state-, expiry-, structure- and rate-validated.
- The host stays visible and exposes pause/stop. Disconnect, logout, device revocation, peer heartbeat loss and expiry release pressed inputs and stop capture.
- release-all is a sequence barrier: older lossy pointer messages are rejected after local control release. Reliable button releases remain accepted.
- Zero reported bandwidth triggers adaptation; missing/invalid estimates remain distinct.
- Local summary serialization uses a field whitelist, local random IDs, bounded retention and validated dates. It excludes codes/tokens/addresses/device names/screenshots/video/input contents.
- Local persistence is opt-in per account. Default records remain in memory for the current login. Late termination callbacks can write only to their original account's opted-in store.
- Corrupt local records/storage failures cannot prevent control revocation. Save versus delete failures show different retry messages.
- Diagnostic trends retain only bounded aggregate samples; missing data is not fabricated and static low bitrate/fps does not imply a broken connection.
- No hidden operation, shell/command execution, autostart, silent installation or screen/keyboard recording was added.
- Actual local browser lifecycle tests and unit regressions passed; historical unverified deployment claims were not promoted to PASS.

Legacy code-based HTTP endpoints remain for older clients. The current client flow uses only account-owned direct sessions.

## Limits

Live Windows capture/input and public relay behavior remain unverified. Per-account localStorage separation is a product boundary, not OS-level isolation from users with profile access. No full privacy penetration test, screen-reader certification, cloud deployment, database audit storage or hardware codec capability validation is claimed.
