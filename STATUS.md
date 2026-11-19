# Status

## Current milestone

M8 — 0.5.0-alpha responsive UI and user experience. Reviewed 2026-11-20. Builds on the tested 0.4 WebRTC/input/session improvements.

## Completed

- Chinese login, dashboard, device management, settings and assistance pages, with a consolidated stylesheet and reusable components.
- Preferences are isolated from component exports to preserve Vite Fast Refresh boundaries; test preview roots clean up before hot replacement.
- Responsive navigation keeps logout available at narrow widths. Long labels/device names wrap; device cards use a container query.
- System/light/dark appearance and larger-text preferences; improved text contrast, focus rings and reduced-motion support.
- Semantic login/registration forms, Enter submission, autocomplete, show-password, native validation, safe localized error messages.
- Correct controller shortcut; accessible assistance tabs; confirmations before leaving an active session or unbinding a device.
- Explicit device-note saving, device search, busy/success/error feedback, cancellation-aware asynchronous operations, sequential polling and service retry.
- Host connection-code copy feedback, remaining-time display, step guidance, actionable errors and immediate stop/cancel controls.
- Remote view fits portrait/landscape/ultrawide video, supports 100%/150% internal panning and fullscreen. Controls remain outside the panning region.
- Local remote-input capture requires an explicit action after host authorization. Escape/Tab, blur, resizing or source-dimension changes release inputs.
- Signal-ready timeout and stale async-navigation protection. Native approval text is Chinese and preserves the primary-display limitation.
- Sources and limitations are recorded in docs/research-and-decisions-0.5.md.

## Verification

- Browser checks: PASS for real login/device-save/error/navigation flows using an isolated in-memory server and synthetic accounts.
- Reflow: PASS in checked views at 320/768/1100/1920 CSS px; no page overflow and logout stays available.
- Text scaling: PASS for actual App with 200% root text, including 320px main pages/controller view.
- Remote viewer: PASS with generated portrait/ultrawide video, local scroll at 100%, fullscreen enter/exit, explicit input activation/stop, Escape/Tab release.
- Contrast tokens: PASS for the documented light/dark body/secondary text and primary-button color pairs.
- Final automated suite: PASS — 14 frontend tests/build, Go tests/build, Rust check and 5 native tests. npm audit: zero reported vulnerabilities.
- Windows portable EXE/NSIS 0.5.0-alpha build: PASS with example HTTPS endpoint. Rebuild with the actual domain before deployment.

## Remaining limits

- No full WCAG conformance certification, screen-reader certification or native Windows high-contrast/touch/DPI acceptance.
- Remote native input still maps to the host-confirmed primary display. CSS/video adaptation does not add window/secondary-monitor control.
- Real host capture/native consent, clipboard delivery, two-machine LAN/public TURN and second-machine installation remain NOT VERIFIED.
- Active sessions remain single-process and end on restart; cloud/PostgreSQL/container runtime verification is unchanged from 0.4.
- Example-domain installers validate packaging only and must be rebuilt with the actual HTTPS server address.
- Historical screenshots use synthetic UI data and may show the pre-bump development footer.

## Next milestone

M9 — real cloud deployment and two-machine acceptance, native display calibration, weak-network benchmarks and durable audit metadata. Total model concurrency is limited to 2 including the main agent.
