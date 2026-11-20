# Security review — 0.6.0-alpha

Reviewed 2026-11-20. Scope: media peer lifecycle, heartbeats, input queue, adaptive encoding and local diagnostics.

## PASS — reviewed and tested

- Host approval and native input expiry/heartbeat lease remain mandatory. No hidden operation, autostart, unattended access, remote shell, screen recording or credential capture added.
- Missing negotiation response and missing authenticated keepalive close PeerConnections and trigger existing app/native cleanup. Both deadlines were observed in real browser tests.
- Diagnostics contain only current aggregate metrics. No video pixels, input content, SDP, candidate addresses or session tokens are exported/stored by the diagnostics code.
- Pointer queue retains only the latest absolute position, remains bounded, is cancelled by buttons/releases and is cleared on shutdown. Keys/buttons stay on the reliable channel.
- Session tokens stay out of signaling URLs and forwarded frames. Fresh ICE configuration still requires the user's access token.
- send failures and excessive queued data terminate input rather than silently accumulating delayed controls.
- New quality preferences affect encoder ceilings/hints only; they cannot grant or extend authorization.
- Research document text is treated as reference material. No unattended policies or remote-command capabilities mentioned in the broader report were adopted.
- Browser fixtures use generated canvas video and simulated native delivery; no operating-system input injection was performed.

## Limits

Real cloud TURN, target WebView2/hardware codec behavior, Windows input/capture, second-machine consent, sustained loss/jitter, true input-to-photon latency and native display mapping remain unverified. The current architecture does not guarantee GPU zero-copy, HDR or 4:4:4. The complete server/security model has not undergone an external penetration test.
