param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$SignalingUrl
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$tauriConfig = Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $tauriConfig.version
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
$env:PATH = "$cargoBin;$env:PATH"
$env:VITE_SIGNALING_URL = $SignalingUrl
$installer = Join-Path $root ("src-tauri\target\release\bundle\nsis\RemoteAssist_{0}_x64-setup.exe" -f $version)

Push-Location $root
try {
  npm run tauri:build
  Write-Host "Portable Windows EXE: $(Join-Path $root 'src-tauri\target\release\remoteassist.exe')"
  Write-Host "Windows installer: $installer"
} finally {
  Pop-Location
}
