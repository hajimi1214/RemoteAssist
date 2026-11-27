# G0 Open-Source Audit

Audit date: 2026-11-27

## Scope and source revision

This audit starts from the repository's GitHub `main` tip observed on 2026-11-27, commit `2e4806f57ecef4bc295a6cdda2e9639a930443a8`. A fresh `git ls-remote` check during the follow-up still returned that same `main` tip. The local engineering branch contains that commit as an ancestor and adds local engineering and verification commits through `b8329a238a25b693819aa680c6f4c23f8960b674`. The audit work is on `codex/g0-open-source-audit`. No upstream branch was modified or pushed.

The source review covered React/TypeScript, Tauri configuration and capabilities, Rust capture and input, Go HTTP/WebSocket/session/authentication/database code, PostgreSQL migrations, Docker Compose, deployment scripts, Windows and Android packaging, and GitHub Actions. This is a repository review with automated checks. It is not a penetration test, legal opinion, full accessibility audit, or review of every generated installer and container package.

## Project state

RemoteAssist already has substantial product implementation. The React/Tauri client, Rust Windows capture and input layer, Go signaling service, PostgreSQL-backed account/device store, WebRTC transport, and Coturn/Caddy deployment composition are present. The client allows the operator to configure a signaling service, uses P2P with TURN candidates as fallback, and contains a private-LAN-only HTTP test build path. The production desktop configuration does not embed an author-operated service address.

The project is not yet ready to describe itself as a generally supported, released open-source platform. It has no project-level license or published release workflow. Contributor, support, conduct, changelog, and security-policy documents now exist, but the private vulnerability intake is not configured. Physical second-PC installation and control, public TLS deployment, and TURN relay operation remain unverified in the project records.

## Feature status

Status meanings:

- **VERIFIED** means the stated behavior passed a real runtime check at the named scope.
- **AUTOMATED** means regression or synthetic integration tests cover the behavior, without proving it on independent physical endpoints.
- **IMPLEMENTED** means code exists but the stated behavior does not yet have sufficient test evidence.
- **UNVERIFIED** means the environment or evidence is missing.
- **UNSUPPORTED** means the product does not implement the feature.

The detailed current matrix is maintained in [`verification-matrix.md`](verification-matrix.md). The principal classifications are:

| Area | Status | Evidence boundary |
|---|---|---|
| Frontend forms, device workflows, responsive UI, preferences | AUTOMATED | Node tests and TypeScript/Vite build |
| Signaling authentication, session lifecycle, one-time code, device ownership | AUTOMATED | Go tests, including real test WebSocket lifecycle cases |
| PostgreSQL migrations | VERIFIED, local PostgreSQL | Migration runner exercised on local PostgreSQL 18.2; production deployment remains unverified |
| Windows DXGI primary-display capture | VERIFIED, limited historical samples | Visible desktop smoke has passed on this machine. The latest isolated runner smoke failed before frame acquisition because the runner could not access the interactive desktop |
| Windows native input authorization and release | AUTOMATED | Rust and TypeScript boundary tests; physical cross-PC input still unverified |
| Same-account and one-time-code service endpoints | VERIFIED, local API only | Live in-memory API checks; not a two-device media session |
| WebRTC video and input transport | AUTOMATED | Synthetic Chromium loopback; installed two-PC media behavior remains unverified |
| Direct P2P and TURN route selection | AUTOMATED | Candidate selection and relay labeling tests; public P2P/TURN operation remains unverified |
| LAN two-Windows connection | UNVERIFIED | A user-reported current session worked well enough to expose first-seconds and page-switch stutter. Detailed installed package, build identity, and simultaneous endpoint telemetry have not been recorded |
| Windows installer and Android APK | IMPLEMENTED | Build paths exist. Current-source package generation passes locally. Signing and broad installation acceptance remain unverified |
| Public server deployment and HTTPS | IMPLEMENTED | Compose, config checks, migrations, backup/restore scripts, and docs exist. Live public infrastructure remains unverified |
| TURN relay deployment | IMPLEMENTED | Coturn integration and short-lived credentials exist. Public allocation and fallback remain unverified |
| System/game audio | UNSUPPORTED | No audio capture, Opus stream, playback, mute, or A/V synchronization path |
| Multi-monitor display selection and resolution control | UNSUPPORTED / UNVERIFIED | Current capture targets the primary display; extensions are not implemented or fully validated |
| Linux/macOS desktop clients | UNVERIFIED | No support claim is justified by current project evidence |

## Security and privacy review

The reviewed authorization path checks account/device ownership for same-account direct sessions and uses authenticated single-use codes for cross-account assistance. The native Windows host validates the session capability and lease before applying input. Session close, expiry, disconnect, revocation, and input release have regression coverage. The Tauri capability file grants a short allowlist of visible-window operations. The inspected code and deployment configuration do not add remote shell, arbitrary command execution, hidden capture, default autostart, UAC bypass, credential capture, or post-session recording.

