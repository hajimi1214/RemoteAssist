param(
  [string]$Input = "remoteassist-backup.sql"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "deploy\.env"
$composeFile = Join-Path $root "deploy\docker-compose.yml"
$docker = Get-Command docker.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1

if (!(Test-Path -LiteralPath $envFile -PathType Leaf)) { throw "Deployment env file not found: $envFile" }
if (!$docker) { throw "Docker CLI was not found." }

$inputPath = (Resolve-Path -LiteralPath $Input -ErrorAction Stop).Path
if (!(Test-Path -LiteralPath $inputPath -PathType Leaf)) { throw "Backup input must be a file: $inputPath" }
if ((Get-Item -LiteralPath $inputPath).Length -eq 0) { throw "Backup input is empty: $inputPath" }
if ((Get-Content -LiteralPath $inputPath -Encoding UTF8 -TotalCount 5) -notcontains "-- PostgreSQL database dump") {
  throw "Backup input is not a plain-SQL dump produced by backup-postgres.ps1."
}

$arguments = @(
  "compose", "--env-file", $envFile, "-f", $composeFile,
  "exec", "-T", "postgres", "sh", "-c",
  'exec psql --no-psqlrc --single-transaction --set ON_ERROR_STOP=on --username="$POSTGRES_USER" "$POSTGRES_DB"'
)

Get-Content -LiteralPath $inputPath -Encoding UTF8 | & $docker.Source @arguments
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) { throw "PostgreSQL restore failed and its single transaction was rolled back (exit code $exitCode)." }
Write-Host "PostgreSQL backup restored from $inputPath"
