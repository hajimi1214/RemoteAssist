[CmdletBinding()]
param(
  [string]$Address = "192.168.0.100",
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
if ($Address -notmatch '^(10|192\.168)\.' -and $Address -notmatch '^172\.(1[6-9]|2[0-9]|3[0-1])\.') { throw "Address must be a private LAN IPv4 address." }
if ($Port -lt 1024 -or $Port -gt 65535) { throw "Port must be between 1024 and 65535." }
$root = Split-Path -Parent $PSScriptRoot
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
$previousPath = $env:PATH
$previousURL = $env:VITE_SIGNALING_URL
$previousLan = $env:VITE_LAN_TEST
$env:PATH = "$cargoBin;$env:PATH"
$env:VITE_SIGNALING_URL = "http://${Address}:$Port"
$env:VITE_LAN_TEST = "true"
$tauriConfig = Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$downloadDirectory = Join-Path $root ".local\lan-test-download"
$packageName = "RemoteAssist_{0}_x64-setup.exe" -f $tauriConfig.version

Push-Location $root
try {
  npm run tauri -- build --debug --features lan-test --config src-tauri/tauri.lan-test.conf.json
  if ($LASTEXITCODE -ne 0) { throw "LAN test package build failed (exit $LASTEXITCODE)." }
  $installer = Join-Path $root ("src-tauri\target\debug\bundle\nsis\{0}" -f $packageName)
  if (!(Test-Path -LiteralPath $installer)) { throw "LAN test installer was not produced." }
  New-Item -ItemType Directory -Force -Path $downloadDirectory | Out-Null
  $downloadedInstaller = Join-Path $downloadDirectory $packageName
  Copy-Item -LiteralPath $installer -Destination $downloadedInstaller -Force
  Write-Host "LAN test installer: $installer"
  Write-Host "Download copy: $downloadedInstaller"
  Get-FileHash -LiteralPath $downloadedInstaller -Algorithm SHA256
} finally {
  Pop-Location
  $env:PATH = $previousPath
  $env:VITE_SIGNALING_URL = $previousURL
  $env:VITE_LAN_TEST = $previousLan
}
