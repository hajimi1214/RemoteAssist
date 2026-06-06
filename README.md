# RemoteAssist

RemoteAssist is a visible Windows remote assistance MVP. It requires the host to start sharing, choose a screen or window, share an 8-digit temporary code, and explicitly click `Allow Control` before remote input is accepted.

## Local Development

```powershell
.\scripts\dev.ps1
```

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
.\scripts\package-windows.ps1
```

## Public Server Deployment

```powershell
Copy-Item deploy/.env.example deploy/.env
notepad deploy/.env
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

Do not hardcode TURN credentials in source. Put deployment secrets only in `deploy/.env` or equivalent server environment variables.

## Safety Boundaries

RemoteAssist does not provide remote shell, script execution, silent install, hidden operation, default autostart, unattended access, UAC bypass, Defender evasion, credential capture, key logging, or post-session capture.
