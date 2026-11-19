# 0.5 validation record

Date: 2026-11-20. Local Windows environment; UI exercised through the in-app browser against the real Vite app and an isolated Go in-memory service. Test accounts and devices were synthetic and are not production data.

## Browser checks — PASS

Base token contrast calculations: light body 15.41:1, light secondary text 5.59:1, dark body 13.77:1, dark secondary text 8.54:1, white primary-button text 5.79:1. These are checked color pairs, not a certification of every possible state.

- Login submitted with Enter; registration exposes required username/email/password/confirmation and consent fields.
- Dashboard shortcut for connecting opens the controller tab (rather than host sharing).
- All checked dashboard widths (320, 768, 1100, 1920 CSS px) have document scrollWidth no greater than viewport width. Logout remains visible.
- At 320 px, long device names wrap, cards reflow, and note save reports success. Unbind opens a confirmation dialog; cancellation preserves the device.
- Theme selection and larger-text preference work. Dark-theme review performed.
- A test-only entry renders the real App with a 32px root font (200%). Devices, assistance, history and settings at 320 px have no horizontal page overflow; controller controls remain inside the page.
- Full-width/spaced code paste normalizes to eight ASCII digits. Invalid code yields a localized actionable error, not the raw server payload.
- Assistance tab keyboard navigation works (arrow key focus followed by Enter activation).
- A synthetic waiting session triggers a navigation confirmation. Cancel preserves the session; confirm ends it and reaches the requested page.
- Generated video fixture: start input, click stop, Escape, and Tab all release input correctly. Escape focuses the toolbar toggle.
- Portrait (1080×1920) and ultrawide (3840×1080) fit without distortion. At 320px viewport, portrait display measured 241.3125×429 and ultrawide 256×72; 100% mode scrolls inside the video viewport while the page remains 305px wide.
- Fullscreen enters/exits and exposes the disconnect action. Resizing or changing video dimensions suspends local remote-input capture.

## Reproduce

Use Node 24. Start an isolated in-memory signaling service and Vite with its loopback URL. The production App is the main entry; test-only entries are:

- `/tests/screen-preview.html`: generated landscape/portrait/ultrawide video and a simulated input sink. Does not capture desktop or inject native input.
- `/tests/responsive-app.html?text=200`: actual App with only root text size increased. Authentication and server authorization are unchanged.
- `/tests/webrtc-loopback.html`: existing real WebRTC transport regression harness.

These fixtures are outside the production source entry and are not bundled in the installer. Screenshots in `docs/previews/` use synthetic data; the footer may show the pre-release development version from before the version bump.

## NOT VERIFIED

Final automated validation: scripts/test.ps1 PASS (14 frontend tests, frontend production build, Go tests/build, Rust check and 5 native tests); npm audit zero vulnerabilities. Windows EXE and NSIS 0.5.0-alpha packaging PASS with example HTTPS domain. These checks do not replace the manual validation items below.

- Real host capture/approval, live clipboard copy of a session code, real hardware multi-monitor/DPI mapping, public TURN and a second Windows installation.
- Full WCAG compliance, screen-reader output, OS high-contrast mode and touch-device input.
- Native WebView2 fullscreen/zoom acceptance. Browser tests validate browser behavior, not every native window configuration.
- Cloud deployment and live PostgreSQL; this milestone changes the client UX rather than its server architecture.
