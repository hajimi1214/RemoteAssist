# UI follow-up — 2026-11-20

This update refines the existing guest-first workflow without changing authentication, host consent or transport behavior.

## Visual changes

- Guest and authenticated dashboards share a small desktop-and-device illustration built from HTML/CSS and existing SVG icons. It is decorative and excluded from accessibility output.
- Navigation now pairs icons with labels, uses consistent spacing and a subtle active border. Narrow layouts keep text labels; the smallest layout omits icons to preserve room.
- Action cards have clearer hover feedback and arrow affordances. Card surfaces, status messages, guest guidance, footer feedback and scrollbars use consistent styling in light and dark themes.
- Login keeps its compact dismissible layout and gains a visual separation before the consent reminder. Floating-field padding/label offsets scale with the root text size.
- Removed the superseded guest device-square illustration rules. No dependencies were added.

## Interaction changes

Opening login focuses the username field, and switching login/registration or returning to a previous step focuses the relevant field. Clicking the password eye retains input focus. When a dialog is closed, its input blur is not treated as a validation attempt; this also prevents React development effect replay from displaying an error on first open. Actual user blur and submit validation continue to work.

Feedback generation focuses the read-only report and returning to edit focuses the description. Device search has a polite result-count status, a dedicated no-results view and a clear action that restores search focus. Refresh, note save and assistance requests identify their pending operation instead of presenting the same generic label. Loading indicators respect reduced-motion preferences.

## Validation

PASS:

- 48 existing frontend regressions, production TypeScript/Vite build and Git whitespace checks. No implementation-mirroring tests were added for the visual edits.
- Guest workspace at 1280×686 and 1100×626: no document or workspace overflow; authenticated workspace at 1100×626 also fits. Those heights leave room for the native title bar.
- All five main pages at 320×640 with dark theme and larger text: no horizontal overflow; document height remains the viewport height, with content scrolling inside the workspace.
- Login initially focuses username with zero field errors; actual blur produces the expected error; reopening starts with zero errors. Switching to registration focuses username. Clicking the eye retains password focus and changes input type.
- Feedback preview and edit both focus their corresponding text area. Device search reports zero results, clear restores the list, and refresh reports completion.
- A fresh browser session has no console errors after the final changes. Transient Vite cache errors during editing were resolved before validation.
- The actual maximized Windows application shows the new signed-in dashboard, with minimize/restore/close visible. The application and local service remain running.

NOT VERIFIED:

- OS high-contrast mode, screen-reader end-to-end behavior, arbitrary custom font overrides, all monitor/DPI combinations and a new installer build. The built-in larger-text mode was exercised; this is not a full WCAG conformance audit.
- Backend/native tests were not repeated for this frontend-only follow-up; the preceding 0.8 milestone records their results.

Screenshots and check logs are retained locally under ignored `.local/ui-polish/` and `.local/ui-polish-tests.log`.
