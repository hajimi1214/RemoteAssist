param(
  [string]$Output = "remoteassist-backup.sql"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
docker compose --env-file (Join-Path $root "deploy\.env") -f (Join-Path $root "deploy\docker-compose.yml") exec -T postgres pg_dump -U remoteassist remoteassist > $Output
