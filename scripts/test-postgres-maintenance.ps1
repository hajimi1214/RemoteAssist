$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sharedHelpers = Join-Path $PSScriptRoot "postgres-dump.ps1"
. $sharedHelpers
$fixtureDirectory = Join-Path $projectRoot ".local\postgres-maintenance-test"
$deploymentEnvPath = Join-Path $fixtureDirectory "deployment.env"
$backupPath = Join-Path $fixtureDirectory "valid-backup.sql"
$badInputPath = Join-Path $fixtureDirectory "invalid-backup.sql"
$badOutputPath = Join-Path $fixtureDirectory "preserved-backup.sql"
New-Item -ItemType Directory -Force -Path $fixtureDirectory | Out-Null

function Assert-ThrowsContaining([scriptblock]$Action, [string]$ExpectedMessage) {
  try {
    & $Action
  } catch {
    if ($_.Exception.Message -like "*$ExpectedMessage*") { return }
    throw
  }
  throw "Expected action to fail with message containing '$ExpectedMessage'."
}

try {
  $validSettings = @(
    "POSTGRES_USER=remoteassist",
    "POSTGRES_DB=remoteassist",
    "POSTGRES_PASSWORD=test-only-password",
    "DATABASE_URL=postgres://remoteassist:test-only-password@postgres:5432/remoteassist?sslmode=disable"
  )
  [System.IO.File]::WriteAllLines($deploymentEnvPath, $validSettings, [System.Text.UTF8Encoding]::new($false))
  $databaseTarget = Get-ComposePostgresTarget $deploymentEnvPath
  if ($databaseTarget.DatabaseName -cne "remoteassist" -or $databaseTarget.UserName -cne "remoteassist") {
    throw "PostgreSQL maintenance did not select the configured Compose database and role."
  }
  Write-Host "PASS DATABASE_URL selects the matching Compose PostgreSQL target"

  $settingsWithWrongDatabase = @($validSettings[0], "POSTGRES_DB=other", $validSettings[2], $validSettings[3])
  [System.IO.File]::WriteAllLines($deploymentEnvPath, $settingsWithWrongDatabase, [System.Text.UTF8Encoding]::new($false))
  Assert-ThrowsContaining { Get-ComposePostgresTarget $deploymentEnvPath } "DATABASE_URL database must match POSTGRES_DB"

  $settingsWithExternalHost = @($validSettings[0], $validSettings[1], $validSettings[2], "DATABASE_URL=postgres://remoteassist:test-only-password@external-postgres:5432/remoteassist")
  [System.IO.File]::WriteAllLines($deploymentEnvPath, $settingsWithExternalHost, [System.Text.UTF8Encoding]::new($false))
  Assert-ThrowsContaining { Get-ComposePostgresTarget $deploymentEnvPath } "DATABASE_URL must target the PostgreSQL service"

  $settingsWithWrongUser = @("POSTGRES_USER=other", $validSettings[1], $validSettings[2], $validSettings[3])
  [System.IO.File]::WriteAllLines($deploymentEnvPath, $settingsWithWrongUser, [System.Text.UTF8Encoding]::new($false))
  Assert-ThrowsContaining { Get-ComposePostgresTarget $deploymentEnvPath } "DATABASE_URL user must match POSTGRES_USER"

  $settingsWithWrongPassword = @($validSettings[0], $validSettings[1], "POSTGRES_PASSWORD=expected-password", "DATABASE_URL=postgres://remoteassist:wrong-password@postgres:5432/remoteassist")
  [System.IO.File]::WriteAllLines($deploymentEnvPath, $settingsWithWrongPassword, [System.Text.UTF8Encoding]::new($false))
  Assert-ThrowsContaining { Get-ComposePostgresTarget $deploymentEnvPath } "DATABASE_URL credentials must match POSTGRES_USER and POSTGRES_PASSWORD"

  [System.IO.File]::WriteAllLines($deploymentEnvPath, $validSettings, [System.Text.UTF8Encoding]::new($false))
  $validHeader = @(
    "-- PostgreSQL database dump",
    "-- Dumped from database version 16.16",
    "-- Dumped by pg_dump version 16.16",
    "",
    "BEGIN;",
    "COMMIT;"
  )
  [System.IO.File]::WriteAllLines($backupPath, $validHeader, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($badOutputPath, "old-backup", [System.Text.UTF8Encoding]::new($false))
  if (!(Test-PlainPostgreSqlDumpHeader $backupPath)) { throw "Valid UTF-8 backup header was rejected." }
  [System.IO.File]::WriteAllText($backupPath, "`u{FEFF}$($validHeader -join "`n")", [System.Text.UTF8Encoding]::new($false))
  if (!(Test-PlainPostgreSqlDumpHeader $backupPath)) { throw "Valid UTF-8 BOM backup header was rejected." }

  Assert-ThrowsContaining { & (Join-Path $PSScriptRoot "backup-postgres.ps1") -Output $badOutputPath } "Deployment env file not found"
  if ((Get-Content -LiteralPath $badOutputPath -Raw) -ne "old-backup") { throw "Backup preflight changed the previous output." }

  $replacementPath = Join-Path $fixtureDirectory "new-backup.partial"
  [System.IO.File]::WriteAllText($replacementPath, "verified-backup", [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::Move($replacementPath, $badOutputPath, $true)
  if ((Get-Content -LiteralPath $badOutputPath -Raw) -ne "verified-backup") { throw "Atomic backup replacement failed." }

  [System.IO.File]::WriteAllText($badInputPath, "not a database dump", [System.Text.UTF8Encoding]::new($false))
  if (Test-PlainPostgreSqlDumpHeader $badInputPath) { throw "Invalid plain-text input was accepted as a backup." }
  [System.IO.File]::WriteAllLines($badInputPath, @("one", "two", "three", "four", "five", "-- PostgreSQL database dump"), [System.Text.UTF8Encoding]::new($false))
  if (Test-PlainPostgreSqlDumpHeader $badInputPath) { throw "A dump header beyond the first five lines was accepted." }
  Assert-ThrowsContaining { & (Join-Path $PSScriptRoot "restore-postgres.ps1") -Input $badInputPath } "Deployment env file not found"

  $temporaryHeaderPath = Join-Path $fixtureDirectory "empty.sql"
  [System.IO.File]::WriteAllText($temporaryHeaderPath, "", [System.Text.UTF8Encoding]::new($false))
  Assert-ThrowsContaining { & (Join-Path $PSScriptRoot "restore-postgres.ps1") -Input $temporaryHeaderPath } "Deployment env file not found"

  Write-Host "PASS backup/restore preflight leaves existing backup files untouched"
} finally {
  $resolvedFixture = (Resolve-Path -LiteralPath $fixtureDirectory).Path
  $projectLocalRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot ".local")).Path
  $allowedPrefix = $projectLocalRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (!$resolvedFixture.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "PostgreSQL test fixture escaped the ignored project-local directory: $resolvedFixture"
  }
  Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
}
