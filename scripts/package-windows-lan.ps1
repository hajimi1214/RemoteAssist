[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Address,
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$parsedAddress = $null
if (![Net.IPAddress]::TryParse($Address, [ref]$parsedAddress) -or $parsedAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $parsedAddress.ToString() -ne $Address) { throw "Address must be a canonical IPv4 address." }
$bytes = $parsedAddress.GetAddressBytes()
$privateAddress = $bytes[0] -eq 10 -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168)
if (!$privateAddress) { throw "Address must be an RFC1918 private LAN IPv4 address." }
if (!(Get-NetIPAddress -AddressFamily IPv4 -IPAddress $Address -ErrorAction SilentlyContinue)) { throw "Address is not assigned to this computer." }
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
$configDirectory = Join-Path $root ".local\lan-test-build"
$packageName = "RemoteAssist_{0}_x64-setup.exe" -f $tauriConfig.version
$lanOrigin = "http://${Address}:$Port"
$lanWebSocketOrigin = "ws://${Address}:$Port"
$csp = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost data: blob:; media-src 'self' blob:; connect-src ipc: http://ipc.localhost http://localhost:8080 ws://localhost:8080 $lanOrigin $lanWebSocketOrigin"
$lanConfig = @{ app = @{ security = @{ csp = $csp } } } | ConvertTo-Json -Depth 5
$lanConfigPath = Join-Path $configDirectory "tauri.lan-test.$Address.json"

Push-Location $root
try {
  New-Item -ItemType Directory -Force -Path $configDirectory | Out-Null
  Set-Content -LiteralPath $lanConfigPath -Value $lanConfig -Encoding utf8NoBOM
  npm run tauri -- build --debug --features lan-test --config $lanConfigPath
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
