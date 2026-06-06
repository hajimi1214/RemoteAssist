# Threat Model

## Protected Assets

- Host screen content during an active authorized session.
- Host input control permission.
- Temporary session codes and one-time tokens.
- TURN credentials and deployment secrets.

## Controls

- Host starts sharing manually and chooses a screen or window.
- Controller receives no input permission until host clicks `Allow Control`.
- Session codes expire after 5 minutes.
- Tokens are not logged.
- WebSocket messages are capped at 65536 bytes by default.
- Input events are capped at 16384 bytes in the desktop client and rate-limited.
- Expired, disconnected, rejected, or unauthorized sessions reject input.

## Out of Scope and Prohibited

Hidden operation, silent installation, default autostart, unattended access, privilege escalation, UAC bypass, Defender evasion, credential capture, key logging, remote shell, script execution, arbitrary command execution, background recording, and post-session capture are prohibited.
