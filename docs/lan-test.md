# Temporary LAN TLS test

This helper connects an Android controller to the Windows test host without requiring a public domain. The signaling service remains on `127.0.0.1:8080`. A foreground-only TLS proxy can expose its API and WebSocket routes on one explicitly chosen RFC1918 IPv4 address, for example `192.168.0.100:8443`. The listener and phone must be on the intended LAN. WebRTC media still negotiates its own direct path.

## Prepare the certificate

Use the bundled Python runtime, which already includes `cryptography`:

```powershell
& "C:\Users\30317\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\scripts\new-lan-test-cert.py 192.168.0.100
```

The command creates `.local/lan-test/` with PEM and DER copies of the temporary CA, an IP-SAN `server.cert.pem`, a host-only `server.key.pem`, and a public certificate manifest. Validity defaults to two days and can be extended to at most seven days. The ephemeral CA signing key is not persisted and no CRL is generated. Revoke test trust by removing this CA from every test user's trust store. The command refuses to overwrite an existing directory because replacing the CA would invalidate a previously built test APK.

The private key is local test data. `.local/` is ignored by Git; copy only the CA certificate into a deliberately isolated Android test build. Nothing installs a root certificate into Windows or Android. No global trust store, firewall rule or operating-system policy is changed.

## Android test trust

The normal APK trusts system CAs and cannot validate this temporary certificate. Use a separate test APK with Android's network-security configuration scoped to the exact test IP, supplied through a debug-only manifest/resource overlay. Keep the normal base configuration's system CAs; add the temporary CA only for the matching `<domain includeSubdomains="false">192.168.0.100</domain>` with cleartext disabled. Do not use a global `debug-overrides` CA, trust-all manager, `onReceivedSslError(...).proceed()` or certificate-error bypass. Remove the test overlay before producing a normal distributable APK.

This document describes the integration requirement; certificate generation and proxy code do not alter or build the Android application.

## Run when the test is ready

Start a fresh memory-backed signaling service bound to `127.0.0.1:8080`, with `LOCAL_ADMIN_SEED_FILE` unset. The existing weak-password local administrator fixture must not be indirectly exposed through this LAN proxy. Register a temporary ordinary test account for both endpoints. The server's existing origin allowlist already includes `https://tauri.localhost` and the Windows development frontend; preserve it rather than adding a wildcard.

Once the certificate and scoped test APK are ready:

```powershell
cd scripts/lan-test-proxy
go run . -listen 192.168.0.100:8443 -backend http://127.0.0.1:8080 -cert ../../.local/lan-test/server.cert.pem -key ../../.local/lan-test/server.key.pem
```

The proxy requires TLS 1.2 or later, a non-expired IP-matching server certificate, a literal private IPv4 listener and a literal loopback HTTP backend. Environment proxies are disabled for the loopback hop. It preserves `Origin`/`Authorization`, clears user-supplied forwarding metadata and writes a fresh source address. It logs status codes only, never URL paths, query strings, authorization headers, bodies or transport-error details. It has no login or host-approval bypass. Stop it with Ctrl+C when testing ends.

Phone service address: `https://192.168.0.100:8443`. Windows development service address: `http://localhost:8080`. Test `/healthz` first using the generated CA explicitly. HTTPS success only establishes signaling connectivity; AP isolation, routing, VPNs or UDP filtering can independently prevent a WebRTC direct path.

## Verification

```powershell
& "C:\Users\30317\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\scripts\test_lan_test_cert.py
cd scripts/lan-test-proxy
go test ./...
go vet ./...
```

The tests do not bind a network socket. They check the private-listener/loopback-backend restrictions, forwarding/header behavior with an in-memory transport, status-only logging, certificate hostname/expiry validation, CA signature, exact IP SAN, key matching, bounded validity and refusal to overwrite an existing CA.

Preparation validation on 2026-11-20: Go tests (four) and vet PASS; Python certificate tests (three) PASS. The generated `192.168.0.100` certificate additionally completed a Python SSL MemoryBIO TLS 1.3 handshake with the generated CA and hostname verification enabled, without opening a listener. Network listener startup, physical-phone certificate trust and LAN media transport were not part of this preparation check.

## Physical tablet check on 2026-11-20

The tablet initially could not reach the Ethernet address. Connecting the PC to the same Wi-Fi yielded PC `192.168.1.111` and tablet `192.168.1.110`; the tablet TCP probe succeeded. A new certificate for the Wi-Fi IP was generated into ignored `.local/lan-test-wifi`, the foreground proxy was started and `/healthz` validated with that CA. A debug-only test APK was built and manually installed after the tablet rejected ADB installation. The real Android application completed HTTPS login/device registration and the user confirmed seeing the Windows desktop. Touch/fullscreen/quality problems were reported, leading to the 0.10 changes.

The tablet's "Waiting for debugger" launch issue was an Android `debug_app`/`wait_for_debugger` setting for this package; clearing that debug wait restored normal launch. It was not an application crash.

`scripts/package-android-lan.ps1 -Address <current-private-ip> -PublicCA <public-ca.pem>` generates the exact-IP debug overlay automatically and saves a separate ignored LAN test APK. Never reuse an old certificate/address after the PC's network changes. This APK is distinct from the normal system-CA-only artifact; release builds explicitly refuse the test trust environment. No private key or certificate is committed.

No new Go dependency is required. Certificate generation uses the already bundled `cryptography` library (Apache-2.0 OR BSD-3-Clause); it adds no Python package installation. Listener startup, real Android TLS trust and a physical LAN WebRTC session require separate live validation.
