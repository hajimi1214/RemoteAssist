$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$go = Join-Path ${env:ProgramFiles} "Go\bin\go.exe"
if (!(Test-Path $go)) { throw "Go not found at $go" }
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw "DATABASE_URL is required" }

Push-Location (Join-Path $root "server")
try {
  & $go run ./cmd/migrate
} finally {
  Pop-Location
}
