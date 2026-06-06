param(
  [string]$SignalingUrl = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$go = Join-Path ${env:ProgramFiles} "Go\bin\go.exe"
if (!(Test-Path $go)) { throw "Go not found at $go" }

$env:VITE_SIGNALING_URL = $SignalingUrl
Start-Process -FilePath $go -ArgumentList "run ./cmd/signaling" -WorkingDirectory (Join-Path $root "server")
npm run dev
