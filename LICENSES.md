# Third-Party Notices and License Inventory

The project-level license for RemoteAssist source code has not been selected. Until the copyright holder chooses and applies one, this file records third-party components only and does not grant a license to the project itself.

## Dependency inventory

[`docs/third-party-components.csv`](docs/third-party-components.csv) lists the resolved npm, Cargo, and Go modules in the checked lockfiles, plus the container images, GitHub Actions, Android Gradle distribution, and Windows WebView2 runtime referenced by the current build and deployment configuration.

The current linux/amd64 image snapshots are in [`docs/container-image-sbom/`](docs/container-image-sbom/README.md), with Caddy-module, Go-toolchain, Coturn Debian-package/CPE, and PostgreSQL component crosswalks that record license evidence and scope.

Regenerate it with `npm run licenses:generate` after changing dependencies or build components. Run `npm run licenses:check` to verify it matches the current manifests and lockfiles. CI runs the drift check.

The inventory is generated from `package-lock.json`, `cargo metadata --locked`, and `go list -m all`. SPDX license expressions come from package metadata or the upstream module license. `MIXED` container-image entries identify images whose operating-system and application packages have separate licenses. Generate an image SBOM for each release before publishing binaries or redistributable images.

The npm lockfile currently resolves 88 packages, Cargo resolves 446 third-party crates, and the Go module graph resolves 7 third-party modules. Re-run the inventory after dependency or build-image changes. Review new, missing, changed, or dual-licensed entries before distribution.

## License observations

- npm package metadata declares a license for all 88 resolved packages.
- Cargo package metadata declares SPDX license expressions for all 446 third-party crates. The graph includes MPL-2.0 crates and `r-efi` expressions that offer LGPL-2.1-or-later alongside permissive alternatives. Check the exact selected license obligations and source redistribution duties when defining a binary distribution process.
- The Go application uses the standard library and seven external modules. Upstream module licenses are identified in the CSV. The cached module archives available in the audit environment did not contain standalone top-level license files for those modules, so preserve upstream attribution/source references in release notices.
- `LICENSES.md` is not a substitute for the full license text of dependencies. Preserve notices and license texts required by each component when redistributing installers, Android packages, or container images.
- The bundled PNG and ICO are each a 16×16 RGBA solid-color image, present in Git history since the initial MVP commit `4c4b175` dated 2026-06-07. The repository does not record who selected or generated them. No third-party artwork is visible in the pixel data, but confirm ownership before public release.
- No external web font, downloaded image library, copied remote-desktop implementation, proprietary codec SDK, or third-party UI source was found in the reviewed frontend/native source and build manifests. This is a source review, not a forensic scan of every generated Android/Windows build artifact.

## Build and runtime components

- Gradle Wrapper uses Gradle 9.6.1 and pins the distribution SHA-256 in `src-tauri/gen/android/gradle/wrapper/gradle-wrapper.properties`.
- The Windows client relies on the Microsoft WebView2 Evergreen Runtime installed on the user's system. This repository does not bundle that runtime.
- GitHub Actions are pinned to immutable commit SHAs in the workflow. Review those pins deliberately when updating action versions.
- Container images currently use tags rather than immutable digests. The package-level licenses vary within the Alpine-based images. The component CSV records the direct image references, but not every OS package inside each image.

## Upstream license references

- Gorilla WebSocket: <https://github.com/gorilla/websocket/blob/main/LICENSE>
- lib/pq: <https://github.com/lib/pq/blob/master/LICENSE>
- Go crypto, net, sys, term, and text modules: <https://go.googlesource.com/crypto/+/master/LICENSE>, <https://go.googlesource.com/net/+/master/LICENSE>, <https://go.googlesource.com/sys/+/master/LICENSE>, <https://go.googlesource.com/term/+/master/LICENSE>, <https://go.googlesource.com/text/+/master/LICENSE>
- Rust crate license expressions: crates.io package metadata and `cargo metadata --locked`
- npm package license expressions: resolved `package.json` metadata recorded in `package-lock.json`
