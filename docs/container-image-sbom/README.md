# Container Image SBOM Snapshot

This directory records SPDX 2.3 JSON software bills of materials for the five Linux/amd64 image references used in `deploy/docker-compose.yml` and `server/Dockerfile`. The snapshot was scanned on 2026-11-27 with Syft 1.57.2 against the platform-specific manifest digests in [`summary.csv`](summary.csv). The official Windows amd64 Syft archive checksum was verified as `0a10e03ffd124c304fd7e7491262dba2e5f68eb12378b106d7525146675b2e3a`.

The SPDX files are tied to the exact platform manifest digests in the summary. Compose and Dockerfile references still use mutable tags, so a later tag pull may produce different contents.

## Scope and limitations

- The inventory contains 392 package records across the five scanned image manifests.
- Syft reported `NOASSERTION` for 169 package records. This means the tool could not determine a declared license from available package metadata. It does not mean that those packages have no license. Review upstream licensing before redistribution.
- For the Caddy 2.8.4 binary's 123 Go module records marked `NOASSERTION`, a separate `go-licenses` 2.0.1 review and module-root license-file check mapped 121 records to upstream SPDX licenses. Review of the `go.uber.org/zap/exp@v0.2.0` package source found the full copyright, MIT permission, and warranty-disclaimer notices in every non-test `exp/zapslog` file at the pinned upstream commit, raising the resolved count to 122/123. The [`Caddy Go module crosswalk`](caddy-go-module-crosswalk.csv) records the source evidence. Its one remaining unresolved Go entry, `command-line-arguments`, is a generated binary package identifier without a source module identity. The separate OCI image-root record also has no package license claim. The raw [`go-licenses report`](caddy-go-module-licenses.csv) contains 143 Go package paths, including one `Unknown` result.
- For `golang:1.26.11-alpine`, all 10 `cmd/*` and the `go` SBOM package records point to Go 1.26.11. The official tag's root `LICENSE` SHA-256 matches the cached Go 1.26.11 distribution file, identifying BSD-3-Clause for Go-authored source. The [`Go toolchain license crosswalk`](go-toolchain-license-crosswalk.csv) records the 11 package identities and evidence scope. The distribution has 13 separately licensed vendored files under `src/cmd/vendor`; their notices need independent review for the aggregate tool binaries. The raw SPDX still shows `NOASSERTION` for these 11 package records and the unresolved OCI root.
- The `golang:1.26.11-alpine` and `alpine:3.22` records describe build/runtime base images. The final signaling image also runs `apk add ca-certificates wget` and includes project-built Go binaries. That final project image was not built or scanned in this environment because Docker Engine was unavailable.
- The scan covers `linux/amd64`. Other architectures were not scanned.
- Package-level SBOM generation is inventory evidence. It does not replace review of license terms, required notices, source-availability obligations, or distribution conditions.

For updated tags, repeat the registry scan, capture the new platform manifest digest, inspect every `NOASSERTION` entry, and regenerate the inventory before release.
