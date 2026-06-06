$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "deploy\.env.example"
$composeFile = Join-Path $root "deploy\docker-compose.yml"

docker compose --env-file $envFile -f $composeFile config
