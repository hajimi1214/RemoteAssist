$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
$env:PATH = "$cargoBin;$env:PATH"

Push-Location $root
try {
  npm run tauri:build
  Write-Host "Portable Windows EXE: $(Join-Path $root 'src-tauri\target\release\remoteassist.exe')"
  Write-Host "Windows installer: $(Join-Path $root 'src-tauri\target\release\bundle\nsis\RemoteAssist_0.2.0_x64-setup.exe')"
} finally {
  Pop-Location
}
