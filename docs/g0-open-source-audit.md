# G0 Open-Source Audit

Audit date: 2026-11-28

## Scope and source revision

This audit starts from the repository's GitHub `main` tip observed on 2026-11-27, commit `2e4806f57ecef4bc295a6cdda2e9639a930443a8`. Follow-up `git ls-remote` checks on 2026-11-28 still returned that same `main` tip. The local engineering branch contains that commit as an ancestor and adds local engineering and verification commits through `b8329a238a25b693819aa680c6f4c23f8960b674`. The review branch is published as `origin/codex/g0-open-source-audit`; `main` was not modified.

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

1. The desktop and Android CSP allow user-configured endpoints by HTTPS/WSS scheme instead of pinning one origin. API URL validation, server CORS/WS exact-origin checks, and system TLS validation constrain the service connection. The design decision and regression coverage are recorded in [`security-review-latest.md`](security-review-latest.md). The CSP is not a hostname allowlist. A script that already executes inside the app could attempt connections to other HTTPS/WSS hosts.
2. The Windows desktop LAN test build allows private-address HTTP with test credentials and uses a package-specific single-origin CSP. The Android LAN test package uses TLS with a host-scoped test CA. These test packages have dedicated build paths, and the regular Android client rejects cleartext traffic.
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

The CI workflow pins each GitHub Action to an immutable commit. The pinned checkout v7.0.1, setup-node v7.1.0, and setup-go v6.2.0 action manifests were checked and declare the Node 24 runtime. This followed discovery that the previously pinned v4 actions still declared Node 20, which GitHub-hosted runners removed on 2026-09-23, as announced in the [GitHub Actions runtime notice](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/). Rust toolchain setup is also pinned to the observed `stable` branch commit. The pins were rechecked against repository contents on 2026-11-28 and should be deliberately refreshed when updating CI dependencies.

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

The Caddy binary crosswalk classifies `go.uber.org/zap/exp@v0.2.0` as MIT from the copyright, permission, and warranty notices in every non-test `exp/zapslog` source file at a pinned commit. It maps the Go-authored main source record to Apache-2.0. The exact image manifest labels the release v2.8.4 and identifies its source repository. Its image history verifies the Caddy release archive SHA-512. That binary's BuildInfo reports `command-line-arguments` and the Caddy v2.8.4 module. The matching upstream `cmd/caddy/main.go` SHA-256 and Apache-2.0 header are recorded in [`caddy-go-module-crosswalk.csv`](container-image-sbom/caddy-go-module-crosswalk.csv). The crosswalk now identifies 123 of 123 Go records. The Caddy OCI root has purpose `CONTAINER` and aggregates the image contents.

The Go 1.26.11 build-image follow-up matched the upstream tag's root `LICENSE` SHA-256 against the cached Go 1.26.11 distribution. This identifies the BSD-3-Clause grant for Go-authored portions corresponding to its 10 `cmd/*` package records and `go` binary record. The distribution's 13 vendored license files now map to the modules in its `modules.txt`. Twelve notices are BSD-3-Clause and one is Apache-2.0. Their file hashes and module versions are recorded in [`go-toolchain-vendor-license-crosswalk.csv`](container-image-sbom/go-toolchain-vendor-license-crosswalk.csv). The 11 toolchain SBOM component records remain `NOASSERTION` as Syft records the aggregate compiler/commands, and the evidence here does not identify license text for every compiled third-party source file.

The Caddy v2.8.4 generated main package is linked to upstream `cmd/caddy/main.go`. The official image config supplies its source repository, version, and Apache-2.0 label. Its build history fetches the Linux/amd64 release asset with the crosswalked SHA-512. The asset's Go BuildInfo lists `github.com/caddyserver/caddy/v2 v2.8.4` and package path `command-line-arguments`. The upstream `cmd/caddy/main.go` header declares Apache-2.0 and explains that xcaddy copies the file into a generated main package. Its exact SHA-256 matches the tagged source file. This resolves the previously unidentified Caddy source package record. The OCI root remains classified as an aggregate container object.

