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
  "STUN_URLS=stun:stun.lan-config-test.invalid:3478",
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

  $emptyStunFixture = @($fixture | Where-Object { $_ -notmatch '^STUN_URLS=' }) + "STUN_URLS="
  [System.IO.File]::WriteAllLines($envFile, $emptyStunFixture, [System.Text.UTF8Encoding]::new($false))
  & (Join-Path $PSScriptRoot "verify-deploy-config.ps1") -EnvFile $envFile
  if ($LASTEXITCODE -ne 0) { throw "An empty optional STUN configuration failed validation." }
  Write-Host "PASS empty STUN configuration keeps public STUN disabled"

  $recoveryFixture = @($fixture | ForEach-Object {
    if ($_ -like "POSTGRES_DB=*") { "POSTGRES_DB=remoteassist_restore" }
    elseif ($_ -like "DATABASE_URL=*") { "DATABASE_URL=postgres://remoteassist:$($postgresPassword.Replace('-', '%2D'))@postgres:5432/remoteassist_restore?sslmode=disable" }
    else { $_ }
  })
  [System.IO.File]::WriteAllLines($envFile, $recoveryFixture, [System.Text.UTF8Encoding]::new($false))
  & (Join-Path $PSScriptRoot "verify-deploy-config.ps1") -EnvFile $envFile
  if ($LASTEXITCODE -ne 0) { throw "Separate empty recovery database configuration failed (exit $LASTEXITCODE)." }
  Write-Host "PASS separate recovery database configuration"

  [System.IO.File]::WriteAllLines($envFile, $fixture, [System.Text.UTF8Encoding]::new($false))
  foreach ($case in @(
    @{ Name = "PUBLIC_BASE_URL host mismatch"; Key = "PUBLIC_BASE_URL"; Line = "PUBLIC_BASE_URL=https://different-domain.invalid"; Message = "PUBLIC_BASE_URL host must match PUBLIC_DOMAIN" },
    @{ Name = "localhost production domain"; Key = "PUBLIC_DOMAIN"; Line = "PUBLIC_DOMAIN=localhost"; Message = "PUBLIC_BASE_URL host must match PUBLIC_DOMAIN" },
    @{ Name = "malformed application origin"; Key = "APP_ORIGINS"; Line = "APP_ORIGINS=https://lan-config-test.invalid/private/path"; Message = "APP_ORIGINS contains a malformed or unsupported application origin" },
    @{ Name = "wildcard application origin"; Key = "APP_ORIGINS"; Line = "APP_ORIGINS=*"; Message = "APP_ORIGINS must use exact origins" },
    @{ Name = "malformed STUN URL"; Key = "STUN_URLS"; Line = "STUN_URLS=https://stun.example.test"; Message = "STUN_URLS must contain comma-separated stun: or stuns: URLs" },
    @{ Name = "invalid trusted proxy CIDR"; Key = "TRUSTED_PROXY_CIDRS"; Line = "TRUSTED_PROXY_CIDRS=172.16.0.0"; Message = "TRUSTED_PROXY_CIDRS contains an invalid or unrestricted CIDR range" },
    @{ Name = "unrestricted trusted proxy CIDR"; Key = "TRUSTED_PROXY_CIDRS"; Line = "TRUSTED_PROXY_CIDRS=0.0.0.0/0"; Message = "TRUSTED_PROXY_CIDRS contains an invalid or unrestricted CIDR range" },
    @{ Name = "external database host"; Key = "DATABASE_URL"; Line = "DATABASE_URL=postgres://remoteassist:$($postgresPassword.Replace('-', '%2D'))@external-postgres:5432/remoteassist?sslmode=disable"; Message = "DATABASE_URL must target the Compose PostgreSQL service" },
    @{ Name = "database name omitted"; Key = "DATABASE_URL"; Line = "DATABASE_URL=postgres://remoteassist:$($postgresPassword.Replace('-', '%2D'))@postgres:5432/?sslmode=disable"; Message = "DATABASE_URL must name a nonempty PostgreSQL database" },
    @{ Name = "connection-string-shaped database name"; Key = "DATABASE_URL"; Line = "DATABASE_URL=postgres://remoteassist:$($postgresPassword.Replace('-', '%2D'))@postgres:5432/host%3Devil?sslmode=disable"; Message = "DATABASE_URL and POSTGRES_DB must not name a libpq connection string" },
    @{ Name = "database role mismatch"; Key = "DATABASE_URL"; Line = "DATABASE_URL=postgres://other:$($postgresPassword.Replace('-', '%2D'))@postgres:5432/remoteassist?sslmode=disable"; Message = "DATABASE_URL user must match POSTGRES_USER" },
    @{ Name = "database password mismatch"; Key = "DATABASE_URL"; Line = "DATABASE_URL=postgres://remoteassist:wrong%2Dpassword@postgres:5432/remoteassist?sslmode=disable"; Message = "DATABASE_URL credentials must match POSTGRES_USER and POSTGRES_PASSWORD" }
  )) {
    $settingPattern = "^{0}=" -f [regex]::Escape($case.Key)
    $invalidFixture = @($fixture | Where-Object { $_ -notmatch $settingPattern }) + $case.Line
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
      $overrideRejected = $_.Exception.Message -like "*Effective signaling setting 'DATABASE_URL' differs from the deployment env file*"
    }
    if (!$overrideRejected) { throw "The verifier did not reject a process-level DATABASE_URL override." }
    Write-Host "PASS process-level DATABASE_URL overrides are rejected"

    $configuredDatabaseLine = $fixture | Where-Object { $_ -like "DATABASE_URL=*" } | Select-Object -Last 1
    [Environment]::SetEnvironmentVariable("DATABASE_URL", $configuredDatabaseLine.Substring("DATABASE_URL".Length + 1), "Process")

    $env:POSTGRES_PASSWORD = "different-process-only-test-password"
    $postgresOverrideRejected = $false
    try {
      & (Join-Path $PSScriptRoot "verify-deploy-config.ps1") -EnvFile $envFile
    } catch {
      $postgresOverrideRejected = $_.Exception.Message -like "*Effective PostgreSQL initialization settings differ from the deployment env file*"
    }
    if (!$postgresOverrideRejected) { throw "The verifier did not reject a rendered POSTGRES_PASSWORD override." }
    Write-Host "PASS process-level PostgreSQL initialization overrides are rejected"

    $postgresPasswordLine = $fixture | Where-Object { $_ -like "POSTGRES_PASSWORD=*" } | Select-Object -Last 1
    [Environment]::SetEnvironmentVariable("POSTGRES_PASSWORD", $postgresPasswordLine.Substring("POSTGRES_PASSWORD".Length + 1), "Process")

    $env:PUBLIC_BASE_URL = "https://another-domain.invalid"
    $serviceUrlOverrideRejected = $false
    try {
      & (Join-Path $PSScriptRoot "verify-deploy-config.ps1") -EnvFile $envFile
    } catch {
      $serviceUrlOverrideRejected = $_.Exception.Message -like "*Effective signaling setting 'PUBLIC_BASE_URL' differs from the deployment env file*"
    }
    if (!$serviceUrlOverrideRejected) { throw "The verifier did not reject a rendered PUBLIC_BASE_URL override." }
    Write-Host "PASS process-level public HTTPS URL overrides are rejected"

    $publicBaseUrlLine = $fixture | Where-Object { $_ -like "PUBLIC_BASE_URL=*" } | Select-Object -Last 1
    [Environment]::SetEnvironmentVariable("PUBLIC_BASE_URL", $publicBaseUrlLine.Substring("PUBLIC_BASE_URL".Length + 1), "Process")

    $env:PUBLIC_DOMAIN = "override.invalid"
    $domainOverrideRejected = $false
    try {
      & (Join-Path $PSScriptRoot "verify-deploy-config.ps1") -EnvFile $envFile
    } catch {
      $domainOverrideRejected = $_.Exception.Message -like "*Effective Caddy HTTPS domain differs from the deployment env file*"
    }
    if (!$domainOverrideRejected) { throw "The verifier did not reject a rendered PUBLIC_DOMAIN override." }
    Write-Host "PASS process-level Caddy/public HTTPS host overrides are rejected"

    $env:APP_ORIGINS = "*"
    $appOriginsOverrideRejected = $false
    try {
      & (Join-Path $PSScriptRoot "verify-deploy-config.ps1") -EnvFile $envFile
    } catch {
      $appOriginsOverrideRejected = $_.Exception.Message -like "*Effective signaling setting 'APP_ORIGINS' differs from the deployment env file*"
    }
    if (!$appOriginsOverrideRejected) { throw "The verifier did not reject a rendered wildcard APP_ORIGINS override." }
    Write-Host "PASS process-level app origin overrides are rejected"

    $appOriginsLine = $fixture | Where-Object { $_ -like "APP_ORIGINS=*" } | Select-Object -Last 1
    [Environment]::SetEnvironmentVariable("APP_ORIGINS", $appOriginsLine.Substring("APP_ORIGINS".Length + 1), "Process")

    $env:TRUSTED_PROXY_CIDRS = "0.0.0.0/0"
    $proxyOverrideRejected = $false
    try {
      & (Join-Path $PSScriptRoot "verify-deploy-config.ps1") -EnvFile $envFile
    } catch {
      $proxyOverrideRejected = $_.Exception.Message -like "*Effective signaling setting 'TRUSTED_PROXY_CIDRS' differs from the deployment env file*"
    }
    if (!$proxyOverrideRejected) { throw "The verifier did not reject a broad TRUSTED_PROXY_CIDRS override." }
    Write-Host "PASS process-level trusted proxy overrides are rejected"
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
