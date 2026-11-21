[CmdletBinding()]
param(
  [string]$Address = "192.168.0.100",
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$go = Get-Command go.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$go) { throw "Go was not found. Install Go or add go.exe to PATH." }
$parsedAddress = $null
if (![Net.IPAddress]::TryParse($Address, [ref]$parsedAddress) -or $parsedAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw "Address must be an IPv4 address." }
$bytes = $parsedAddress.GetAddressBytes()
$privateAddress = $bytes[0] -eq 10 -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168)
if (!$privateAddress) { throw "Address must be an RFC1918 private LAN IPv4 address." }
if (!(Get-NetIPAddress -AddressFamily IPv4 -IPAddress $Address -ErrorAction SilentlyContinue)) { throw "Address is not assigned to this computer." }
if ($Port -lt 1024 -or $Port -gt 65535) { throw "Port must be between 1024 and 65535." }

$names = @("SIGNALING_ADDR", "PUBLIC_BASE_URL", "APP_ORIGINS", "DATABASE_URL", "LOCAL_ADMIN_SEED_FILE")
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }
try {
  $env:SIGNALING_ADDR = "${Address}:$Port"
  $env:PUBLIC_BASE_URL = "http://${Address}:$Port"
  $env:APP_ORIGINS = "http://tauri.localhost,https://tauri.localhost,tauri://localhost"
  [Environment]::SetEnvironmentVariable("DATABASE_URL", $null, "Process")
  [Environment]::SetEnvironmentVariable("LOCAL_ADMIN_SEED_FILE", $null, "Process")

  Push-Location (Join-Path $root "server")
  try { & $go.Source run ./cmd/signaling } finally { Pop-Location }
} finally {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process") }
}
