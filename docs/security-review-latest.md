# Security review — 0.4.0-alpha

Date: 2026-11-20. Source review and local tests, not a production penetration test.

## Gates and evidence

- PASS — No hidden operation, silent installation, autostart, unattended access, remote shell, credential capture, keyboard logging, or screen recording added. Tauri window remains visible.
- PASS — Explicit native approval remains mandatory. Authorization has a deadline and renewable heartbeat lease; stale/invalid input fails closed. src-tauri/src/lib.rs and native tests.
- PASS — Held remote inputs are tracked only in memory and released on revocation. Key/button release bypasses action-rate limits after authentication; movement remains bounded. Source/state tests pass; actual OS injection is NOT VERIFIED.
- PASS — Signaling revalidates state, blocks negotiation before approval, rejects duplicate roles, and closes both peers for terminal sessions. Actual WebSocket tests in server/internal/httpapi/websocket_lifecycle_test.go.
- PASS — Client-generated WebSocket URLs and forwarded frames omit session credentials. First-frame authentication has 2 KiB/five-second limits and 64 pending slots. New code does not log tokens.
- PASS — Session/request stores have capacities, TTLs and reclamation. Assist IDs are cryptographically random; ownership checks remain.
- PASS — Origin allowlists, message limits, trusted-proxy/IP limiting, password hashing, atomic refresh-token consumption remain. Deployment secrets stay outside tracked source; test credentials are synthetic.
- PASS — Migration execution uses a transaction/advisory lock. SQL test-driver regressions cover skip/retry/rollback/concurrent runners.
- PASS — Frontend build, Go/native tests, and real browser video/DataChannel loopback pass. Historical manual checks are not carried forward as current results.

## Remaining validation and risks

- NOT VERIFIED — Actual Windows capture/input, second-machine consent/credential persistence, network-loss/CPU stress, external TURN.
- NOT VERIFIED — Live PostgreSQL contention/rollback and Docker container restrictions; daemon unavailable.
- NOT VERIFIED — Local Go race execution (no CGO/compiler); Linux CI configured.
- Host must select and confirm primary full display. Window/tab capture rejected; automatic primary-display identification and secondary-display transforms remain unimplemented.
- Active sessions remain in process memory; multiple replicas unsupported.
- TURN shared secret remains provisioned through Compose environment/config; operator Docker metadata is sensitive. Secret-file deployment is future work.
- Existing backup/restore scripts need operational restore drills; disaster recovery is not validated here.
