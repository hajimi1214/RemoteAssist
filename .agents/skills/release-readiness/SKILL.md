---
name: release-readiness
description: Perform pre-deployment readiness checks for the Windows desktop client, Go server, Docker Compose configuration, environment examples, secrets handling, TURN configuration, health checks, ports, manual test steps, known limitations, and copy-pasteable deployment commands. Use before release or deployment.
---

# Release Readiness

## Workflow

1. Read `AGENTS.md`, `STATUS.md`, deployment files, build files, and environment examples.
2. Run real checks where possible and mark results as `PASS`, `FAIL`, or `NOT VERIFIED`.
3. Do not infer build success without executing the relevant command.
4. Confirm secrets and TURN values are supplied through environment variables.
5. Confirm deployment commands are directly copy-pasteable.
6. Record true known limitations.

## Required Checks

- Desktop client builds.
- Go server builds.
- Docker Compose validates.
- `.env.example` is complete.
- No hardcoded secrets.
- TURN is configured through environment variables.
- Health checks exist.
- Port documentation is complete.
- Manual test steps are complete.
- Known limitations are recorded truthfully.
- Deployment commands can be copied and run directly.

## Output

Summarize readiness with:

- `PASS` for verified success.
- `FAIL` for verified failure.
- `NOT VERIFIED` when not checked or no evidence exists.