The Coturn 4.6.3 follow-up matched all 20 Debian SBOM package records to exact Debian snapshot binary archives and verified their SHA-1 hashes. Seventeen package archives contain `/usr/share/doc/<package>/copyright` files whose SHA-256 hashes are recorded. The three GCC runtime packages carry no binary copyright file; their evidence points to the GCC-12 12.2.0-14 Debian source copyright and archive. The package records are linked to their source package and version in [`coturn-debian-license-evidence.csv`](container-image-sbom/coturn-debian-license-evidence.csv). Most extracted notices use legacy text and need manual SPDX mapping. The five generic CPE aliases now map to Debian packages in the same OCI manifest.

The Coturn CPE follow-up matched its five generic identifiers to packages and source versions in the final `dpkg/status` for the recorded OCI manifest. The status file SHA-256 is `be71f047ef09874dec3d721bba9d5c88cace3be0bd0f66e1529c6dd4dc66a22a`, and its final layer digest is `sha256:e229fde44d96d5262c5044f8570ebf19fd6f5abed30061ef3f6a36aa4a09da80`. Debian purl records supply explicit SPDX expressions for Bash, gzip, OpenSSL, and util-linux. The Kerberos alias maps to four installed binaries from the `krb5` source package. Their Debian copyright text has legacy formatting that still needs manual SPDX mapping. See [`coturn-generic-cpe-crosswalk.csv`](container-image-sbom/coturn-generic-cpe-crosswalk.csv).

ScanCode Toolkit 32.5.0's `licensedcode` index found 24 distinct rule labels across 58 total matches in the SHA-256-verified `krb5` source notice. The inventory qualifies 43 match occurrences with a score of at least 90 and a span of at least 30 query tokens. Twenty-two labels identify license-text candidates such as BSD variants, MIT, ISC, OpenVision, OpenLDAP and RSA notices. One text explicitly offers BSD-2-Clause OR GPL-2.0-or-later. Two other labels are an export-compliance notice and a MIT-trademark-use restriction. The candidate keys, mapped SPDX identifiers, scores, and line ranges are in [`coturn-krb5-license-text-inventory.csv`](container-image-sbom/coturn-krb5-license-text-inventory.csv). The legacy notice does not map these regions to source files in the four installed Kerberos runtime packages, so their package-level SPDX declarations remain `NOASSERTION`. The text matching used ScanCode's direct license-index API because its CLI startup hit an empty optional plugincode hookspec incompatibility with bundled Pluggy. The 37,542 matching rules were unmodified.

The same ScanCode match profile was applied to all 12 unique copyright-file hashes found in the Coturn Debian binary/source crosswalk. The consolidated [`coturn-debian-license-text-inventory.csv`](container-image-sbom/coturn-debian-license-text-inventory.csv) contains 107 candidate rows from 171 threshold-qualified matches. The Debian source/version associations and binary package list are transcribed from verified package metadata. They locate the notices at the source-package level but do not map each matched source path to files shipped in each runtime binary. Therefore the matcher results remain candidate evidence, and the affected binary `NOASSERTION` declarations have not been replaced.

