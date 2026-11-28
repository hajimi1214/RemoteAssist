$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$projectRoot = Split-Path -Parent $PSScriptRoot
$fixtureRoot = Join-Path $env:TEMP ("remoteassist-deploy-config-test-" + [Guid]::NewGuid().ToString("N"))
$envFile = Join-Path $fixtureRoot ".env"

$postgresPassword = "TestOnly-Postgres-Password-2026"
$jwtSecret = "TestOnly-JWT-Signing-Secret-2026"
$refreshSecret = "TestOnly-Refresh-Token-Secret-2026"
$turnSecret = "TestOnly-TURN-Shared-Secret-2026"
$fixture = @(
  "REMOTEASSIST_VERSION=local",
  "PUBLIC_DOMAIN=lan-config-test.invalid",
  "PUBLIC_BASE_URL=https://lan-config-test.invalid",
  "SESSION_CODE_TTL=5m",
  "SESSION_ACTIVE_TTL=8h",
  "WS_MAX_MESSAGE_BYTES=65536",
  "RATE_LIMIT_PER_MINUTE=120",
  "LOGIN_FAIL_LIMIT_PER_MINUTE=10",
  "TRUSTED_PROXY_CIDRS=172.16.0.0/12",
  "APP_ORIGINS=http://tauri.localhost,https://tauri.localhost,tauri://localhost",
  "LOG_LEVEL=info",
  "POSTGRES_DB=remoteassist",
  "POSTGRES_USER=remoteassist",
  "POSTGRES_PASSWORD=$postgresPassword",
  "DATABASE_URL=postgres://remoteassist:$($postgresPassword.Replace('-', '%2D'))@postgres:5432/remoteassist?sslmode=disable",
  "JWT_SECRET=$jwtSecret",
  "REFRESH_TOKEN_SECRET=$refreshSecret",
  "TURN_REALM=lan-config-test.invalid",
  "TURN_EXTERNAL_IP=8.8.8.8",
  "TURN_RELAY_SUBNET=172.30.218.0/28",
  "TURN_RELAY_IP=172.30.218.2",
  "TURN_MIN_PORT=49152",
  "TURN_MAX_PORT=49152",
  "TURN_URLS=turn:lan-config-test.invalid:3478?transport=udp",
  "TURN_SECRET=$turnSecret",
  "TURN_CREDENTIAL_TTL=10m"
)

New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
try {
  [System.IO.File]::WriteAllLines($envFile, $fixture, [System.Text.UTF8Encoding]::new($false))
  & (Join-Path $PSScriptRoot "verify-deploy-config.ps1") -EnvFile $envFile
  if ($LASTEXITCODE -ne 0) {
    throw "Valid synthetic deployment configuration failed with exit code $LASTEXITCODE."
  }
  Write-Host "PASS valid synthetic deployment configuration"

  foreach ($case in @(
    @{ Name = "external database host"; Line = "DATABASE_URL=postgres://remoteassist:$($postgresPassword.Replace('-', '%2D'))@external-postgres:5432/remoteassist?sslmode=disable"; Message = "DATABASE_URL must target the Compose PostgreSQL service" },
    @{ Name = "database name mismatch"; Line = "DATABASE_URL=postgres://remoteassist:$($postgresPassword.Replace('-', '%2D'))@postgres:5432/other?sslmode=disable"; Message = "DATABASE_URL database must match POSTGRES_DB" },
    @{ Name = "database role mismatch"; Line = "DATABASE_URL=postgres://other:$($postgresPassword.Replace('-', '%2D'))@postgres:5432/remoteassist?sslmode=disable"; Message = "DATABASE_URL user must match POSTGRES_USER" },
    @{ Name = "database password mismatch"; Line = "DATABASE_URL=postgres://remoteassist:wrong%2Dpassword@postgres:5432/remoteassist?sslmode=disable"; Message = "DATABASE_URL credentials must match POSTGRES_USER and POSTGRES_PASSWORD" }
  )) {
    $invalidFixture = @($fixture | Where-Object { $_ -notmatch '^DATABASE_URL=' }) + $case.Line
    [System.IO.File]::WriteAllLines($envFile, $invalidFixture, [System.Text.UTF8Encoding]::new($false))
    $rejected = $false
    try {
      & (Join-Path $PSScriptRoot "verify-deploy-config.ps1") -EnvFile $envFile
    } catch {
      $rejected = $_.Exception.Message -like "*$($case.Message)*"
      if (!$rejected) { Write-Host "Expected '$($case.Message)', received '$($_.Exception.Message)'" }
    }
    if (!$rejected) { throw "The verifier did not reject $($case.Name)." }
    Write-Host "PASS invalid $($case.Name) is rejected"
  }

  [System.IO.File]::WriteAllLines($envFile, $fixture, [System.Text.UTF8Encoding]::new($false))
  $composeVariableNames = @($fixture | ForEach-Object { if ($_ -match '^([A-Za-z_][A-Za-z0-9_]*)=') { $Matches[1] } })
  $previousEnvironment = @{}
  try {
    foreach ($name in $composeVariableNames) {
      $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
      $settingLine = $fixture | Where-Object { $_ -like "$name=*" } | Select-Object -Last 1
      [Environment]::SetEnvironmentVariable($name, $settingLine.Substring($name.Length + 1), "Process")
    }
    $env:DATABASE_URL = "postgres://other:$($postgresPassword.Replace('-', '%2D'))@postgres:5432/remoteassist?sslmode=disable"
    $overrideRejected = $false
    try {
      & (Join-Path $PSScriptRoot "verify-deploy-config.ps1") -EnvFile $envFile
    } catch {
      $overrideRejected = $_.Exception.Message -like "*Effective DATABASE_URL differs from the deployment env file*"
    }
    if (!$overrideRejected) { throw "The verifier did not reject a process-level DATABASE_URL override." }
    Write-Host "PASS process-level DATABASE_URL overrides are rejected"
  } finally {
    foreach ($name in $composeVariableNames) {
      [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")
    }
  }

  $templateRejected = $false
  try {
    & (Join-Path $PSScriptRoot "verify-deploy-config.ps1") -EnvFile (Join-Path $projectRoot "deploy/.env.example")
  } catch {
    $templateRejected = $_.Exception.Message -match "PUBLIC_DOMAIN is empty or still contains a template value"
  }
  if (!$templateRejected) { throw "The deployment verifier did not reject the tracked template values." }
  Write-Host "PASS tracked deployment template is rejected"
} finally {
  $resolvedFixtureRoot = (Resolve-Path -LiteralPath $fixtureRoot).Path
  $temporaryRoot = (Resolve-Path -LiteralPath $env:TEMP).Path
  $temporaryPrefix = $temporaryRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (!$resolvedFixtureRoot.StartsWith($temporaryPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Temporary test fixture escaped the system temp directory: $resolvedFixtureRoot"
  }
  Remove-Item -LiteralPath $resolvedFixtureRoot -Recurse -Force
}
