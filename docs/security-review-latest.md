# Security review — 0.7.0-alpha

Reviewed 2026-11-20. Scope: local metadata journal, diagnostic UI and input/adaptation edge cases.

## PASS — reviewed and tested

- Host native approval, current-session token validation, native expiry/heartbeat lease, and explicit local input enabling remain required.
- release-all is a sequence barrier: older lossy pointer messages are rejected after local control release. Reliable button releases remain accepted.
- Zero reported bandwidth triggers adaptation; missing/invalid estimates remain distinct.
- Local summary serialization uses a field whitelist, local random IDs, bounded retention and validated dates. It excludes codes/tokens/addresses/device names/screenshots/video/input contents.
- Local persistence is opt-in per account. Default records remain in memory for the current login. Late termination callbacks can write only to their original account's opted-in store.
- Corrupt local records/storage failures cannot prevent control revocation. Save versus delete failures show different retry messages.
- Diagnostic trends retain only bounded aggregate samples; missing data is not fabricated and static low bitrate/fps does not imply a broken connection.
- No unattended access, hidden operation, shell/command execution, autostart, silent installation or screen/keyboard recording was added.
- Actual local browser lifecycle tests and unit regressions passed; historical unverified deployment claims were not promoted to PASS.

## Limits

Live Windows capture/input and public relay behavior remain unverified. Per-account localStorage separation is a product boundary, not OS-level isolation from users with profile access. No full privacy penetration test, screen-reader certification, cloud deployment, database audit storage or hardware codec capability validation is claimed.
