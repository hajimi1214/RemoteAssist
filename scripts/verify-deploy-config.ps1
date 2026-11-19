param(
  [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $EnvFile = Join-Path $root "deploy\.env"
} elseif (!(Split-Path -IsAbsolute $EnvFile)) {
  $EnvFile = Join-Path $root $EnvFile
}
$composeFile = Join-Path $root "deploy\docker-compose.yml"

if (!(Test-Path -LiteralPath $EnvFile)) {
  throw "Deployment env file not found: $EnvFile. Copy deploy/.env.example to deploy/.env and replace every placeholder first."
}

$values = @{}
foreach ($line in Get-Content -LiteralPath $EnvFile) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
    $values[$Matches[1]] = $Matches[2].Trim().Trim('"')
  }
}
$required = @(
  "PUBLIC_DOMAIN", "PUBLIC_BASE_URL", "POSTGRES_PASSWORD", "DATABASE_URL",
  "JWT_SECRET", "REFRESH_TOKEN_SECRET", "TURN_REALM", "TURN_EXTERNAL_IP",
  "TURN_URLS", "TURN_SECRET", "APP_ORIGINS", "TRUSTED_PROXY_CIDRS"
)
foreach ($name in $required) {
  $value = [string]$values[$name]
  if ([string]::IsNullOrWhiteSpace($value) -or $value -match 'replace-with|example\.com|203\.0\.113\.') {
    throw "$name is empty or still contains a template value."
  }
}
foreach ($name in @("JWT_SECRET", "REFRESH_TOKEN_SECRET", "TURN_SECRET")) {
  if (([string]$values[$name]).Length -lt 32) {
    throw "$name must contain at least 32 characters."
  }
}
if ($values["JWT_SECRET"] -eq $values["REFRESH_TOKEN_SECRET"] -or
    $values["JWT_SECRET"] -eq $values["TURN_SECRET"] -or
    $values["REFRESH_TOKEN_SECRET"] -eq $values["TURN_SECRET"]) {
  throw "JWT_SECRET, REFRESH_TOKEN_SECRET, and TURN_SECRET must be distinct."
}
if ([string]$values["PUBLIC_BASE_URL"] -notmatch '^https://') {
  throw "PUBLIC_BASE_URL must use https://"
}
if ([string]$values["TURN_URLS"] -notmatch '^turn:') {
  throw "TURN_URLS must advertise at least one turn: URL."
}
if ([string]$values["APP_ORIGINS"] -match '\*') {
  throw "APP_ORIGINS must use exact origins; wildcards are not allowed."
}

docker compose --env-file $EnvFile -f $composeFile config --quiet
if ($LASTEXITCODE -ne 0) { throw "Docker Compose validation failed (exit $LASTEXITCODE)." }
Write-Host "Deployment configuration is valid: $EnvFile"
