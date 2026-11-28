param(
  [string]$Output = "remoteassist-backup.sql"
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
if ($databaseTarget.DatabaseName -cne $databaseTarget.PostgresDatabase) {
  throw "Backup only targets the configured POSTGRES_DB. DATABASE_URL points elsewhere."
}

$outputPath = [System.IO.Path]::GetFullPath($Output)
$outputDirectory = Split-Path -Parent $outputPath
if ([string]::IsNullOrWhiteSpace($outputDirectory)) { $outputDirectory = (Get-Location).Path }
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
if (Test-Path -LiteralPath $outputPath -PathType Container) { throw "Backup output path is a directory: $outputPath" }

$temporaryPath = Join-Path $outputDirectory ".$(Split-Path -Leaf $outputPath).$PID.partial"
if (Test-Path -LiteralPath $temporaryPath) { throw "Temporary backup path already exists: $temporaryPath" }

$arguments = @(
  "compose", "--env-file", $envFile, "-f", $composeFile,
  "exec", "-T", "-e", "BACKUP_DATABASE=$($databaseTarget.DatabaseName)", "-e", "BACKUP_USERNAME=$($databaseTarget.UserName)", "postgres", "sh", "-c",
  'export PGPASSWORD="$POSTGRES_PASSWORD"; export PGDATABASE="$BACKUP_DATABASE"; exec pg_dump --no-password --username="$BACKUP_USERNAME"'
)

try {
  & $docker.Source @arguments > $temporaryPath
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { throw "PostgreSQL backup failed with exit code $exitCode." }
  if (!(Test-Path -LiteralPath $temporaryPath -PathType Leaf) -or (Get-Item -LiteralPath $temporaryPath).Length -eq 0) {
    throw "PostgreSQL backup produced an empty output file."
  }
  if (-not (Test-PlainPostgreSqlDumpHeader $temporaryPath)) {
    throw "PostgreSQL backup output did not contain the expected plain-SQL dump header."
  }

  [System.IO.File]::Move($temporaryPath, $outputPath, $true)
  Write-Host "PostgreSQL backup written to $outputPath"
} finally {
  Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
}
