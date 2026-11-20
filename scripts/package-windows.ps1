param(
  [string]$SignalingUrl = ""
)

$ErrorActionPreference = "Stop"
if ($SignalingUrl) {
  $serviceUri = $null
  if (![Uri]::TryCreate($SignalingUrl, [UriKind]::Absolute, [ref]$serviceUri) -or $serviceUri.Scheme -ne "https" -or $serviceUri.UserInfo -or $serviceUri.Query -or $serviceUri.Fragment -or $serviceUri.AbsolutePath -ne "/") { throw "SignalingUrl must be an HTTPS service origin without credentials, paths or parameters." }
}

$root = Split-Path -Parent $PSScriptRoot
$tauriConfig = Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $tauriConfig.version
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
$previousPath = $env:PATH
$previousSignalingUrl = $env:VITE_SIGNALING_URL
$env:PATH = "$cargoBin;$env:PATH"
$env:VITE_SIGNALING_URL = $SignalingUrl
$portable = Join-Path $root "src-tauri\target\release\remoteassist.exe"
$installer = Join-Path $root ("src-tauri\target\release\bundle\nsis\RemoteAssist_{0}_x64-setup.exe" -f $version)

Push-Location $root
try {
  npm run tauri:build
  if ($LASTEXITCODE -ne 0) { throw "Windows package build failed (exit $LASTEXITCODE)." }
  if (!(Test-Path -LiteralPath $portable) -or !(Test-Path -LiteralPath $installer)) {
    throw "Windows package build did not produce both expected artifacts."
  }
  Write-Host "Portable Windows EXE: $portable"
  Write-Host "Windows installer: $installer"
} finally {
  Pop-Location
  $env:PATH = $previousPath
  $env:VITE_SIGNALING_URL = $previousSignalingUrl
}