The repository contains WebSocket and input size/rate bounds, authenticated routes, password hashing, token hashing, session expiry, Docker privilege reduction, and secret placeholders. Existing local security review and dependency-audit evidence is referenced from `security-review-latest.md` and `STATUS.md`.

Open security and release risks:

1. The default desktop and Android CSP allow generic `https:` and `wss:` origins to support user-configured service addresses. The LAN test package narrows these origins. The production trust boundary depends on the user selecting a service and on HTTPS certificate validation. Add an explicit security decision and tests for configured-origin behavior.
2. LAN test packages intentionally use private-address HTTP and cleartext credentials. They are compile-time isolated from the normal release package and must remain visibly test-only.
3. Deployment secrets remain operator-managed. Actual TLS, firewall, database, TURN, and backup/restore operation has not been verified against public infrastructure.
4. Local browser/client history is not an authoritative server audit record. Do not market it as one.
5. `SECURITY.md` now documents that no private vulnerability-reporting channel is configured. The owner must enable GitHub private vulnerability reporting or publish a monitored private contact method before public launch.

No P0/P1 finding was established in this source review. This statement is limited to the reviewed code and tests. It is not a claim that the product has passed penetration testing.

## License review and recommendation

There is currently no root `LICENSE` or other project-level grant. `LICENSES.md` records only a subset of dependencies and previously pointed readers to `Cargo.lock`, which does not contain license metadata. The resolved third-party component inventory is now in [`third-party-components.csv`](third-party-components.csv).

Two permissive options were evaluated:

| License | Practical fit | Main project obligations |
|---|---|---|
| Apache-2.0 | Recommended for owner review. It includes an express contributor patent license and clear contribution/redistribution terms suited to a remote-desktop platform that integrates codecs, transport and native APIs | Include the license, retain required notices, mark changed files, and carry applicable `NOTICE` attributions |
| MIT | A simpler, short permissive grant that is widely familiar to application contributors | Preserve the copyright and permission notice. It does not include Apache-2.0's express patent-license section |

The official Apache text describes both copyright and patent grants and redistribution notice conditions. The Open Source Initiative's MIT text requires retaining its copyright and permission notice. See the [Apache License 2.0 text](https://www.apache.org/licenses/LICENSE-2.0.txt) and [MIT License text](https://opensource.org/license/mit).

Recommendation: select Apache-2.0 after the copyright owner confirms they have authority to license all project-owned code and assets. The audit does not add a `LICENSE` file because the repository does not identify a copyright holder, and a license file would be a legal grant. The bundled PNG and ICO are each a 16×16 RGBA solid-color image, with all 256 pixels equal to `#146C94`. Git history traces them to the initial MVP commit `4c4b175` dated 2026-06-07, but that commit does not identify who selected or generated them. No third-party artwork is visible in their pixel data, but confirm ownership before publication.

The CI workflow now pins each GitHub Action to an immutable commit. The pinned checkout v7.0.1, setup-node v7.1.0, and setup-go v6.2.0 action manifests were checked and declare the Node 24 runtime. This followed discovery that the previously pinned v4 actions still declared Node 20, which GitHub-hosted runners removed on 2026-09-23, as announced in the [GitHub Actions runtime notice](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/). Rust toolchain setup is also pinned to the observed `stable` branch commit. The pins are accurate as of 2026-11-27 and should be deliberately refreshed when updating CI dependencies.

Dependency observations:

- npm: 88 resolved packages, all with license metadata.
- Cargo: 446 resolved third-party crates, all with SPDX expressions. The graph contains MPL-2.0 packages and alternative license expressions that include LGPL-2.1-or-later. Record the selected license path and fulfill source/notices obligations for each distributed binary.
- Go: 7 resolved modules. The module cache did not contain top-level license files for these source archives. Upstream license identities and source references are recorded in the component inventory.
- Containers: the current Compose deployment references PostgreSQL, Coturn, Caddy, and the Go/Alpine build/runtime images. Their OS packages and bundled assets have mixed licenses. The repository does not produce a container SBOM.
- Android and Windows builds also rely on third-party toolchains/runtime components. Gradle Wrapper distribution hash is pinned. WebView2 Evergreen is an installed Microsoft runtime and is not bundled by this project.
- No downloaded web fonts or copied third-party remote-desktop implementation were found in the reviewed source. The project icon provenance remains undocumented.

## Open-source foundation gaps

Not present in the audited source tree:

- Project license and copyright notices.
- Automated Windows artifact publishing and checksum manifest.
- Container image digest pinning and automated SBOM refresh in CI.

The repository now has English and Chinese project homepages, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, bug/feature Issue forms, and a PR template. The security policy explicitly states that no private vulnerability intake is configured. The English README states the no-author-operated-service model, and `PLANS.md` was replaced with the staged G0–G5 roadmap. The simple solid-color icons do not contain visible third-party artwork, but their original selection/generation history is still unverified.

