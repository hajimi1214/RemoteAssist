$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sharedHelpers = Join-Path $PSScriptRoot "postgres-maintenance.ps1"
. $sharedHelpers
$fixtureDirectory = Join-Path $projectRoot ".local\postgres-maintenance-test"
$deploymentEnvPath = Join-Path $fixtureDirectory "deployment.env"
$temporaryDeployEnv = Join-Path $projectRoot "deploy\.env"
$mockRoot = Join-Path $fixtureDirectory "mock-docker"
$backupPath = Join-Path $fixtureDirectory "valid-backup.sql"
$badInputPath = Join-Path $fixtureDirectory "invalid-backup.sql"
$badOutputPath = Join-Path $fixtureDirectory "preserved-backup.sql"
$postgresPassword = "test-only-password"
if (Test-Path -LiteralPath $temporaryDeployEnv -PathType Leaf) {
  throw "Refusing to modify an existing deployment env file: $temporaryDeployEnv"
}
if (Test-Path -LiteralPath $fixtureDirectory) {
  throw "Refusing to overwrite an existing PostgreSQL test fixture directory: $fixtureDirectory"
}
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

function Assert-NoProcessSecrets([string[]]$CommandLines, [string[]]$Secrets) {
  $argumentIndex = 0
  foreach ($commandLine in $CommandLines) {
    foreach ($secret in $Secrets) {
      if ($commandLine.Contains($secret, [System.StringComparison]::Ordinal)) {
        throw "A deployment secret was placed in host process argument $argumentIndex (length $($commandLine.Length))."
      }
    }
    $argumentIndex++
  }
}

$mockDockerSource = @'
package main

import (
    "fmt"
    "io"
    "os"
    "strings"
)

func require(value, label string) {
    for _, argument := range os.Args[1:] {
        if argument == value {
            return
        }
    }
    fmt.Fprintln(os.Stderr, "mock Docker missing", label)
    os.Exit(64)
}

func main() {
    if logPath := os.Getenv("REMOTEASSIST_TEST_DOCKER_ARGS"); logPath != "" {
        if err := os.WriteFile(logPath, []byte(strings.Join(os.Args[1:], "\n")), 0600); err != nil { os.Exit(74) }
    }
    mode := os.Getenv("REMOTEASSIST_TEST_DOCKER_MODE")
    if mode == "backup" || mode == "backup-failure" {
        require("BACKUP_DATABASE=remoteassist-backup-db", "backup database environment")
        require("BACKUP_USERNAME=remoteassist", "backup role environment")
        arguments := strings.Join(os.Args[1:], "\n")
        if !strings.Contains(arguments, "export PGPASSWORD=\"$POSTGRES_PASSWORD\"; export PGDATABASE=\"$BACKUP_DATABASE\"; exec pg_dump --no-password") || strings.Contains(arguments, "--dbname") {
            fmt.Fprintln(os.Stderr, "mock Docker missing safe pg_dump password/database configuration")
            os.Exit(64)
        }
        if _, err := os.Stdout.WriteString("-- PostgreSQL database dump\n-- Dumped from test fixture\n-- RESTORE_SENTINEL\nBEGIN;\nCOMMIT;\n"); err != nil { os.Exit(74) }
        if mode == "backup-failure" { os.Exit(9) }
        return
    }
    if mode == "restore" || mode == "restore-failure" {
        require("RESTORE_DATABASE=remoteassist_restore-v2", "recovery database environment")
        require("RESTORE_USERNAME=remoteassist", "restore role environment")
        arguments := strings.Join(os.Args[1:], "\n")
        if !strings.Contains(arguments, "export PGPASSWORD=\"$POSTGRES_PASSWORD\"; export PGDATABASE=\"$RESTORE_DATABASE\"; exec psql --no-psqlrc --single-transaction --set ON_ERROR_STOP=on") || strings.Contains(arguments, "--dbname") {
            fmt.Fprintln(os.Stderr, "mock Docker missing safe psql password/database/transaction configuration")
            os.Exit(64)
        }
        body, err := io.ReadAll(os.Stdin)
        if err != nil || !strings.Contains(string(body), "RESTORE_SENTINEL") { fmt.Fprintln(os.Stderr, "mock Docker did not receive the restore SQL input"); os.Exit(65) }
        if mode == "restore-failure" { fmt.Fprintln(os.Stderr, "mock SQL execution failure"); os.Exit(10) }
        fmt.Fprintln(os.Stdout, "mock transactional restore accepted")
        return
    }
    fmt.Fprintln(os.Stderr, "unsupported mock Docker mode")
    os.Exit(64)
}
'@

