# RemoteAssist Roadmap

RemoteAssist is being developed as an open-source remote desktop platform that people can inspect, run on a LAN, and deploy on infrastructure they control. The project does not operate or require an author-run public signaling or TURN service. A user must deliberately configure the service used by their clients.

## Current source

- Application version: `0.15.1-alpha`
- GitHub `main` rechecked on 2026-11-28: `2e4806f57ecef4bc295a6cdda2e9639a930443a8`
- Local engineering source at G0 start: `b8329a238a25b693819aa680c6f4c23f8960b674`
- G0 audit work is published on `codex/g0-open-source-audit`; GitHub `main` is unchanged

## Staged roadmap

Complete and review each stage before starting the next one. Each stage needs a report, updated evidence, and a separate commit. Do not claim completion based on code presence or synthetic tests when the stage requires real-device or public-network evidence.

| Stage | Scope | Current status | Gate |
|---|---|---|---|
| G0 | Source/security review, dependency and license inventory, feature-status matrix, technical debt, open-source release risks | READY FOR OWNER REVIEW. See [`G0 audit`](docs/g0-open-source-audit.md) | Owner confirms project copyright authority, license direction, and icon provenance; configure private vulnerability reporting before a public release |
| G1 | Trusted LAN use, safe self-hosted signaling/database/TURN deployment, server configuration and recovery, two-Windows LAN acceptance | NOT STARTED | Real two-PC LAN media/input and self-host configuration acceptance |
| G2 | End-to-end capture, encode, network, decode, presentation and input latency measurement and optimization | NOT STARTED | Repeatable measured performance on documented physical endpoints and network conditions |
| G3 | Additional remote-desktop capabilities such as multi-display, audio, clipboard and file transfer | NOT STARTED | Design and acceptance for each feature, with authorization/privacy controls |
| G4 | Security, long-duration stability, recovery, platform capability matrices and maintenance | NOT STARTED | Security/stability evidence for each supported platform |
| G5 | Public project docs, CI/release automation, signed-or-clearly-unsigned artifacts, contributor workflow and community support process | NOT STARTED | Independent new-user installation, deployment and contribution walkthrough |

## Existing implementation that informs the stages

The current source already contains a React/TypeScript client, a Tauri 2 desktop shell, Windows Rust capture/input code, a Go signaling service, PostgreSQL migrations, WebRTC transport, Coturn integration, and a Docker Compose deployment. This is implementation evidence, not acceptance of G1–G5.

The current verification matrix records scope and evidence for implemented features. Important remaining manual checks include an independently installed second Windows client, real P2P and TURN paths, public TLS/deployment, sustained media performance, physical input-to-display latency, and long sessions.

## Review discipline

- Preserve the current React, Tauri, Rust, Go, PostgreSQL, WebRTC, Coturn and Caddy architecture unless measurements justify a scoped change.
- Keep the host visibly in control of sharing. Do not add hidden operation, default autostart, shell execution, UAC bypass, credential capture or post-session capture.
- Keep `VERIFIED`, `AUTOMATED`, `IMPLEMENTED`, `UNVERIFIED`, and `UNSUPPORTED` evidence labels distinct.
- Do not create a legal project license until the copyright owner approves the grant and the repository's asset provenance is known.
- Do not publish a Release or claim public network support from local builds or synthetic tests.
