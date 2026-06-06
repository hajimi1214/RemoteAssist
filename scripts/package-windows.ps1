$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
$cargo = Join-Path $cargoBin "cargo.exe"
$env:PATH = "$cargoBin;$env:PATH"

Push-Location $root
try {
  npm run build
  Push-Location (Join-Path $root "src-tauri")
  & $cargo build --release
  Pop-Location
  Write-Host "Portable Windows EXE: $(Join-Path $root 'src-tauri\target\release\remoteassist.exe')"
} finally {
  Pop-Location
}
