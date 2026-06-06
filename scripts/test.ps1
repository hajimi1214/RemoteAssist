$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$go = Join-Path ${env:ProgramFiles} "Go\bin\go.exe"
$cargo = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"

if (!(Test-Path $go)) { throw "Go not found at $go" }
if (!(Test-Path $cargo)) { throw "Cargo not found at $cargo" }

Push-Location $root
try {
  npm run build
  Push-Location (Join-Path $root "server")
  & $go test ./...
  & $go build ./cmd/signaling
  Remove-Item -LiteralPath (Join-Path (Get-Location) "signaling.exe") -ErrorAction SilentlyContinue
  Pop-Location
  Push-Location (Join-Path $root "src-tauri")
  & $cargo check
  Pop-Location
} finally {
  Pop-Location
}
