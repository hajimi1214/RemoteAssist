# RemoteAssist Public Deployment

For ECS, see the [Alibaba Cloud game streaming deployment and acceptance guide](../docs/aliyun-game-deployment.md).

## Start

```powershell
Copy-Item deploy/.env.example deploy/.env
notepad deploy/.env
./scripts/verify-deploy-config.ps1
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --wait postgres
docker compose --env-file deploy/.env -f deploy/docker-compose.yml build signaling
docker compose --env-file deploy/.env -f deploy/docker-compose.yml run --rm --entrypoint /signaling-migrate signaling
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d
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

Open TCP `80`, `443`, and `3478`, plus UDP `3478` and `49152-49200` on the server firewall and cloud security group.
