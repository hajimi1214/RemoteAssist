---
name: remote-desktop-builder
description: Develop a legal, visible, explicitly authorized Windows remote assistance product by milestone. Use when inspecting existing code, implementing milestone work, running real tests, fixing errors, updating status files, or preserving authorization safeguards while explicitly avoiding unattended access, hidden operation, and remote shell features.
---

# Remote Desktop Builder

## Workflow

1. Read `AGENTS.md`, `PLANS.md`, `STATUS.md`, and the relevant source files before changing code.
2. Confirm the requested milestone and keep edits limited to that milestone.
3. Preserve visible operation and explicit controlled-side authorization.
4. Refuse or redesign any request that introduces hidden windows, hidden tray icons, disguised process names, silent installation, default autostart, unattended access, remote shell, script execution, arbitrary command execution, UAC bypass, privilege escalation, Defender evasion, or security policy modification.
5. Implement only the required code changes.
6. Run real, relevant tests after code changes and mark each result as `PASS`, `FAIL`, or `NOT VERIFIED`.
7. Fix discovered errors when in scope, then rerun the affected tests.
8. Update `STATUS.md` after each completed milestone with completed work, test results, known limits, and next steps.
9. Create a Git commit after each completed milestone when the workspace is ready.

## Safety Requirements

- Require explicit authorization before starting or accepting a remote assistance session.
- Reject input when the session is expired, disconnected, unauthorized, over rate limits, structurally invalid, or token-invalid.
- Limit WebSocket message sizes.
- Do not add keyboard logging, credential capture, screen recording, post-session capture, hardcoded secrets, or TURN secrets in source.
- Do not fabricate test output or imply unverified behavior passed.