The PostgreSQL 16.16 image crosswalk maps its `moby/sys/user` and `tianon/gosu` Go packages to Apache-2.0, `golang.org/x/sys` to BSD-3-Clause, and the server source to the `PostgreSQL` SPDX license. It identifies `.postgresql-rundeps` as the virtual APK group from the image build history and the root record as an aggregate OCI container. Source hashes and release evidence are recorded in [`postgres-license-evidence.csv`](container-image-sbom/postgres-license-evidence.csv).

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
| 2026-11-28 dependency advisory refresh | PASS, npm audit found 0/88 vulnerable packages, govulncheck v1.10.0 found no reachable Go vulnerabilities, cargo-audit 0.23.0 found 0 vulnerabilities among 447 locked crates using RustSec database commit `c5279d0b0c9e8b70df666eb6d1edbabcfd1176bd`. The Rust lockfile has three unmaintained/unsound informational findings. `glib` and GTK are absent from the Windows/MSVC target graph |
| 2026-11-28 follow-up checks | PASS, `npm test` 122/122, `npm audit` 0 vulnerabilities, `npm run build`, `npm run licenses:check` (552 entries), Go tests/Vet/module verification, `cargo fmt --check`, locked Rust check and tests (25 passed, one visible-desktop test ignored), actionlint 1.7.7, Docker Compose config, both Issue-form YAML parses, and Markdown links in the updated audit documents |
| Configured-service CSP and URL regression tests | PASS, `npm test` 126/126 and `npm run build`. Tests inspect both Tauri CSP configurations, reject wildcard sources, verify HTTPS/WSS and Android cleartext settings, verify WebSocket URL origins, and reject HTTP, credentials, paths, queries, and fragments before sending credentials. Existing Go tests verify exact CORS and WebSocket origin allowlists |
| Upstream container image SBOMs | PARTIAL. Five linux/amd64 image manifests were scanned by digest with Syft 1.57.2, yielding 392 package records. The raw SPDX snapshots contain 169 `NOASSERTION` entries, including five aggregate OCI `CONTAINER` roots, one virtual APK dependency group, and 163 software-component records. The Caddy Go crosswalk maps 123 of 123 Go package records to upstream source and license evidence. SPDX files, crosswalks, and digests are recorded in `docs/container-image-sbom/`. The Dockerfile-built signaling image and other architectures remain unverified because Docker Engine is unavailable |
| Rust formatting | PASS, `cargo fmt --check` |
| Rust check | PASS, `cargo check --locked -j 1` |
| Rust tests | PASS, 25 passed, 1 ignored because it requires a visible unlocked desktop |
| Windows LAN debug package | PASS on the preceding diagnostics commit. It is a local unsigned test installer and is not a public release |
| 2026-11-28 Caddy `zap/exp` source-license review | PASS for the inspected `exp/zapslog` import: both non-test Go source files contain copyright, MIT permission, and warranty-disclaimer notices at upstream commit `87e467e9b7509962236295e116116980580ef8bc` |
| Caddy generated-main source review | PASS. The official v2.8.4 image history's release-archive SHA-512 matches the downloaded asset. Go BuildInfo records the Caddy v2.8.4 module and `command-line-arguments`. Caddy `cmd/caddy/main.go` has matching upstream SHA-256 and an Apache-2.0 header |
| Go 1.26.11 build-image source-license review | PARTIAL. The root `LICENSE` SHA-256 matches the exact upstream tag and identifies BSD-3-Clause for Go-authored toolchain source. The 10 `cmd/*` and `go` SBOM records also contain binaries with vendored dependencies covered by 13 independent license files. The supplementary [`Go toolchain crosswalk`](container-image-sbom/go-toolchain-license-crosswalk.csv) scopes its conclusion to Go-authored source |
| Go 1.26.11 vendored license evidence | PASS for 13 included license files. Their paths, module versions from `modules.txt`, license conclusions, and SHA-256 hashes are recorded. Twelve are BSD-3-Clause and one is Apache-2.0. The aggregate tool binaries' SPDX package records remain `NOASSERTION` |
| Coturn Debian binary copyright provenance | PARTIAL. All 20 Debian SBOM package archives matched by package, version, and architecture and passed SHA-1 verification. Copyright-file SHA-256 evidence is recorded for 17 binaries, with three GCC runtime packages traced to the verified GCC-12 source copyright file. Legacy copyright text still needs manual SPDX mapping |
| Coturn Kerberos copyright text | PARTIAL. ScanCode Toolkit 32.5.0 found 24 rule labels across 58 total matches. The inventory records 43 license-text match occurrences above the score and span thresholds. The legacy file does not map detected text to source files in the four installed binary packages, so their package SPDX expressions remain unresolved |
| Coturn Debian notice-text sweep | PARTIAL. The same ScanCode match profile identified 107 candidate rows across 12 unique verified Debian copyright hashes and 171 qualifying text-match occurrences. Candidate notices remain unassigned to individual source files and binary packages, so package SPDX conclusions remain unchanged |
| Coturn generic CPE source mapping | PASS, five generic identifiers match packages and source versions in the final image dpkg status, with the status file bound to OCI layer `sha256:e229fde44d96d5262c5044f8570ebf19fd6f5abed30061ef3f6a36aa4a09da80`. Four map to Debian SBOM package records with SPDX expressions. The `krb5` alias maps to source-package records with legacy copyright text |
| PostgreSQL 16.16 component-license crosswalk | PASS, three Go package licenses, the PostgreSQL source `COPYRIGHT`, the virtual APK dependency group, and the aggregate OCI record are matched to the exact image manifest |
| Docker Engine-backed signaling-image build and SBOM scan | NOT VERIFIED; this host has no Docker Engine endpoint |
| Go Race in this follow-up | PASS, `go test -race -count=1 -p=1 ./...` with Go 1.26.11, `CGO_ENABLED=1`, LLVM-MinGW Clang 23.1.6, and `GOMAXPROCS=2`. All server packages passed. The compiler is stored in ignored `.local`, with no product dependency added |
| Public deployment, second-PC installation, TURN relay, code signing, penetration test | NOT VERIFIED |

