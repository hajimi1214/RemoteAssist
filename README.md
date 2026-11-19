# RemoteAssist

RemoteAssist is a visible Windows remote assistance client. It requires sign in, automatic device registration, host-started sharing, an 8-digit temporary code, and explicit host approval before remote input is accepted.

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

See [research and decisions](docs/research-and-decisions-0.4.md) for the WebRTC standards, Sunshine behavior, and recent papers behind the changes, and [validation](docs/validation-0.4.md) for the real-browser loopback test and its limits.

## Safety Boundaries

RemoteAssist does not provide remote shell, script execution, silent install, hidden operation, default autostart, unattended access, UAC bypass, Defender evasion, credential capture, key logging, or post-session capture.
