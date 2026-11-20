# Android phone and tablet controller — 0.9 build notes

These notes record the 0.9 milestone. Version 0.10 replaces repeated approval and codes with same-account device access; use [current workflow and artifacts](direct-desktop-0.10.md). Generated output paths may now contain the newer build.

The Android target is a visible controller APK for an existing Windows RemoteAssist host. The Windows user still starts sharing, chooses the primary display, and explicitly approves control. Installing the APK does not create a server or grant unattended access. The Android device receives a WebRTC video stream and sends authorized input through a DataChannel; it is not an Android screen-sharing host.

## Build on Windows

Use Node 24, the existing Rust toolchain, a working JDK 17 or newer, Android SDK platform 36 and build tools, NDK 27.2.12479018, and the `aarch64-linux-android` Rust target. The default target is ARM64, used by most current Android phones and tablets. Other architectures require their matching Rust target and `-Target` argument. The generated Android project is checked in with compile/target SDK 36: this stable platform is available from Google, whereas the current CLI template requested platform 37 during setup. The local project now includes the generated Tauri Android shell; its local SDK/NDK toolchains and machine-specific Gradle state remain ignored.

```powershell
rustup target add aarch64-linux-android
.\scripts\package-android.ps1
```

The script uses `ANDROID_HOME` and `NDK_HOME` when supplied; otherwise it uses the project's ignored `.local/android-sdk` and its NDK 27.2.12479018. `JAVA_HOME` must point at the JDK. Gradle downloads stay under `.local/gradle`. Environment changes and the caller's working directory are restored after the command finishes. The SDK, generated machine-specific paths, keys, and APKs are not source files.

The ARM64 debug build produces a ~29 MB development-signed APK at `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`. Native debug symbols are stripped from the distributable APK while the local Rust build output remains intact. `apksigner verify --verbose` passed with the v2 scheme and one signer. SHA256: `5FB69FC597092DDBB50CA54771CD4701B01EF7B3D95657C448B89759066DEF68`. Re-running `scripts/package-android.ps1 -Target aarch64 -MavenMirror https://repo.huaweicloud.com/repository/maven` completed successfully with the local HTTPS proxy configured for the process. The documented script builds frontend assets before packaging, so rerun it after later UI changes to refresh the APK. By default it produces a development-signed debug APK suitable for local installation testing. `-Release` selects a release build and requires a separately configured release signing key for distribution; it is not a promise of an installable signed release artifact. No signing secret is embedded in the script or configuration.

The Android configuration builds frontend assets into `dist-android`, independently of the Windows `dist` directory. It selects the mobile controller UI using `VITE_MOBILE_WEB=true`. There is no sample-domain fallback. Without `-SignalingUrl`, configure the actual HTTPS server address in the app. A known deployment can be supplied at build time using the optional `-SignalingUrl` parameter; only an HTTPS origin without credentials, path, query, or fragment is accepted.

On Windows without symbolic-link permission, the Tauri CLI can finish Rust compilation but fail while linking the resulting `.so` into the Android project. The script recognizes only that specific failure, copies the freshly built library, and invokes Gradle while skipping the already completed Rust task. It does not enable Developer Mode, elevate privileges, or change system security policy. Other compiler failures remain fatal. Gradle's distribution checksum is pinned to the official release checksum.

The generated Gradle project disables Kotlin's incremental cache and compiles Kotlin in-process. This avoids the observed cross-drive cache error when Tauri's Cargo registry sources are on `C:` and the project is on `E:`. No dependency sources are patched. On Windows without symbolic-link privileges, the packaging script copies the just-built ARM64 library into the generated JNI folder and lets Gradle package it after the Tauri Rust compilation step; it does not change Windows security settings.

If this network cannot reach Maven Central, `-MavenMirror https://maven-central.storage-download.googleapis.com/maven2` enables Google's HTTPS mirror for this process. The generated build still uses Google's Android repository and the default Maven Central repository. The script translates an existing credential-free HTTP proxy from `HTTPS_PROXY`/`ALL_PROXY` into temporary Gradle options because Java does not automatically use those environment variables. No proxy, repository, or credential is written to global Gradle settings.

## Service and connection

Use your deployed signaling service with a valid HTTPS certificate and WSS support, account registration/login, and authenticated TURN configuration. The local memory administrator fixture is a desktop development feature and is not provisioned into a cloud database. Keep the server and Windows client updated alongside the Android client when input protocol features change.

