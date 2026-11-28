[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Address,
  [int]$Port = 8080,
  [string]$StunUrls = "",
  [string]$TlsCertFile = "",
  [string]$TlsKeyFile = "",
  [switch]$InsecureHttpTest
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$go = Get-Command go.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$go) { throw "Go was not found. Install Go or add go.exe to PATH." }
$parsedAddress = $null
if (![Net.IPAddress]::TryParse($Address, [ref]$parsedAddress) -or $parsedAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $parsedAddress.ToString() -ne $Address) { throw "Address must be a canonical IPv4 address." }
$bytes = $parsedAddress.GetAddressBytes()
$privateAddress = $bytes[0] -eq 10 -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168)
if (!$privateAddress) { throw "Address must be an RFC1918 private LAN IPv4 address." }
if (!(Get-NetIPAddress -AddressFamily IPv4 -IPAddress $Address -ErrorAction SilentlyContinue)) { throw "Address is not assigned to this computer." }
if ($Port -lt 1024 -or $Port -gt 65535) { throw "Port must be between 1024 and 65535." }
if ($InsecureHttpTest) {
  if ($TlsCertFile -or $TlsKeyFile) { throw "Insecure HTTP test mode cannot be combined with TLS files." }
} elseif (!$TlsCertFile -or !$TlsKeyFile) {
  throw "LAN servers require a trusted TLS certificate and private key. Provide -TlsCertFile and -TlsKeyFile. Use -InsecureHttpTest only for isolated disposable tests."
}

foreach ($file in @($TlsCertFile, $TlsKeyFile) | Where-Object { $_ }) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "TLS file does not exist: $file" }
}

$tlsCertPath = if ($TlsCertFile) { (Resolve-Path -LiteralPath $TlsCertFile).Path } else { "" }
$tlsKeyPath = if ($TlsKeyFile) { (Resolve-Path -LiteralPath $TlsKeyFile).Path } else { "" }

$names = @("SIGNALING_ADDR", "PUBLIC_BASE_URL", "APP_ORIGINS", "STUN_URLS", "DATABASE_URL", "LOCAL_ADMIN_SEED_FILE", "TLS_CERT_FILE", "TLS_KEY_FILE")
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }
try {
  $env:SIGNALING_ADDR = "${Address}:$Port"
  $scheme = if ($InsecureHttpTest) { "http" } else { "https" }
  $env:PUBLIC_BASE_URL = "${scheme}://${Address}:$Port"
  $env:APP_ORIGINS = "http://tauri.localhost,https://tauri.localhost,tauri://localhost"
  $env:STUN_URLS = $StunUrls.Trim()
  $env:TLS_CERT_FILE = $tlsCertPath
  $env:TLS_KEY_FILE = $tlsKeyPath
  [Environment]::SetEnvironmentVariable("DATABASE_URL", $null, "Process")
  [Environment]::SetEnvironmentVariable("LOCAL_ADMIN_SEED_FILE", $null, "Process")

  Push-Location (Join-Path $root "server")
  try {
    if ($InsecureHttpTest) {
      Write-Warning "Disposable HTTP LAN test server. Test credentials and tokens traverse the LAN without transport encryption."
    } else {
      Write-Host "Starting TLS LAN signaling at https://${Address}:$Port. Clients must trust the certificate issuer."
    }
    & $go.Source run ./cmd/signaling
  } finally { Pop-Location }
} finally {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process") }
}