## Validation performed for this audit

| Check | Result |
|---|---|
| GitHub remote branch check | PASS. `origin/main` resolved to `2e4806f57ecef4bc295a6cdda2e9639a930443a8` |
| npm audit | PASS, 0 reported vulnerabilities |
| Frontend test suite | PASS, 122/122 on the current source commit |
| Frontend production build | PASS |
| Go tests, serialized with `GOMAXPROCS=2` and `-p=1` | PASS across all packages |
| Go Vet, serialized with `-p=1` | PASS |
| `go mod verify` | PASS |
| Third-party component inventory generation | PASS, 552 resolved components |
| Inventory drift check | PASS locally on Windows. The CI job is added, but its remote GitHub Actions run remains unverified |
| GitHub Actions references | PASS, all workflow `uses:` entries pin verified commit SHAs. Checkout, setup-node and setup-go use action manifests declaring Node 24. Remote workflow execution remains unverified |
| GitHub Actions workflow lint | PASS, actionlint 1.7.7 |
| Markdown links in new project/participation docs | PASS, local targets resolve |
| GitHub Issue forms | PASS, both YAML files parsed with temporary PyYAML 6.0.3 under `.local/`, and required fields/privacy statements checked. No Python project dependency was added |
| Community documentation | PASS, local links checked in 10 public project and contribution documents |
| Upstream container image SBOMs | PARTIAL. Five linux/amd64 image manifests were scanned by digest with Syft 1.57.2, yielding 392 package records. 169 raw SPDX entries have `NOASSERTION` license metadata. A separate Caddy Go-module review mapped 121 of its 123 Go package entries to upstream licenses, leaving two Go entries and the OCI image root unresolved. SPDX files, crosswalk, and digests are recorded in `docs/container-image-sbom/`. The Dockerfile-built signaling image and other architectures remain unverified because Docker Engine is unavailable |
| Rust formatting | PASS, `cargo fmt --check` |
| Rust check | PASS, `cargo check --locked -j 1` |
| Rust tests | PASS, 25 passed, 1 ignored because it requires a visible unlocked desktop |
| Windows LAN debug package | PASS on the preceding diagnostics commit. It is a local unsigned test installer and is not a public release |
| Go Race in this audit run | NOT VERIFIED. Parallel build checks exhausted the Windows page file; the retry avoided the issue, but the race run was not repeated |
| Public deployment, second-PC installation, TURN relay, code signing, penetration test | NOT VERIFIED |

The initial parallel test attempt failed because the host exhausted its page file while several Go/Rust compiler processes ran simultaneously. Serialized tests passed afterward. This is an environment resource failure, not a source test failure.

## Technical debt and release risks

1. **P1 — No project license or verified icon ownership.** The project cannot be responsibly redistributed as open-source until the owner confirms copyright authority and chooses a license.
2. **P1 — No public vulnerability reporting route.** Security issues need a documented private intake process before broad distribution.
3. **P1 — Unverified independent installation and real remote-control flow.** Current project evidence does not establish repeatable two-PC installation, stream stability, or input reliability.
4. **P1 — Public HTTPS/TURN infrastructure unverified.** Self-hosting scripts and docs are implemented, but operational success is unknown.
5. **P2 — Third-party license/SBOM delivery is incomplete.** Lockfile license metadata has a reproducible inventory and CI drift check, but container package SBOMs and binary notice bundling are absent.
6. **P2 — Container image and package licensing coverage is incomplete.** Compose image tags remain mutable, 169 raw SBOM entries have `NOASSERTION` before supplemental crosswalk review, two Caddy Go entries and the image-root record remain unresolved, and the Dockerfile-built signaling image was not scanned. Pin image digests, investigate the remaining license questions, and automate SBOM refreshes before release. GitHub Actions are pinned to verified commit SHAs.
7. **P2 — CI lacks Windows installer artifact/checksum production.** Current workflow checks source and native compilation but not the user-facing release artifact.
8. **P2 — Long-term session/media performance remains unmeasured on a known two-PC setup.** The reported LAN stutter has useful client-side telemetry but no simultaneous sender/receiver capture from a known package/build.
9. **P2 — Platform claims need a capability matrix.** Windows is the first supported desktop target. Android controller paths exist but current-source physical validation is incomplete. Linux/macOS support is not established.

## G0 disposition

The source and workflow review, feature-status classification, dependency inventory, license comparison, technical debt list, and release risk list are recorded. The initial G0 report and inventory were committed as `b8fe8d79c0f83ac99eccedf412b134a4d03a0c66`. G0 is **READY FOR OWNER REVIEW**, not a declaration that the project is legally licensed or release-ready. The project license/copyright holder and icon provenance remain owner decisions. Do not begin G1 implementation until the owner accepts the G0 findings and resolves any required ownership decisions.
