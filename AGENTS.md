# Automated Contributor Guidance

RemoteAssist is a visible, user-authorized remote desktop application. It supports direct connections between signed-in devices under one account and one-time-code assistance initiated by a signed-in host. Hosts remain visible and can pause or end a session.

## Safety boundaries

- Keep application windows and session activity visible. Do not add hidden operation, hidden tray behavior, process masquerading, silent installation, or default startup.
- Do not bypass user authorization, UAC, Defender, firewall controls, or certificate validation.
- Do not add remote shell, command execution, arbitrary script execution, credential capture, key logging, or capture after a session ends.
- Do not hardcode passwords, API tokens, signing keys, certificates, TURN secrets, or personal configuration.
- Treat screen contents, typed input, device identifiers, access tokens, and refresh tokens as sensitive. Do not include them in diagnostics, test fixtures, logs, Issues, or Pull Requests.

## Authorization and input handling

- Check account ownership and device/session state at each authorization boundary.
- Validate session capabilities, message size, message schema, event rate, and expiry before processing WebSocket or input events.
- Reject input immediately after authorization expires or a session disconnects. Release held keys and buttons when a session stops.
- Preserve the separate authorization requirements for same-account device access and one-time-code assistance.

## Engineering and operations

- Understand and preserve the React/TypeScript, Tauri, Rust, Go, PostgreSQL, WebRTC, Coturn, and Caddy boundaries. Make architecture changes only with measured evidence and a documented rollback path.
- After code changes, run the relevant tests and report results as `PASS`, `FAIL`, or `NOT VERIFIED`. Never substitute synthetic results for physical-device evidence.
- Record test environment, command, and scope when reporting performance or device behavior.
- Update status, verification, security, deployment, and known-limitation documentation when behavior or evidence changes.
- Do not run `docker system prune` or stop, delete, or modify Docker resources unrelated to the current task.
- Do not automatically log in to servers or change user security settings as a test shortcut.
- Do not publish a GitHub Release or describe an unsigned package as signed.
