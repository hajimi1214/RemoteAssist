# Contributing to RemoteAssist

Thank you for considering a contribution. RemoteAssist is a visible, user-authorized remote desktop project focused on local-network use and operator-controlled self-hosting.

## Project status

The project is currently `0.15.1-alpha`. The copyright holder has not yet selected a project-level license. Until that decision is made, do not add a license grant, CLA, copyright notice, third-party asset, or copied implementation on behalf of the project. Proposed contributions may be reviewed, but merging and redistribution must follow the repository owner's licensing decision.

The staged roadmap and acceptance boundaries are in [`PLANS.md`](PLANS.md). G0 is awaiting owner review. Do not treat local builds as evidence of public-network or independent two-PC acceptance.

## Before opening an issue or pull request

- Search existing issues and documentation for the same behavior.
- Keep one change focused and describe the user-visible or maintenance reason.
- Never include passwords, API keys, signing material, access or refresh tokens, TURN credentials, private device identifiers, screen contents, or input contents.
- Do not publicly post details of a security vulnerability. The repository's private vulnerability intake is not fully configured yet. Maintainers must establish it before public launch.

## Development setup

Supported development versions are Node.js 24, Go 1.26.11, and stable Rust for Windows.

```powershell
npm ci
npm test
npm run build
```

Go service checks:

```powershell
Push-Location server
go test ./...
go vet ./...
go mod verify
Pop-Location
```

Windows native checks:

```powershell
Push-Location src-tauri
cargo fmt --check
cargo check --locked
cargo test --locked
Pop-Location
```

The complete local check script is `.\scripts\test.ps1`. On memory-constrained Windows runners, run Go and Cargo checks serially and set Go package parallelism to one if needed.

When dependency manifests, lockfiles, container references, or CI tools change, refresh and verify the third-party inventory:

```powershell
npm run licenses:generate
npm run licenses:check
```

Review the resulting license and version diff. Do not add runtime dependencies without documenting their purpose and license.

## Pull request expectations

- Explain the problem, behavior change, and any compatibility or security impact.
- Preserve React/TypeScript, Tauri, Rust, Go, PostgreSQL, WebRTC, Coturn, and Caddy boundaries unless measured evidence justifies a scoped architectural change.
- Keep host sharing visible. Do not add hidden control, default autostart, shell or arbitrary command execution, UAC bypass, Defender evasion, credential capture, keyboard logging, or post-session capture.
- Validate authorization, session state, capability tokens, payload size/schema, event rate, expiry, and release behavior when changing signaling or remote input.
- Add or update focused tests for behavior changes. Do not remove failing coverage or weaken assertions to make a check pass.
- Record results as `PASS`, `FAIL`, or `NOT VERIFIED`. Do not describe synthetic loopback or package generation as physical two-PC acceptance.
- Update the relevant status, verification, security, deployment, and known-limitation documents when evidence or supported behavior changes.
- Do not create a GitHub Release or claim an unsigned package is signed.

## Review and merge

Maintainers review scope, test evidence, security boundaries, third-party licensing, and documentation. No CLA or contribution agreement has been established. The project owner must resolve the project license and contribution policy before accepting contributions for public redistribution.
