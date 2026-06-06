# RemoteAssist Public Deployment

## Start

```powershell
Copy-Item deploy/.env.example deploy/.env
notepad deploy/.env
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
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

## Health

```powershell
curl https://remoteassist.example.com/healthz
```

Open TCP `80`, `443`, `3478`, `5349` and UDP `3478`, `49152-49200` on the server firewall and cloud security group.