The initial parallel test attempt failed because the host exhausted its page file while several Go/Rust compiler processes ran simultaneously. Serialized tests passed afterward. This is an environment resource failure, not a source test failure.

## Technical debt and release risks

1. **P1 — No project license or verified icon ownership.** The project cannot be responsibly redistributed as open-source until the owner confirms copyright authority and chooses a license.
2. **P1 — No public vulnerability reporting route.** Security issues need a documented private intake process before broad distribution.
3. **P1 — Unverified independent installation and real remote-control flow.** Current project evidence does not establish repeatable two-PC installation, stream stability, or input reliability.
4. **P1 — Public HTTPS/TURN infrastructure unverified.** Self-hosting scripts and docs are implemented, but operational success is unknown.
5. **P2 — Third-party license/SBOM delivery is incomplete.** Lockfile license metadata has a reproducible inventory and CI drift check, but package-level Linux SBOM conclusions, release-time SBOM refresh, and binary notice bundling remain incomplete.
6. **P2 — Container image and package licensing coverage is incomplete.** Compose image tags remain mutable, and 163 raw software-component records have `NOASSERTION` metadata. Five additional entries aggregate OCI images, and one records the PostgreSQL image's virtual APK dependency group. The Caddy Go crosswalk maps 123/123 package records to source license evidence. Coturn evidence links 20 Debian binary records and five generic CPE aliases to exact image packages and source versions. Four aliases have Debian SPDX expressions. ScanCode identified 24 line-scoped license-text candidates in the Kerberos copyright file, but package-level attribution remains unverified. Other Coturn Debian copyright files need review. Go toolchain vendored notices have an initial 13-file license crosswalk; the aggregate tool binary obligations need per-file source attribution. The Dockerfile-built signaling image was not scanned. Pin image digests, complete the remaining license reviews, and automate SBOM refreshes before release. GitHub Actions are pinned to verified commit SHAs.
7. **P2 — CI lacks Windows installer artifact/checksum production.** Current workflow checks source and native compilation but not the user-facing release artifact.
8. **P2 — Long-term session/media performance remains unmeasured on a known two-PC setup.** The reported LAN stutter has useful client-side telemetry but no simultaneous sender/receiver capture from a known package/build.
9. **P2 — Platform claims need a capability matrix.** Windows is the first supported desktop target. Android controller paths exist but current-source physical validation is incomplete. Linux/macOS support is not established.

## G0 disposition

The source and workflow review, feature-status classification, dependency inventory, license comparison, technical debt list, and release risk list are recorded. The initial G0 report and inventory were committed as `b8fe8d79c0f83ac99eccedf412b134a4d03a0c66`. G0 is **READY FOR OWNER REVIEW**, not a declaration that the project is legally licensed or release-ready. The project license/copyright holder, icon provenance, and security-report intake remain owner decisions. Do not begin G1 implementation until the owner accepts the G0 findings and resolves any required ownership decisions.
