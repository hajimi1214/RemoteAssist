[CmdletBinding()]
param(
  [ValidateSet("Desktop", "Server", "Browser")]
  [string]$Mode = "Desktop",
  [string]$SignalingUrl = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"
# Preserve a native tool's actual exit code even when the caller enabled PowerShell 7 native errors.
$PSNativeCommandUseErrorActionPreference = $false
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentNames = @("VITE_SIGNALING_URL", "SIGNALING_ADDR", "PUBLIC_BASE_URL", "DATABASE_URL", "LOCAL_ADMIN_SEED_FILE")
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
  $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}
$locationChanged = $false
$commandExitCode = 1

try {
  Push-Location -LiteralPath $projectRoot
  $locationChanged = $true

  if ($Mode -eq "Server") {
    $goCommand = Get-Command go.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $goExecutable = if ($goCommand) { $goCommand.Source } else { Join-Path ${env:ProgramFiles} "Go\bin\go.exe" }
    if (!(Test-Path -LiteralPath $goExecutable -PathType Leaf)) { throw "Go was not found. Install Go or add go.exe to PATH." }

    # This mode is always a local, memory-backed preview, independent of deployment environment values.
    $env:SIGNALING_ADDR = "127.0.0.1:8080"
    $env:PUBLIC_BASE_URL = "http://localhost:8080"
    [Environment]::SetEnvironmentVariable("DATABASE_URL", $null, "Process")
    $seedPath = Join-Path $projectRoot ".local\admin-seed.json"
    if (Test-Path -LiteralPath $seedPath -PathType Leaf) {
      $env:LOCAL_ADMIN_SEED_FILE = $seedPath
      Write-Host "Starting local signaling with the existing administrator seed (password hash only)."
    } else {
      [Environment]::SetEnvironmentVariable("LOCAL_ADMIN_SEED_FILE", $null, "Process")
      Write-Host "Starting local signaling without an administrator seed; ordinary registration remains available."
    }
    Set-Location -LiteralPath (Join-Path $projectRoot "server")
    & $goExecutable run ./cmd/signaling
    $commandExitCode = $LASTEXITCODE
  } else {
    $serviceUri = $null
    if (![Uri]::TryCreate($SignalingUrl, [UriKind]::Absolute, [ref]$serviceUri) -or
        $serviceUri.Scheme -notin @("http", "https") -or $serviceUri.UserInfo -or $serviceUri.Query -or $serviceUri.Fragment) {
      throw "SignalingUrl must be an HTTP(S) URL without credentials, a query, or a fragment."
    }
    $npmCommand = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (!$npmCommand) { throw "npm.cmd was not found. Install Node.js and add it to PATH." }
    $env:VITE_SIGNALING_URL = $SignalingUrl.TrimEnd("/")
    if ($Mode -eq "Desktop") {
      Write-Host "Opening the desktop client. Keep the existing signaling server running in its own terminal."
      & $npmCommand.Source run tauri -- dev
    } else {
      Write-Host "Starting the browser preview at http://127.0.0.1:1420. Keep the existing signaling server running."
      & $npmCommand.Source run dev
    }
    $commandExitCode = $LASTEXITCODE
  }

  if ($commandExitCode -ne 0) {
    Write-Error "$Mode exited with code $commandExitCode." -ErrorAction Continue
  }
} catch {
  $commandExitCode = 1
  Write-Error $_ -ErrorAction Continue
} finally {
  foreach ($name in $environmentNames) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")
  }
  if ($locationChanged) { Pop-Location }
}

exit $commandExitCode
