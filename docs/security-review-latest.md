# Security review — 0.5.0-alpha

Reviewed 2026-11-20. Scope: frontend interaction/layout refactor and native consent localization, building on 0.4 controls.

## PASS — reviewed behavior

- Host native approval, session-token checks, native expiry/heartbeat lease and input revocation remain required. UI enhancements do not create unattended access.
- Controller initially views only; it explicitly enables input after video arrives. Escape/Tab, blur and geometry changes release input. Stop/disconnect stays visible in fullscreen.
- Leaving an active session requires explicit confirmation; cancellation keeps the session. Native unmount/disconnect cleanup is retained.
- Async page/device callbacks are guarded against obsolete account/component state; navigation consults current session activity.
- Errors shown to users are fixed safe text rather than arbitrary server bodies.
- No new remote shell, hidden operation, autostart, silent install, screen recording or clipboard synchronization was added.
- Clipboard use copies only the temporary connection code on an explicit button click. Native clipboard behavior remains NOT VERIFIED.
- Theme/text settings persist only non-secret preferences. Credentials keep the pre-existing Windows Credential Manager path.
- Test fixtures use generated canvas video, simulated input delivery and synthetic local account data. They are not included in the production Vite entry.
- Research references are documented; no external project source/assets were copied and no new runtime package is needed.

## Remaining limits

- Browser tests do not prove real OS input/capture behavior, native WebView2 fullscreen, DPI/secondary-display mapping, or full accessibility conformance.
- Primary display still requires host selection/confirmation; no automatic physical-display identity proof is introduced.
- Cloud/TURN/PostgreSQL/backup/restore, local Go race and complete penetration testing remain outside the verified scope.
- Existing native credential-storage failure handling still falls back to in-memory authentication; a broader secure-store recovery UX is future work.