try {
  $validSettings = @(
    "POSTGRES_USER=remoteassist",
    "POSTGRES_DB=remoteassist",
    "POSTGRES_PASSWORD=$postgresPassword",
    "DATABASE_URL=postgres://remoteassist:$postgresPassword@postgres:5432/remoteassist?sslmode=disable"
  )
  [System.IO.File]::WriteAllLines($deploymentEnvPath, $validSettings, [System.Text.UTF8Encoding]::new($false))
  $databaseTarget = Get-ComposePostgresTarget $deploymentEnvPath
  if ($databaseTarget.DatabaseName -cne "remoteassist" -or $databaseTarget.UserName -cne "remoteassist") {
    throw "PostgreSQL maintenance did not select the configured Compose database and role."
  }
  Write-Host "PASS DATABASE_URL selects the matching Compose PostgreSQL target"

  $settingsWithRecoveryDatabase = @($validSettings[0], $validSettings[1], $validSettings[2], "DATABASE_URL=postgres://remoteassist:test-only-password@postgres:5432/remoteassist_restore-v2?sslmode=disable")
  [System.IO.File]::WriteAllLines($deploymentEnvPath, $settingsWithRecoveryDatabase, [System.Text.UTF8Encoding]::new($false))
  $recoveryTarget = Get-ComposePostgresTarget $deploymentEnvPath
  if ($recoveryTarget.DatabaseName -cne "remoteassist_restore-v2" -or $recoveryTarget.PostgresDatabase -cne "remoteassist") {
    throw "PostgreSQL maintenance did not allow a separate recovery database on the same Compose service."
  }

  foreach ($databasePath in @("host%3Devil", "postgresql%3A%2F%2Fevil")) {
    $databaseConnectionString = "DATABASE_URL=postgres://remoteassist:test-only-password@postgres:5432/$databasePath"
    $settingsWithConnectionStringDatabase = @($validSettings[0], $validSettings[1], $validSettings[2], $databaseConnectionString)
    [System.IO.File]::WriteAllLines($deploymentEnvPath, $settingsWithConnectionStringDatabase, [System.Text.UTF8Encoding]::new($false))
    Assert-ThrowsContaining { Get-ComposePostgresTarget $deploymentEnvPath } "PostgreSQL database names must not be libpq connection strings"
  }

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

  $go = Get-Command go.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (!$go) { throw "Go is required for the isolated Docker CLI mock check." }

  $mockSource = Join-Path $mockRoot "main.go"
  $mockExecutable = Join-Path $mockRoot "docker.exe"
  $mockArgumentsPath = Join-Path $mockRoot "docker-args.log"
  New-Item -ItemType Directory -Force -Path $mockRoot | Out-Null
  [System.IO.File]::WriteAllText($mockSource, $mockDockerSource, [System.Text.UTF8Encoding]::new($false))

  $previousPath = $env:PATH
  $previousMode = [Environment]::GetEnvironmentVariable("REMOTEASSIST_TEST_DOCKER_MODE", "Process")
  $previousArgumentsPath = [Environment]::GetEnvironmentVariable("REMOTEASSIST_TEST_DOCKER_ARGS", "Process")
  try {
    Push-Location $mockRoot
    try {
      & $go.Source build -trimpath -o $mockExecutable $mockSource
      if ($LASTEXITCODE -ne 0) { throw "Docker CLI mock failed to build (exit $LASTEXITCODE)." }
    } finally {
      Pop-Location
    }

    $specialDatabaseSettings = @(
      "POSTGRES_USER=remoteassist",
      "POSTGRES_DB=remoteassist-backup-db",
      "POSTGRES_PASSWORD=$postgresPassword",
      "DATABASE_URL=postgres://remoteassist:$postgresPassword@postgres:5432/remoteassist-backup-db?sslmode=disable"
    )
    [System.IO.File]::WriteAllLines($temporaryDeployEnv, $specialDatabaseSettings, [System.Text.UTF8Encoding]::new($false))
    $env:PATH = "$mockRoot;$previousPath"
    $env:REMOTEASSIST_TEST_DOCKER_ARGS = $mockArgumentsPath

    $mockBackupPath = Join-Path $fixtureDirectory "docker-cli-backup.sql"
    if (Test-Path -LiteralPath $mockBackupPath) { throw "Preserving existing integration backup: $mockBackupPath" }
    $env:REMOTEASSIST_TEST_DOCKER_MODE = "backup"
    & (Join-Path $PSScriptRoot "backup-postgres.ps1") -Output $mockBackupPath
    if ($LASTEXITCODE -ne 0 -or !(Test-PlainPostgreSqlDumpHeader $mockBackupPath)) {
      throw "Backup wrapper rejected valid mocked pg_dump output."
    }
    Assert-NoProcessSecrets -CommandLines (Get-Content -LiteralPath $mockArgumentsPath) -Secrets @($postgresPassword)
    Write-Host "PASS pg_dump invocation uses the configured database without exposing its password in process arguments"

    $oldBackup = "old-backup-before-failed-pg-dump"
    [System.IO.File]::WriteAllText($mockBackupPath, $oldBackup, [System.Text.UTF8Encoding]::new($false))
    $env:REMOTEASSIST_TEST_DOCKER_MODE = "backup-failure"
    Assert-ThrowsContaining { & (Join-Path $PSScriptRoot "backup-postgres.ps1") -Output $mockBackupPath } "backup failed with exit code 9"
    if ((Get-Content -LiteralPath $mockBackupPath -Raw) -ne $oldBackup) { throw "Failed pg_dump replaced the previous backup." }
    $partialPath = Join-Path (Split-Path -Parent $mockBackupPath) (".{0}.{1}.partial" -f (Split-Path -Leaf $mockBackupPath),$PID)
    if (Test-Path -LiteralPath $partialPath) { throw "Failed pg_dump left a partial backup file: $partialPath" }
    Write-Host "PASS failed pg_dump preserves the prior backup and removes its partial file"

    $restoreInput = Join-Path $fixtureDirectory "restore-input.sql"
    [System.IO.File]::WriteAllLines($restoreInput, @("-- PostgreSQL database dump", "-- RESTORE_SENTINEL", "BEGIN;", "COMMIT;"), [System.Text.UTF8Encoding]::new($false))
    $argumentsBeforeInvalidDatabase = Get-Content -LiteralPath $mockArgumentsPath -Raw
    Assert-ThrowsContaining { & (Join-Path $PSScriptRoot "restore-postgres.ps1") -Input $restoreInput -DatabaseName 'host=evil' } "DatabaseName must be a PostgreSQL database name, not a libpq connection string"
    if ((Get-Content -LiteralPath $mockArgumentsPath -Raw) -ne $argumentsBeforeInvalidDatabase) {
      throw "Invalid recovery database input reached the Docker process."
    }
    $env:REMOTEASSIST_TEST_DOCKER_MODE = "restore"
    & (Join-Path $PSScriptRoot "restore-postgres.ps1") -Input $restoreInput -DatabaseName "remoteassist_restore-v2"
    if ($LASTEXITCODE -ne 0) { throw "Mock transactional restore failed with exit $LASTEXITCODE." }
    $restoreArguments = Get-Content -LiteralPath $mockArgumentsPath
    Assert-NoProcessSecrets -CommandLines $restoreArguments -Secrets @($postgresPassword)
    if ($restoreArguments -notcontains "RESTORE_DATABASE=remoteassist_restore-v2" -or
        !($restoreArguments | Where-Object { $_ -like '*export PGPASSWORD="$POSTGRES_PASSWORD"; export PGDATABASE="$RESTORE_DATABASE"; exec psql*--single-transaction*--set ON_ERROR_STOP=on*' })) {
      throw "Restore wrapper omitted its internal password setup, requested database or atomic SQL transaction flags."
    }
    Write-Host "PASS restore streams the dump to psql with ON_ERROR_STOP and one transaction"

    $env:REMOTEASSIST_TEST_DOCKER_MODE = "restore-failure"
    Assert-ThrowsContaining { & (Join-Path $PSScriptRoot "restore-postgres.ps1") -Input $restoreInput -DatabaseName "remoteassist_restore-v2" } "restore failed and its single transaction was rolled back"
    $global:LASTEXITCODE = 0
    Write-Host "PASS psql failure is surfaced as a rolled-back restore"
  } finally {
    $env:PATH = $previousPath
    [Environment]::SetEnvironmentVariable("REMOTEASSIST_TEST_DOCKER_MODE", $previousMode, "Process")
    [Environment]::SetEnvironmentVariable("REMOTEASSIST_TEST_DOCKER_ARGS", $previousArgumentsPath, "Process")
    Remove-Item -LiteralPath $temporaryDeployEnv -Force -ErrorAction SilentlyContinue
  }

  Write-Host "PASS backup/restore preflight leaves existing backup files untouched"
} finally {
  $resolvedFixture = (Resolve-Path -LiteralPath $fixtureDirectory).Path
  $projectLocalRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot ".local")).Path
  $allowedPrefix = $projectLocalRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (!$resolvedFixture.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "PostgreSQL test fixture escaped the ignored project-local directory: $resolvedFixture"
  }
  Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
  $temporaryDeployEnv = Join-Path $projectRoot "deploy\.env"
  if (Test-Path -LiteralPath $temporaryDeployEnv -PathType Leaf) {
    throw "Temporary PostgreSQL test environment was not removed: $temporaryDeployEnv"
  }
}
