param(
  [Alias("Input")]
  [string]$InputFile = "remoteassist-backup.sql",
  [string]$DatabaseName = ""
)

$sharedHelpers = Join-Path $PSScriptRoot "postgres-maintenance.ps1"
. $sharedHelpers
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "deploy\.env"
$composeFile = Join-Path $root "deploy\docker-compose.yml"
$docker = Get-Command docker.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1

if (!(Test-Path -LiteralPath $envFile -PathType Leaf)) { throw "Deployment env file not found: $envFile" }
if (!$docker) { throw "Docker CLI was not found." }

$databaseTarget = Get-ComposePostgresTarget $envFile
if ([string]::IsNullOrWhiteSpace($DatabaseName)) { $DatabaseName = $databaseTarget.DatabaseName }
if ([string]::IsNullOrWhiteSpace($DatabaseName) -or [System.Text.Encoding]::UTF8.GetByteCount($DatabaseName) -gt 63 -or
    $DatabaseName -match '[\x00-\x1F\x7F]' -or $DatabaseName.Contains('=') -or $DatabaseName -match '^(postgres|postgresql)://') {
	throw "DatabaseName must be a PostgreSQL database name, not a libpq connection string, and at most 63 UTF-8 bytes."
}

$inputPath = (Resolve-Path -LiteralPath $InputFile -ErrorAction Stop).Path
if (!(Test-Path -LiteralPath $inputPath -PathType Leaf)) { throw "Backup input must be a file: $inputPath" }
if ((Get-Item -LiteralPath $inputPath).Length -eq 0) { throw "Backup input is empty: $inputPath" }
if (-not (Test-PlainPostgreSqlDumpHeader $inputPath)) {
  throw "Backup input is not a plain-SQL dump produced by backup-postgres.ps1."
}

$arguments = @(
  "compose", "--env-file", $envFile, "-f", $composeFile,
  "exec", "-T", "-e", "RESTORE_DATABASE=$DatabaseName", "-e", "RESTORE_USERNAME=$($databaseTarget.UserName)", "postgres", "sh", "-c",
  'export PGPASSWORD="$POSTGRES_PASSWORD"; export PGDATABASE="$RESTORE_DATABASE"; exec psql --no-psqlrc --single-transaction --set ON_ERROR_STOP=on --username="$RESTORE_USERNAME"'
)

Get-Content -LiteralPath $inputPath -Encoding UTF8 | & $docker.Source @arguments
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) { throw "PostgreSQL restore failed and its single transaction was rolled back (exit code $exitCode)." }
Write-Host "PostgreSQL backup restored from $inputPath"
