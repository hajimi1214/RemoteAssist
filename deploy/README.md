# RemoteAssist Public Deployment

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

## Logs

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f signaling
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f coturn
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f caddy
```

## Backup

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T postgres pg_dump -U remoteassist remoteassist > remoteassist-backup.sql
```

## Restore

```powershell
Get-Content remoteassist-backup.sql | docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T postgres psql -U remoteassist remoteassist
```

## Health

```powershell
curl https://remoteassist.example.com/healthz
```

Open TCP `80`, `443`, `3478`, `5349` and UDP `3478`, `49152-49200` on the server firewall and cloud security group.
