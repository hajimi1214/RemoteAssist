# Threat Model

## Protected Assets

- Host screen content during an active same-account session.
- Host input control permission.
- Short-lived session tokens and one-time capabilities.
- TURN credentials and deployment secrets.

## Controls

- Both devices authenticate to the same account. The controller selects an online Windows device owned by that account. The visible host activates capture without a per-session code or prompt.
- The server checks account ownership, device status, session capability and expiry before activation. The native host validates session token, authorization expiry and heartbeat lease before every input event.
- The host shows the active controller and exposes pause/stop controls. Closing the client, pausing access, logout, device revocation, peer loss or expiry releases pressed inputs and stops capture.
- Game input remains standard Windows `SendInput`; the application does not elevate, bypass UAC, or impersonate a physical device.
- Tokens are not logged.
- WebSocket messages are capped at 65536 bytes by default.
- Input events are capped at 16384 bytes in the desktop client and rate-limited.
- Expired, disconnected, rejected, or unauthorized sessions reject input.

## Out of Scope and Prohibited

Hidden operation, silent installation, default autostart, cross-account access, privilege escalation, UAC bypass, Defender evasion, credential capture, key logging, remote shell, script execution, arbitrary command execution, background recording, and post-session capture are prohibited.
