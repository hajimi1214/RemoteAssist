# G1.1 — LAN HTTPS signaling progress

Date: 2026-11-28

## Scope

This increment adds a certificate-validated HTTPS option to the standalone Go signaling service and makes the supported Windows LAN runbook use HTTPS/WSS. Docker deployments continue to terminate TLS at Caddy and route traffic to the signaling container over the private Compose network.

## Implementation

- The signaling service enables TLS only when both `TLS_CERT_FILE` and `TLS_KEY_FILE` are set. Startup checks that `PUBLIC_BASE_URL` is an HTTPS root, the leaf certificate matches its host and is currently valid, and the certificate is a non-CA server certificate with server-auth and digital-signature usage. TLS 1.2 is the minimum.
- `scripts/dev-lan.ps1` binds only to a selected RFC1918 IPv4 address assigned to the host. HTTPS with certificate and key files is the default. `-InsecureHttpTest` is an explicit path for disposable, isolated accounts. It emits a warning and does not use TLS files.
- The LAN certificate helper creates a short-lived IP-SAN certificate set through an atomic directory publish. On Windows, its directory ACL is restricted to the current user and SYSTEM, and the server private key is read-only for those identities. The root signing key is not persisted. The leaf includes a short-lived empty CRL distribution point on the LAN-only test download port so Windows revocation checks work without an external network. Revoke test trust by removing the temporary CA from the current-user root store on each test PC.
- The optional certificate helper uses the pinned `cryptography`, `cffi`, and `pycparser` versions in `scripts/requirements-lan-cert.txt`. Their license metadata is included in the generated third-party component inventory. Python and the helper packages are not bundled with RemoteAssist.
- `scripts/dev.ps1` clears inherited TLS and app-origin settings for the local loopback preview and restores all modified environment values after exit.
- The Windows runbook now provisions the IP certificate, temporary trust, CRL download and normal HTTPS/WSS client. It retains a separate HTTP debug path with its transport limitation stated explicitly.

## Verification

| Check | Result |
|---|---|
| Go server tests | PASS across all server packages |
| Go server vet and module checksums | PASS |
| TLS server configuration tests | PASS for matching IP SAN, TLS 1.2 minimum, incomplete certificate pair, HTTP URL rejection, hostname mismatch, expired certificate, CA certificate and client-only certificate rejection |
| LAN certificate helper tests | PASS, 4 tests including IP scope, CRL signature, key match, Windows key ACL and atomic publish failure cleanup |
| LAN TLS runtime check | PASS. The current Windows Schannel client fetched the local CRL and returned `/healthz` successfully after the temporary CA was trusted |
| TLS negotiation boundaries | PASS. TLS 1.2 succeeded, TLS 1.1 failed, and the same leaf certificate was rejected for a different IP |
| Frontend regression suite and build | PASS, 128/128 tests and production build |
| Dependency audit | PASS, `npm audit` reported 0 vulnerabilities |
| Third-party inventory | PASS, generated and checked 556 entries, including the optional Python helper licenses |
| Pinned Python environment | PASS, installed all three pinned packages into an ignored local virtual environment and ran all 4 certificate helper tests |
| LAN TLS test cleanup | PASS. The temporary CA was removed from the current-user root store and listeners on ports 8090 and 8443 were stopped |
| Windows release packaging with `https://<lan-host-ip>:8443` configured | PASS. Portable EXE 10,602,496 bytes, SHA-256 `A42D844CD01AE589D6DB03C1B6BBDF5AC3897F72C98463085217066BBB2D6744`. NSIS installer 2,432,797 bytes, SHA-256 `5BE60678C3D95722B408DDC5C9E817E930C2BF05A4298F8A40D203394676EAF0`. Both are unsigned |
| Production JavaScript endpoint scan | PASS. The bundle contains the selected HTTPS endpoint and no loopback HTTP/WS development endpoint |
| Docker Compose config and PowerShell syntax | PASS |

The certificate and key remain in ignored `.local` test storage. The release EXE and installer are in ignored `src-tauri/target`; they are not committed or signed.

## Acceptance still pending

- A second Windows PC has not installed the normal package or trusted the temporary CA.
- Real video, mouse, keyboard and disconnect/input-release behavior have not been verified across two Windows machines.
- Public HTTPS deployment, TURN allocation and P2P-versus-relay behavior remain unverified.
- LAN clients use an in-memory signaling and identity service in this standalone test mode. Restarting it removes test accounts/devices and ends active sessions. Persistent self-hosting operations remain a separate G1 task.
