param(
  [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $EnvFile = Join-Path $root "deploy\.env"
} elseif (!(Split-Path -IsAbsolute $EnvFile)) {
  $EnvFile = Join-Path $root $EnvFile
}
$composeFile = Join-Path $root "deploy\docker-compose.yml"

if (!(Test-Path -LiteralPath $EnvFile)) {
  throw "Deployment env file not found: $EnvFile. Copy deploy/.env.example to deploy/.env and replace every placeholder first."
}

$values = @{}
foreach ($line in Get-Content -LiteralPath $EnvFile) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
    $values[$Matches[1]] = $Matches[2].Trim().Trim('"')
  }
}
$required = @(
  "PUBLIC_DOMAIN", "PUBLIC_BASE_URL", "POSTGRES_PASSWORD", "DATABASE_URL",
  "JWT_SECRET", "REFRESH_TOKEN_SECRET", "TURN_REALM", "TURN_EXTERNAL_IP",
  "TURN_URLS", "TURN_SECRET", "APP_ORIGINS", "TRUSTED_PROXY_CIDRS"
)
foreach ($name in $required) {
  $value = [string]$values[$name]
  if ([string]::IsNullOrWhiteSpace($value) -or $value -match 'replace-with|example\.com|203\.0\.113\.') {
    throw "$name is empty or still contains a template value."
  }
}
foreach ($name in @("JWT_SECRET", "REFRESH_TOKEN_SECRET", "TURN_SECRET")) {
  if (([string]$values[$name]).Length -lt 32) {
    throw "$name must contain at least 32 characters."
  }
}
if ($values["JWT_SECRET"] -eq $values["REFRESH_TOKEN_SECRET"] -or
    $values["JWT_SECRET"] -eq $values["TURN_SECRET"] -or
    $values["REFRESH_TOKEN_SECRET"] -eq $values["TURN_SECRET"]) {
  throw "JWT_SECRET, REFRESH_TOKEN_SECRET, and TURN_SECRET must be distinct."
}
if ([string]$values["PUBLIC_BASE_URL"] -notmatch '^https://') {
  throw "PUBLIC_BASE_URL must use https://"
}
if (!(([string]$values["TURN_URLS"] -split ',' | ForEach-Object { $_.Trim() }) -match '^turn:[A-Za-z0-9.-]+:3478(?:\?transport=udp)?$')) {
  throw "TURN_URLS must advertise a UDP listener at port 3478 (turn:hostname:3478?transport=udp)."
}
if ([string]$values["APP_ORIGINS"] -match '\*') {
  throw "APP_ORIGINS must use exact origins; wildcards are not allowed."
}

function Get-Setting($Name, $Default) {
  if ([string]::IsNullOrWhiteSpace($values[$Name])) { return $Default }
  return $values[$Name]
}

function ConvertTo-IPv4Number([string]$Address, [string]$Setting) {
  $parsed = $null
  if ($Address -notmatch '^\d{1,3}(?:\.\d{1,3}){3}$' -or
      ![Net.IPAddress]::TryParse($Address, [ref]$parsed) -or $parsed.ToString() -ne $Address) {
    throw "$Setting must be a canonical dotted IPv4 address."
  }
  $octets = $parsed.GetAddressBytes()
  return [uint64]$octets[0] * 16777216 + [uint64]$octets[1] * 65536 + [uint64]$octets[2] * 256 + $octets[3]
}

function Test-PrivateIPv4([uint64]$Address) {
  return ($Address -ge 167772160 -and $Address -le 184549375) -or
         ($Address -ge 2886729728 -and $Address -le 2887778303) -or
         ($Address -ge 3232235520 -and $Address -le 3232301055)
}

$external = [string]$values["TURN_EXTERNAL_IP"]
$externalNum = ConvertTo-IPv4Number $external "TURN_EXTERNAL_IP"
if ((Test-PrivateIPv4 $externalNum) -or $external -match '^(?:0\.|127\.|169\.254\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)' -or
    ($externalNum -ge 1681915904 -and $externalNum -le 1686110207) -or $externalNum -ge 3758096384) {
  throw "TURN_EXTERNAL_IP must be the public IPv4/EIP, not a private or special-purpose address."
}

