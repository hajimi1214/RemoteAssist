# 0.7 workspace and diagnostic refinement

Reviewed 2026-11-20. The user's VelaMost reference continues to guide the blue/white visual language. This is an adaptation for remote assistance, not a claim of pixel-identical reproduction of the reference website.

## Interface

- The dashboard uses a light blue radial canvas, dark navy headings, blue emphasis, white device illustrations, fine borders, and restrained status colors.
- Two workflow tiles clearly distinguish receiving help (sharing the host primary display) from helping someone else (entering their code). Existing host consent remains unchanged.
- Quality preference is a native radio group presented as three cards. All options remain keyboard accessible and collapse to one column on small screens.
- Diagnostic details start with a readable status interpretation and current route. The header shows resolution and the latest sample time. RTT and bitrate trends use bounded current-session samples, preserve gaps, and include numerical text and accessible labels.

## Technical fixes

1. An explicitly reported zero available outgoing bitrate now counts as congestion rather than missing data. Existing consecutive-sample and stepwise adaptation rules still apply.
2. A sequenced release-all message now advances the pointer sequence barrier. Older unordered motion cannot move the host after the controller releases local input. Reliable key/button releases continue to execute.
3. Telemetry interpretation distinguishes packet loss, buffering, processing pressure, and high RTT. A static desktop with zero fps/bitrate is not mislabeled as a dead connection. The interpretation is a local heuristic, not a performance guarantee.

## Local session summaries

The former placeholder page now displays real summaries emitted by actual host/controller lifecycle code. Waiting/cancelled attempts are distinguished from established connections. The success boundary is the reliable input channel becoming ready; the recorder is idempotent across WebSocket, failure, and React cleanup callbacks.

Only these fields are allowed: a random local identifier, role (share/control), start/connected/end timestamps, outcome enum and transport route enum. No server session ID, user-entered code, token, SDP, address, device name, screenshot, video, or keyboard content is stored.

Default behavior is memory-only for the current login. The user may opt into per-account local persistence on this computer. Loading and saving enforce a maximum of 50 records from the latest 30 days; reading also prunes the stored copy. This is local convenience metadata, not a server audit log or a cross-device history service. A local user with access to the browser profile may inspect the enabled metadata.

Terminal callbacks after logout may write only to the original account's opted-in store and never populate another account's UI. Corrupt dates, malformed rows, duplicate IDs and unknown fields are filtered. Storage failures do not interfere with stopping control, and the UI distinguishes write failure from deletion failure with a retry action.

## Verification and scope

- Unit regressions cover zero-bandwidth pressure, delayed-motion barriers, data whitelisting, capacity/retention, duplicate teardown, clock rollback, invalid dates and bounded/gapped trends.
- Browser checks used synthetic accounts in a temporary in-memory Go service. An invalid code created a failed-attempt summary; an active waiting session was terminated through confirmed logout and retained under opt-in persistence.
- Radio keyboard navigation, session filtering, clear confirmation/cancellation, light desktop and dark 320px layout with larger text were checked. The real WebRTC loopback populated the trend UI with measured video stats.
- No hidden operation, screen recording, credential capture, unattended access, or new runtime package was introduced.
- Cloud deployment, real Windows capture/input/DPI, external TURN, hardware codec paths and second-machine installation remain unverified. Native multi-monitor work is not implied by the UI changes.
