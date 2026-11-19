# 0.5 UI, responsiveness and usability research

Reviewed 2026-11-20. The user requested a continued technical/UX upgrade and research. These are source-based engineering choices, not a claim of complete WCAG certification or native multi-monitor support.

## Verified primary references

| Source | Requirement / evidence | Applied decision |
| --- | --- | --- |
| [WCAG 2.2 — Reflow 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Ordinary content should reflow at 320 CSS px without loss of content/functions or two-dimensional page scrolling. Spatially essential two-dimensional content has an exception. | Tested login, dashboard, devices, settings and assistance at 320 px. Remote video may pan inside its viewport at 100/150%; surrounding controls still reflow. Logout stays available. |
| [Resize Text 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) | Up to 200% text enlargement without loss of content/function. | Use rem typography and flexible layout. A test-only entry renders the actual App with 32px root text (200% of the default). Test all main pages and controller controls. This is a text-resize test, not a claim that every OS/browser zoom combination was tested. |
| [Target Size Minimum 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Minimum 24×24 CSS px targets or defined spacing exceptions. | Main actions use at least 44px height as a project usability goal; this is not described as the WCAG AA minimum. Checkbox labels are also clickable. |
| [Focus Not Obscured 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) | Focus must not be completely hidden by authored content. | Visible focus rings, scroll padding, a skip link, heading focus after navigation, non-sticky header on the narrowest screens, native modal dialogs and focus restoration. |
| [No Keyboard Trap 2.1.2](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html) | Users must be able to leave a focused component with a keyboard; special exit mechanisms must be explained. | Remote input is locally opt-in after the host authorizes. Escape releases remote inputs and returns focus to the toolbar; Tab releases inputs and retains native focus navigation. Neither key is forwarded remotely in this release. |
| [WAI-ARIA APG Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) | Tab/tabpanel relationships and keyboard focus behavior. | Assistance modes have labels, aria-controls and tabpanel relationships. Left/right/Home/End move focus; Enter/Space activate. Manual activation allows an active-session exit confirmation before changing modes. |
| [W3C Screen Capture Working Draft, 2026-08-27](https://www.w3.org/TR/2026/WD-screen-capture-20260827/) | displaySurface affects source selection presentation, not an authority to constrain selection. surfaceSwitching is a hint. Source pixel ratio is not a native display identity. | Continue checking actual displaySurface and requiring explicit primary-display selection. Use video metadata + ResizeObserver to fit the received image while preserving aspect ratio. Do not infer a secondary-display input transform from video size. |
| [Microsoft High DPI Desktop Application Development](https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows) | Per-monitor DPI awareness and DPI-change handling require platform work. Page metadata reviewed by research agent: 2026-09-10. | Keep client CSS reflow, remote image sizing, and native OS input geometry as separate acceptance layers. Native multi-monitor/DPI calibration remains a later milestone. |

WCAG/APG understanding pages are living documents, accessed 2026-11-20; no unsupported publication date is assigned. Earlier WebRTC and paper research remains in [0.4 decisions](research-and-decisions-0.4.md).

## New implementation

- Rebuilt the stylesheet as one token-based system instead of accumulating overrides. Logical properties, intrinsic grids, an inline-size container query for device cards, dynamic viewport units, and ResizeObserver handle changing windows.
- Added system/light/dark appearance and a larger-text preference. No new package dependency is needed.
- Redesigned Chinese login, dashboard, device management, settings and assistance panels around the existing blue/navy reference direction. Abstract artwork and icons are local SVG/CSS.
- Separated viewing from input capture. The remote toolbar provides fit, 100%, 150%, fullscreen and a visible disconnect action. Geometry changes, blur, source resize, Escape and Tab release remote input.
- Added real forms, autocomplete, validation, show/hide password, safe error messages, explicit note saving, search, confirmations, busy states and service retry.
- Protected active sessions from accidental navigation. Old async responses cannot override a newer account/page operation. Polling is sequential rather than overlapping, checks cancellation and restores online status after recovery.
- Connection codes accept pasted spaces/full-width digits; the host gets copy feedback and an independently stored expiration countdown.

## Three different meanings of screen adaptation

1. **Client UI reflow:** verified locally at 320/768/1100/1920 CSS px, with no page-width overflow in checked views.
2. **Received video presentation:** generated landscape, portrait and ultrawide streams verified for preserved aspect ratio, local panning, fullscreen, source resize, and input release.
3. **Physical remote display/input geometry:** still primary-display based. This milestone does not add arbitrary-window or secondary-monitor control, and does not claim real OS DPI acceptance.

## Limits and next experiments

- No complete WCAG conformance audit or assistive-technology certification was performed. Contrast tokens, semantics, keyboard flows and reflow were directly checked, but screen-reader/braille workflows and high-contrast Windows rendering need further validation.
- Real touchscreen remote-input ergonomics, OS capture dialogs, WebView2 fullscreen, per-monitor scaling and 4K/8K performance require actual device testing.
- Keep local history unavailable rather than displaying fabricated sessions. Durable metadata/history and calibrated native display capture remain future work.
