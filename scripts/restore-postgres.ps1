param(
  [string]$Input = "remoteassist-backup.sql"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Get-Content $Input | docker compose --env-file (Join-Path $root "deploy\.env") -f (Join-Path $root "deploy\docker-compose.yml") exec -T postgres psql -U remoteassist remoteassist