The Android APK contains its frontend assets, so Caddy does not need to serve a separate mobile website. Its Android window explicitly enables `useHttpsScheme`, giving bundled pages the `https://tauri.localhost` origin. The server's exact-origin allowlist must include that value; it is already in the deployment defaults. Do not replace the allowlist with a wildcard. HTTPS/WSS also applies to the remote server; the WebView's local application origin is not a public service.

The ordinary browser/PWA route is technically possible because WebRTC supports media reception and DataChannels in modern browsers. It is not the selected deliverable here: there is no new PWA installation flow, service worker, or offline session cache. An APK is not a network tunnel; the phone and PC still need a reachable signaling service and a usable direct or TURN media path.

## Device limits

- Android System WebView, supported codecs, CPU load, and vendor power-saving behavior affect decoding and latency. Android API 24 is the packaging minimum, not a claim that every Android 7 WebView supports the current CSS and Web APIs. Android 10 or newer with an up-to-date System WebView and Chrome is the practical testing recommendation; real-device compatibility is still unverified.
- Switching apps, locking the phone, or losing the network can suspend WebView timers and transport. Existing control is stopped on disconnect; control is never automatically restored after reconnecting.
- Mobile browsers/WebViews differ in screen-capture support. This target controls a Windows host and does not depend on Android `getDisplayMedia` or attempt to implement phone screen sharing.
- Phone keyboard input methods and tablet keyboards differ. End-to-end Chinese text, selection/composition, pointer gestures, scrolling, orientation changes, and accessibility require real-device testing.
- Network RTT and WebRTC packet timing are not input-to-photon latency or a physical Wi-Fi/cellular signal-strength improvement.

## Official references consulted

Accessed 2026-11-20:

- [Tauri Android prerequisites](https://v2.tauri.app/start/prerequisites/#android): JDK, SDK platforms/build tools, NDK, and Rust targets.
- [Tauri mobile development](https://v2.tauri.app/develop/#developing-your-mobile-application): Android initialization and the mobile build/development workflow.
- [Tauri Android configuration](https://v2.tauri.app/reference/config/#androidconfig): minimum SDK and Android version code configuration.
- [Tauri Google Play distribution](https://v2.tauri.app/distribute/google-play/): release distribution is distinct from a development APK.
- [MDN WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) and [RTCDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel): media and bidirectional data transport, with browser interoperability limits.
- [MDN secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts) and [PWA installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable): a public browser installation requires HTTPS; phone access to a PC's plain HTTP LAN address is not the localhost exception.

## Verification status

- PASS: installed the official command-line Android SDK tools into ignored `.local/android-sdk`, accepted the Android SDK license for this project installation, and installed API 36, build-tools, NDK 27.2.12479018 and the ARM64 Rust target. The command-line-tools archive checksum matched Google's repository metadata.
- PASS: `scripts/package-android.ps1 -Target aarch64 -MavenMirror https://repo.huaweicloud.com/repository/maven` reproducibly built the universal ARM64 debug APK. A Windows symlink limitation was handled by copying the newly compiled native library and stripping only its native debug symbols before Gradle packaging; the host operating-system policy was left unchanged. The final APK is about 29 MB and verifies with one v2 development signer.
- PASS: the APK includes version `0.9.0-alpha`, ARM64 native library and the generated mobile frontend bundle. Its SHA256 is `5FB69FC597092DDBB50CA54771CD4701B01EF7B3D95657C448B89759066DEF68`. The local APK is at `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`.
- PASS: APK metadata reports package `com.remoteassist.desktop`, version `0.9.0-alpha`, minimum SDK 24, target SDK 36, and only the application INTERNET permission plus Android's generated non-exported receiver permission. Cleartext traffic is disabled and the bundled Tauri origin uses HTTPS.
- PASS: 54 frontend tests, TypeScript/Vite build, six Windows native tests, Go tests/vet and `git diff --check`. A local synthetic WebRTC loopback exercised controller DataChannel mouse up/down, scrolling, Unicode text, paired Enter input and stop behavior; it did not send input to Windows. Phone/tablet portrait/landscape browser layouts have no horizontal overflow.
- NOT VERIFIED: no Android device or emulator is attached to ADB. Physical installation, Android System WebView decoding, real IME composition, true two-machine Windows input, background/lock-screen interruption, public TURN, production release-key signing, and final touch-to-photon latency have not been verified. The APK has not been installed on a phone.
