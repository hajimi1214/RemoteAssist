$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$go = Join-Path ${env:ProgramFiles} "Go\bin\go.exe"
$cargo = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"

if (!(Test-Path $go)) { throw "Go not found at $go" }
if (!(Test-Path $cargo)) { throw "Cargo not found at $cargo" }

Push-Location $root
try {
  npm test
  if ($LASTEXITCODE -ne 0) { throw "Frontend tests failed (exit $LASTEXITCODE)." }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Frontend build failed (exit $LASTEXITCODE)." }
  Push-Location (Join-Path $root "server")
  try {
    & $go test ./...
    if ($LASTEXITCODE -ne 0) { throw "Go tests failed (exit $LASTEXITCODE)." }
    & $go build ./cmd/signaling
    if ($LASTEXITCODE -ne 0) { throw "Go build failed (exit $LASTEXITCODE)." }
  } finally {
    Remove-Item -LiteralPath (Join-Path (Get-Location) "signaling.exe") -ErrorAction SilentlyContinue
    Pop-Location
  }
  Push-Location (Join-Path $root "src-tauri")
  try {
    & $cargo check --locked
    if ($LASTEXITCODE -ne 0) { throw "Rust check failed (exit $LASTEXITCODE)." }
    & $cargo test --locked
    if ($LASTEXITCODE -ne 0) { throw "Rust tests failed (exit $LASTEXITCODE)." }
  } finally {
    Pop-Location
  }
} finally {
  Pop-Location
}
