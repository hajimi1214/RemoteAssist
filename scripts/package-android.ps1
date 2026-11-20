[CmdletBinding()]
param(
  [string]$SignalingUrl = "",
  [ValidateSet("aarch64", "armv7", "x86_64", "i686")]
  [string]$Target = "aarch64",
  [string]$MavenMirror = "",
  [switch]$Release
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$projectRoot = Split-Path -Parent $PSScriptRoot
$names = @("ANDROID_HOME", "ANDROID_SDK_ROOT", "NDK_HOME", "VITE_SIGNALING_URL", "VITE_MOBILE_WEB", "GRADLE_USER_HOME", "GRADLE_OPTS", "REMOTEASSIST_MAVEN_MIRROR")
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }
$pushed = $false

try {
  if ($MavenMirror) {
    $mirrorUri = $null
    if (![Uri]::TryCreate($MavenMirror, [UriKind]::Absolute, [ref]$mirrorUri) -or $mirrorUri.Scheme -ne "https" -or $mirrorUri.UserInfo -or $mirrorUri.Query -or $mirrorUri.Fragment) {
      throw "MavenMirror must be an HTTPS repository URL without credentials, a query, or a fragment."
    }
    $env:REMOTEASSIST_MAVEN_MIRROR = $MavenMirror
  }
  $proxy = if ($env:HTTPS_PROXY) { $env:HTTPS_PROXY } elseif ($env:ALL_PROXY) { $env:ALL_PROXY } else { "" }
  if ($proxy) {
    $proxyUri = $null
    if ([Uri]::TryCreate($proxy, [UriKind]::Absolute, [ref]$proxyUri) -and $proxyUri.Scheme -eq "http" -and !$proxyUri.UserInfo) {
      $env:GRADLE_OPTS = "$env:GRADLE_OPTS -Dhttps.proxyHost=$($proxyUri.Host) -Dhttps.proxyPort=$($proxyUri.Port) -Dhttp.proxyHost=$($proxyUri.Host) -Dhttp.proxyPort=$($proxyUri.Port) -Dhttp.nonProxyHosts=localhost"
    }
  }
  if ($SignalingUrl) {
    $serviceUri = $null
    if (![Uri]::TryCreate($SignalingUrl, [UriKind]::Absolute, [ref]$serviceUri) -or
        $serviceUri.Scheme -ne "https" -or $serviceUri.UserInfo -or $serviceUri.Query -or $serviceUri.Fragment -or
        $serviceUri.AbsolutePath -ne "/" -or $serviceUri.Host -match '(^|\.)example\.(com|org|net)$') {
      throw "SignalingUrl must be your actual HTTPS server origin, without credentials, a path, query, or fragment."
    }
    $env:VITE_SIGNALING_URL = $serviceUri.GetLeftPart([UriPartial]::Authority)
  } else {
    # The Android app's service-address screen supplies the endpoint at runtime.
    [Environment]::SetEnvironmentVariable("VITE_SIGNALING_URL", $null, "Process")
  }
  $env:VITE_MOBILE_WEB = "true"
  $sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $projectRoot ".local\android-sdk" }
  if (!(Test-Path -LiteralPath $sdkRoot -PathType Container)) { throw "Android SDK missing. Set ANDROID_HOME or install it under .local/android-sdk." }
  $env:ANDROID_HOME = $sdkRoot
  $env:ANDROID_SDK_ROOT = $sdkRoot
  if (!$env:NDK_HOME) {
    $ndkRoot = Join-Path $sdkRoot "ndk\27.2.12479018"
    if (!(Test-Path -LiteralPath $ndkRoot -PathType Container)) { throw "Android NDK missing. Set NDK_HOME or install NDK 27.2.12479018 in the SDK." }
    $env:NDK_HOME = $ndkRoot
  }
  if (!$env:JAVA_HOME -or !(Test-Path -LiteralPath (Join-Path $env:JAVA_HOME "bin\java.exe"))) { throw "JAVA_HOME must point to a working JDK (17 or newer)." }
  $env:GRADLE_USER_HOME = Join-Path $projectRoot ".local\gradle"
  $npm = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop).Source
  Push-Location -LiteralPath $projectRoot
  $pushed = $true
  if (!(Test-Path -LiteralPath "src-tauri\gen\android\gradlew.bat")) {
    & $npm run tauri -- android init --ci --skip-targets-install
    if ($LASTEXITCODE -ne 0) { throw "Android project initialization failed (exit $LASTEXITCODE)." }
  }
  $buildArguments = @("run", "tauri", "--", "android", "build", "--apk", "--target", $Target, "--ci")
  if (!$Release) { $buildArguments += "--debug" }
  $logDirectory = Join-Path $projectRoot ".local"
  New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
  $buildLog = Join-Path $logDirectory "android-build.log"
  & $npm @buildArguments 2>&1 | Tee-Object -FilePath $buildLog
  $tauriExitCode = $LASTEXITCODE
  $variant = if ($Release) { "release" } else { "debug" }
  if ($tauriExitCode -ne 0) {
    $log = Get-Content -LiteralPath $buildLog -Raw
    if ($log -notmatch 'Failed to create a symbolic link' -or $log -notmatch 'Creation symbolic link is not allowed' -or $log -notmatch 'Finished') {
      throw "Android APK build failed (exit $tauriExitCode). See .local/android-build.log."
    }
    # Tauri completed Rust compilation, but Windows denied its subsequent symlink.
    # Copy that library and package it without changing Windows security policy.
    $architectures = @{
      aarch64 = @{ Rust = "aarch64-linux-android"; Abi = "arm64-v8a"; Gradle = "arm64" }
      armv7 = @{ Rust = "armv7-linux-androideabi"; Abi = "armeabi-v7a"; Gradle = "arm" }
      x86_64 = @{ Rust = "x86_64-linux-android"; Abi = "x86_64"; Gradle = "x86_64" }
      i686 = @{ Rust = "i686-linux-android"; Abi = "x86"; Gradle = "x86" }
    }
    $architecture = $architectures[$Target]
    $library = Join-Path $projectRoot "src-tauri\target\$($architecture.Rust)\$variant\libremoteassist_lib.so"
    if (!(Test-Path -LiteralPath $library -PathType Leaf)) { throw "Compiled Android library was not found after the symlink failure." }
    $jniDirectory = Join-Path $projectRoot "src-tauri\gen\android\app\src\main\jniLibs\$($architecture.Abi)"
    New-Item -ItemType Directory -Force -Path $jniDirectory | Out-Null
    $packagedLibrary = Join-Path $jniDirectory "libremoteassist_lib.so"
    Copy-Item -LiteralPath $library -Destination $packagedLibrary -Force
    $llvmStrip = Join-Path $env:NDK_HOME "toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-strip.exe"
    if (Test-Path -LiteralPath $llvmStrip -PathType Leaf) {
      & $llvmStrip --strip-debug $packagedLibrary
      if ($LASTEXITCODE -ne 0) { throw "Unable to strip native debug symbols from the distributable APK library." }
    }
    $variantTitle = (Get-Culture).TextInfo.ToTitleCase($variant)
    $architectureTitle = (Get-Culture).TextInfo.ToTitleCase($architecture.Gradle)
    $androidProject = Join-Path $projectRoot "src-tauri\gen\android"
    Write-Host "Windows symlinks unavailable; packaging the freshly compiled library by file copy."
    & (Join-Path $androidProject "gradlew.bat") -p $androidProject --no-daemon "-PabiList=$($architecture.Abi)" "-ParchList=$($architecture.Gradle)" "-PtargetList=$Target" ":app:assembleUniversal$variantTitle" -x ":app:rustBuild$architectureTitle$variantTitle"
    if ($LASTEXITCODE -ne 0) { throw "Android Gradle packaging failed (exit $LASTEXITCODE)." }
  }
  $apks = @(Get-ChildItem -LiteralPath "src-tauri\gen\android\app\build\outputs\apk\universal\$variant" -Filter *.apk -File)
  if (!$apks.Count) { throw "Android build finished without an expected APK." }
  $buildTools = Get-ChildItem -LiteralPath (Join-Path $sdkRoot "build-tools") -Directory | Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } | Sort-Object { [Version]$_.Name } -Descending | Select-Object -First 1
  if (!$buildTools) { throw "Android build tools are required to verify the APK signature." }
  $apkSigner = Join-Path $buildTools.FullName "apksigner.bat"
  foreach ($apk in $apks) {
    & $apkSigner verify --verbose $apk.FullName
    if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed. Configure release signing before distributing a release build." }
    Write-Host "Android APK: $($apk.FullName)"
    Write-Host "SHA256: $((Get-FileHash -LiteralPath $apk.FullName -Algorithm SHA256).Hash)"
  }
  if (!$Release) { Write-Host "This is a development-signed test APK. Production distribution needs your release signing configuration." }
} finally {
  if ($pushed) { Pop-Location }
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process") }
}