$relay = Get-Setting "TURN_RELAY_IP" "172.30.218.2"
$relayNum = ConvertTo-IPv4Number $relay "TURN_RELAY_IP"
$subnet = Get-Setting "TURN_RELAY_SUBNET" "172.30.218.0/28"
if ($subnet -notmatch '^(?<network>[^/]+)/(?<prefix>\d{1,2})$') {
  throw "TURN_RELAY_SUBNET must be a private IPv4 CIDR."
}
$network = ConvertTo-IPv4Number $Matches.network "TURN_RELAY_SUBNET"
$prefix = [int]$Matches.prefix
if ($prefix -lt 8 -or $prefix -gt 30) { throw "TURN_RELAY_SUBNET must use a prefix between /8 and /30." }
$size = [uint64]1 -shl (32 - $prefix)
$broadcast = $network + $size - 1
if ($network % $size -ne 0 -or !(Test-PrivateIPv4 $network) -or !(Test-PrivateIPv4 $broadcast)) {
  throw "TURN_RELAY_SUBNET must start at a private IPv4 network boundary."
}
if ($relayNum -le ($network + 1) -or $relayNum -ge $broadcast) {
  throw "TURN_RELAY_IP must be a usable address in TURN_RELAY_SUBNET, after its default gateway."
}

$minimum = 0
$maximum = 0
if (![int]::TryParse((Get-Setting "TURN_MIN_PORT" "49152"), [ref]$minimum) -or
    ![int]::TryParse((Get-Setting "TURN_MAX_PORT" "49200"), [ref]$maximum) -or
    $minimum -lt 49152 -or $maximum -gt 65535 -or $maximum -lt $minimum) {
  throw "TURN_MIN_PORT and TURN_MAX_PORT must describe an ordered UDP relay range within 49152-65535."
}

# Inspect the effective config in memory: Compose environment overrides must not
# silently point the advertised EIP/UDP range somewhere other than the verified file.
$rendered = docker compose --env-file $EnvFile -f $composeFile config --format json 2>$null
if ($LASTEXITCODE -ne 0) { throw "Docker Compose validation failed (exit $LASTEXITCODE)." }
try { $compose = ($rendered -join "`n") | ConvertFrom-Json } catch { throw "Could not read rendered Docker Compose configuration." }
$turn = $compose.services.coturn
$expectedArgs = @(
  "--use-auth-secret", "--static-auth-secret=$($values["TURN_SECRET"])",
  "--listening-ip=$relay", "--relay-ip=$relay", "--external-ip=$external/$relay", "--listening-port=3478",
  "--min-port=$minimum", "--max-port=$maximum"
)
foreach ($arg in $expectedArgs) {
  if ($arg -cnotin $turn.command) { throw "Coturn arguments do not match the verified deployment settings. Check Compose overrides." }
}
if ($turn.networks.turn.ipv4_address -ne $relay -or $compose.networks.turn.ipam.config[0].subnet -ne $subnet -or
    $compose.services.signaling.environment.TURN_URLS -cne $values["TURN_URLS"] -or
    $compose.services.signaling.environment.TURN_SECRET -cne $values["TURN_SECRET"]) {
  throw "Effective TURN settings differ from the env file. Check Compose overrides."
}
$udpPorts = @{}
$hasTCP = $false
foreach ($port in $turn.ports) {
  if ([string]$port.target -ne [string]$port.published) { throw "TURN ports must preserve the same public and container port numbers." }
  if ($port.protocol -eq "udp") { $udpPorts[[int]$port.target] = $true }
  if ($port.protocol -eq "tcp" -and $port.target -eq 3478) { $hasTCP = $true }
}
if (!$hasTCP -or !$udpPorts.ContainsKey(3478)) { throw "Coturn must publish UDP and TCP port 3478." }
for ($port = $minimum; $port -le $maximum; $port++) {
  if (!$udpPorts.ContainsKey($port)) { throw "The effective published UDP relay range is incomplete." }
}
Write-Host "Deployment configuration is valid: $EnvFile"
