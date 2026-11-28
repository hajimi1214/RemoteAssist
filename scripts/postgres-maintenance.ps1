function Read-DeploymentSettings([string]$Path) {
  $settings = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      $settings[$Matches[1]] = $Matches[2].Trim().Trim('"')
    }
  }
  return $settings
}

function Get-ComposePostgresTarget([string]$EnvFile) {
  $settings = Read-DeploymentSettings $EnvFile
  $databaseUri = $null
  $databaseUrl = [string]$settings["DATABASE_URL"]
  if (![Uri]::TryCreate($databaseUrl, [UriKind]::Absolute, [ref]$databaseUri) -or $databaseUri.Scheme -notin @("postgres", "postgresql")) {
    throw "DATABASE_URL must be an absolute PostgreSQL connection URL."
  }
  if ($databaseUri.Host -cne "postgres" -or ($databaseUri.Port -ne -1 -and $databaseUri.Port -ne 5432)) {
    throw "DATABASE_URL must target the PostgreSQL service on the private Compose network."
  }

  $databaseName = [Uri]::UnescapeDataString($databaseUri.AbsolutePath.TrimStart('/'))
  $postgresDatabase = [string]$settings["POSTGRES_DB"]
  $userInfoParts = $databaseUri.UserInfo.Split(':', 2)
  if ($userInfoParts.Count -ne 2 -or [Uri]::UnescapeDataString($userInfoParts[1]) -cne [string]$settings["POSTGRES_PASSWORD"]) {
    throw "DATABASE_URL credentials must match POSTGRES_USER and POSTGRES_PASSWORD."
  }
  $databaseUser = [Uri]::UnescapeDataString($userInfoParts[0])
  $postgresUser = [string]$settings["POSTGRES_USER"]
  if ($databaseUser -cne $postgresUser) { throw "DATABASE_URL user must match POSTGRES_USER." }

  foreach ($identifier in @($databaseName, $databaseUser, $postgresDatabase)) {
    if ([string]::IsNullOrWhiteSpace($identifier) -or [System.Text.Encoding]::UTF8.GetByteCount($identifier) -gt 63 -or $identifier -match '[\x00-\x1F\x7F]') {
      throw "PostgreSQL user and database names must be nonempty identifiers of at most 63 UTF-8 bytes."
    }
  }
  if ($databaseName.Contains('=') -or $postgresDatabase.Contains('=') -or
      $databaseName -match '^(postgres|postgresql)://' -or $postgresDatabase -match '^(postgres|postgresql)://') {
    throw "PostgreSQL database names must not be libpq connection strings."
  }

  return [pscustomobject]@{ DatabaseName = $databaseName; UserName = $databaseUser; PostgresDatabase = $postgresDatabase }
}

function Test-PlainPostgreSqlDumpHeader([string]$Path) {
  $reader = [System.IO.StreamReader]::new($Path, [System.Text.Encoding]::UTF8, $true)
  try {
    for ($lineNumber = 0; $lineNumber -lt 5; $lineNumber++) {
      $line = $reader.ReadLine()
      if ($null -eq $line) { return $false }
      if ($line -ceq "-- PostgreSQL database dump") { return $true }
    }
    return $false
  } finally {
    $reader.Dispose()
  }
}
