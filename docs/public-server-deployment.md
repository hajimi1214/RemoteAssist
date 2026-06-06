# Public Server Deployment

## Environment Variables

Use `deploy/.env.example` as the template. Replace `PUBLIC_DOMAIN`, `PUBLIC_BASE_URL`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `TURN_REALM`, `TURN_EXTERNAL_IP`, `TURN_USERNAME`, `TURN_PASSWORD`, and `TURN_SECRET` before deployment.

## Domain and TLS

Point the domain A/AAAA record to the server. Caddy listens on TCP `80` and `443` and obtains TLS certificates automatically.

## Ports

- TCP `80`: HTTP ACME challenge and redirect.
- TCP `443`: HTTPS and WebSocket signaling.
- TCP/UDP `3478`: TURN.
- TCP `5349`: TURN over TLS listener.
- UDP `49152-49200`: TURN relay range by default.

## Start

```powershell
Copy-Item deploy/.env.example deploy/.env
notepad deploy/.env
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/docker-compose.yml run --rm --entrypoint /signaling-migrate signaling
```

## Stop

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.yml down
```

## Upgrade

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.yml build signaling
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d
```

## Rollback

```powershell
$env:REMOTEASSIST_VERSION="previous-tag"
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d
```

## Health Check

```powershell
curl https://remoteassist.example.com/healthz
```

## Logs

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f signaling
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f coturn
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f caddy
```

## Backup

```powershell
.\scripts\backup-postgres.ps1 -Output remoteassist-backup.sql
```

## Restore

```powershell
.\scripts\restore-postgres.ps1 -Input remoteassist-backup.sql
```

## P2P and TURN Fallback Verification

1. Test two clients on a permissive LAN and confirm the UI shows `P2P`.
2. Test clients behind restrictive NAT or block direct UDP between them and confirm the UI shows `TURN Relay`.
3. Confirm no screen content, keyboard content, token, or TURN secret appears in logs.

Firewall rules, cloud security groups, DNS, TLS, and real server deployment are manual steps and are NOT VERIFIED in this workspace.
