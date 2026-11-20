# RemoteAssist

Version 0.11 adds desktop/grid/list device layouts, mobile relative touchpad control, four negotiated quality profiles and DXGI changed-region capture. Its sharp mode targets 4K/60 but does not upscale or bypass congestion controls; stable 4K60 and comparative UU performance remain unverified. Upgrade the service and both clients together; see [0.11 behavior and measured limits](docs/direct-desktop-0.11.md). Earlier same-account access is documented in [0.10 behavior](docs/direct-desktop-0.10.md).

Version 0.8 opens directly into a guest workspace and asks for login in a dismissible dialog when a protected feature is used. It adds custom window controls, responsive page layouts, local copyable feedback, bounded pointer retries and adaptation to sender queue pressure. Session creation/join now require an authenticated account on the server too; upgrade service and clients together. See [0.8 behavior and validation](docs/guest-workspace-0.8.md).

Version 0.9 adds the Android ARM64 controller APK for viewing and operating an approved Windows host. Configure your HTTPS signaling service in Android settings; phones and Windows hosts must use the same service. Build/install and verification limits are documented in [Android controller setup](docs/android-controller.md).

Version 0.7 refines the VelaMost-inspired light workspace, adds real local session summaries with opt-in retention, and presents bounded diagnostic trends with readable status hints. It also fixes zero-bandwidth adaptation and delayed pointer motion after releasing input. See [0.7 details](docs/workspace-refinement-0.7.md) and [validation](docs/validation-0.7.md).

Version 0.6 adds measured video diagnostics, host quality preferences, gradual quality changes, correlated heartbeat timeouts, negotiation deadlines, and latest-position mouse delivery. Read [communication and quality decisions](docs/communication-quality-0.6.md). The responsive workspace, themes and viewer controls are documented in [0.5 research](docs/research-and-decisions-0.5.md).

RemoteAssist is a visible same-account remote desktop client. Signed-in devices are registered under their owner, and selecting an online Windows host starts primary-display capture and input without a code or repeated prompt. The host can stop/pause access; closing the client or signing out revokes capture/input. Escape pauses the viewer.

## Local Development

Use Node 24, Go, and the stable Rust Windows toolchain. Node 24 runs the TypeScript regression tests without another test runtime.

Install the frontend dependencies once with `npm ci`. Run the local service and the client in **two terminals**:

```powershell
# Terminal 1: local signaling service, kept in the foreground.
.\scripts\dev.ps1 -Mode Server
```

```powershell
# Terminal 2: the native Windows client (Desktop is the default mode).
.\scripts\dev.ps1
```

`Server` binds only to `127.0.0.1:8080` and uses in-memory accounts and devices. `Desktop` runs Tauri, which starts its own Vite frontend; it connects to the existing signaling service at `http://localhost:8080`. It does not launch another service. Stop a mode with Ctrl+C in its terminal. Commands run in the foreground and return their exit status; the script restores its environment changes and the caller's working directory on exit. The script also works from another directory when invoked by its absolute path.

For a browser-only UI preview, use `Browser` **instead of** `Desktop` in terminal 2, then open `http://127.0.0.1:1420`:

```powershell
.\scripts\dev.ps1 -Mode Browser
```

Both frontend modes use port 1420, so run only one at a time. Browser preview supports UI checks; Windows capture and remote input require the desktop client. To connect a frontend to an already deployed server, pass `-SignalingUrl https://your-signaling-domain.example`; this option applies only to `Desktop` and `Browser`. It does not configure a production server.

First launch opens the guest workspace. Protected actions show a closable login dialog. After registration or login, the client binds the current device and starts heartbeats; the Windows host is then available to devices under the same account.

### Local preview administrator

If `.local/admin-seed.json` already exists, `Server` loads it automatically on every start. The seed stores an Argon2id password hash, not a plaintext password; the script does not create, print, or overwrite it. `.local/` is excluded from Git. Keep the seed local: it is a preview account fixture, not a public deployment configuration.

Restarting this memory-backed service recreates the seeded administrator, but does **not** restore other registered accounts, device bindings, refresh tokens, or active sessions. Sign in again after a restart; the seeded account receives a new internal user ID, so previously retained per-account local history is not automatically attached to it. Without the seed file there is no automatically created administrator, and ordinary registration still works.

Public registration always creates the `user` role and keeps its normal minimum password requirement. Clients cannot request the `admin` role. The current administrator capability is the authenticated, read-only `GET /api/v1/admin/status` endpoint; there is no account-management console. The endpoint checks the stored role and disabled state on each request. Administrator status grants no no host-consent bypass, and no extra remote-control privileges.

The seed bootstrap is accepted only for a numeric loopback listener with in-memory storage. It is rejected for PostgreSQL or a public listener and refuses to overwrite or promote an existing conflicting account. The `Server` development mode temporarily clears `DATABASE_URL`; use the deployment procedure below for persistent server operation. Production administrator provisioning and its management workflow are not implemented by this local fixture.

## Tests

```powershell
.\scripts\test.ps1
```

## Windows Package

```powershell
.\scripts\package-windows.ps1 -SignalingUrl https://remoteassist.example.com
```

## Public Server Deployment

```powershell
Copy-Item deploy/.env.example deploy/.env
notepad deploy/.env
./scripts/verify-deploy-config.ps1
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/docker-compose.yml run --rm --entrypoint /signaling-migrate signaling
```

Do not hardcode TURN credentials in source. Put deployment secrets only in `deploy/.env` or equivalent server environment variables.

Version 0.4 changes the signaling authentication protocol. Upgrade the server and both clients together; build the Windows package with your actual HTTPS signaling domain. Example-domain packages only validate packaging and cannot connect to your server.

Version 0.6 clients use correlated DataChannel heartbeat probes; upgrade both endpoints to 0.6 together. The existing 0.4+ signaling server protocol remains compatible.

See [research and decisions](docs/research-and-decisions-0.4.md) for the WebRTC standards, Sunshine behavior, and recent papers behind the changes, and [validation](docs/validation-0.4.md) for the real-browser loopback test and its limits.

## Safety Boundaries

RemoteAssist does not provide remote shell, script execution, silent install, hidden operation, default autostart, UAC bypass, Defender evasion, credential capture, key logging, or post-session capture.
