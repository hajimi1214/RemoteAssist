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
.\scripts\backup-postgres.ps1 -Output remoteassist-backup.sql
```

## Restore

```powershell
.\scripts\restore-postgres.ps1 -Input remoteassist-backup.sql
```

Restore into an empty database after stopping the signaling service. See the [database operations guide](../docs/database.md) for the transaction and backup-file handling behavior.

## Health

```powershell
curl https://remoteassist.example.com/healthz
```

Open TCP `80`, `443`, and `3478`, plus UDP `3478` and `49152-49200` on the server firewall and cloud security group.
