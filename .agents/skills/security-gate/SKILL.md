---
name: security-gate
description: Review a remote assistance milestone for security policy compliance after milestone completion. Use when checking for hidden operation, silent installation, default autostart, unattended access, unauthorized input injection, remote shell or arbitrary command execution, hardcoded secrets, missing message-size limits, expired-session input acceptance, sensitive log leakage, or fabricated test results; write findings to docs/security-review-latest.md.
---

# Security Gate

## Workflow

1. Read `AGENTS.md`, `STATUS.md`, and the milestone changes.
2. Inspect code, configuration, scripts, packaging files, and documentation relevant to the milestone.
3. Check each required gate and record evidence with file paths.
4. Write `docs/security-review-latest.md`.
5. Mark each gate as `PASS`, `FAIL`, or `NOT VERIFIED`.
6. Do not claim a gate passed without direct evidence.

## Required Gates

- Hidden windows, hidden tray icons, or process disguise.
- Silent installation.
- Default autostart.
- Unattended access.
- Unauthorized input injection.
- Remote CMD, PowerShell, Shell, scripts, or arbitrary command execution.
- Hardcoded passwords, tokens, certificates, TURN keys, or other secrets.
- Missing WebSocket message-size limits.
- Expired or disconnected sessions still accepting input.
- Logs exposing sensitive data.
- Fabricated, stale, or unverifiable test results.

## Report Shape

Write concise findings to `docs/security-review-latest.md`:

- Scope reviewed.
- Gate results.
- Evidence.
- Required fixes.
- Test results, using only `PASS`, `FAIL`, or `NOT VERIFIED`.
