# RemoteAssist

Version 0.7 refines the VelaMost-inspired light workspace, adds real local session summaries with opt-in retention, and presents bounded diagnostic trends with readable status hints. It also fixes zero-bandwidth adaptation and delayed pointer motion after releasing input. See [0.7 details](docs/workspace-refinement-0.7.md) and [validation](docs/validation-0.7.md).

Version 0.6 adds measured video diagnostics, host quality preferences, gradual quality changes, correlated heartbeat timeouts, negotiation deadlines, and latest-position mouse delivery. Read [communication and quality decisions](docs/communication-quality-0.6.md). The responsive workspace, themes and viewer controls are documented in [0.5 research](docs/research-and-decisions-0.5.md).

RemoteAssist is a visible Windows remote assistance client. It requires sign in, device registration, host-started primary-display sharing, an 8-digit temporary code, and explicit host approval before remote input is accepted. The controller then explicitly enables local input capture; Escape or Tab releases it.

## Local Development

Use Node 24, Go, and the stable Rust Windows toolchain. Node 24 runs the TypeScript regression tests without another test runtime.

```powershell
.\scripts\dev.ps1
```

First launch opens the login page. After registration or login, the client binds the current device and starts heartbeats.

The desktop UI defaults to `http://localhost:8080` for signaling. Start the Go signaling server separately when needed:

```powershell
cd server
& "C:\Program Files\Go\bin\go.exe" run ./cmd/signaling
```

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

RemoteAssist does not provide remote shell, script execution, silent install, hidden operation, default autostart, unattended access, UAC bypass, Defender evasion, credential capture, key logging, or post-session capture.
