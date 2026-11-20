[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Address,
  [Parameter(Mandatory = $true)][string]$PublicCA,
  [ValidateRange(1024,65535)][int]$Port = 8443,
  [string]$MavenMirror = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$lanIP = $null
if (![Net.IPAddress]::TryParse($Address, [ref]$lanIP) -or $lanIP.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) {
  throw "Address must be a literal private IPv4 address."
}
$bytes = $lanIP.GetAddressBytes()
$isPrivate = $bytes[0] -eq 10 -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168)
if (!$isPrivate) { throw "LAN test builds only accept RFC1918 private addresses." }
$caPath = (Resolve-Path -LiteralPath $PublicCA).Path
$caText = [IO.File]::ReadAllText($caPath)
if ($caText -match 'PRIVATE KEY' -or $caText -notmatch '^\s*-----BEGIN CERTIFICATE-----') { throw "Supply only a public PEM CA certificate, never a key." }

$testDirectory = Join-Path $projectRoot ".local\lan-test\android"
$null = New-Item -ItemType Directory -Path (Join-Path $testDirectory "res\raw") -Force
$null = New-Item -ItemType Directory -Path (Join-Path $testDirectory "res\xml") -Force
Copy-Item -LiteralPath $caPath -Destination (Join-Path $testDirectory "res\raw\lan_test_ca.pem") -Force
$securityConfig = @"
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system" /></trust-anchors></base-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">$Address</domain>
    <trust-anchors><certificates src="@raw/lan_test_ca" /></trust-anchors>
  </domain-config>
</network-security-config>
"@
[IO.File]::WriteAllText((Join-Path $testDirectory "res\xml\lan_network_security_config.xml"), $securityConfig)
$manifest = @'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <application android:label="RemoteAssist LAN test" android:networkSecurityConfig="@xml/lan_network_security_config" tools:replace="android:label" />
</manifest>
'@
[IO.File]::WriteAllText((Join-Path $testDirectory "AndroidManifest.xml"), $manifest)
$previous = [Environment]::GetEnvironmentVariable("REMOTEASSIST_LAN_CONFIG_DIR", "Process")
try {
  $env:REMOTEASSIST_LAN_CONFIG_DIR = $testDirectory
  & (Join-Path $PSScriptRoot "package-android.ps1") -SignalingUrl "https://${Address}:$Port" -MavenMirror $MavenMirror
  $apk = Join-Path $projectRoot "src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk"
  $output = Join-Path $projectRoot ".local\lan-test\RemoteAssist-lan-test.apk"
  Copy-Item -LiteralPath $apk -Destination $output -Force
  Write-Host "LAN test APK: $output"
  Write-Host "This debug package trusts the supplied CA only for $Address. It does not install a system CA."
} finally {
  [Environment]::SetEnvironmentVariable("REMOTEASSIST_LAN_CONFIG_DIR", $previous, "Process")
}
