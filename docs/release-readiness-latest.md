# Release readiness — 0.5.0-alpha

Reviewed 2026-11-20.

## Verified UI behavior

PASS — login Enter submission, registration semantics, correct control shortcut, device-note saving and confirmation flows, safe error display, service retry controls, keyboard tabs, theme/large-text selection.

PASS — checked layout at 320/768/1100/1920 CSS px, including 200% root-text scaling on the actual App. No horizontal page overflow in checked pages. Remote video at 100/150% scrolls inside its own viewport.

PASS — generated portrait/ultrawide streams, fit scaling, fullscreen entry/exit, local input start/stop, Escape/Tab release and safe handling of geometry changes.

## Final automated checks

PASS — scripts/test.ps1: 14 frontend tests and production build, Go tests/build, Rust check and 5 native tests. npm audit reports zero vulnerabilities; git diff whitespace checks pass.

PASS — Windows portable EXE and RemoteAssist_0.5.0-alpha_x64-setup.exe built successfully (approximately 1.89 MiB). This validates packaging with the example domain, not installation or production connectivity.

## NOT VERIFIED

- Complete WCAG compliance, screen-reader/high-contrast/touch-device acceptance.
- Live Windows capture/input/clipboard/native consent, OS DPI calibration and secondary monitors.
- Two-machine LAN/public TURN, cloud firewall/DNS/certificates, PostgreSQL/container runtime and GitHub-hosted CI.
- Local Go race detector requires unavailable CGO/compiler; configured in Linux CI.

## Delivery constraints

Build with the real signaling HTTPS domain. The example-domain package is only a packaging check and cannot connect to the user's cloud server. Keep server and clients on the 0.4-or-newer protocol; 0.3 URL-token clients are unsupported. One signaling replica only.
