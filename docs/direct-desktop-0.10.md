# 0.10 device access and fullscreen desktop

The user's 2026-11-20 instruction replaces per-session host approval with same-account device access. Another device logged in to the same account can enter an online Windows host running the visible client. The UI no longer asks for a connection code, a display picker or another confirmation. Stop/pause, logout and close revoke input and capture. No service installation, autostart, hidden operation, UAC bypass, remote shell or arbitrary execution is added.

## Authorization and capture

See [direct-device-protocol.md](direct-device-protocol.md). The controller requests one of its own online devices; the host authenticates its capability WebSocket, and the native layer independently posts the exact account/device/session request to the service. Ownership, device validity, session state and expiry are checked before input/frame delivery. Revoking devices or disabling an account ends active sessions. Old async cleanup is scoped by request ID; initialization and frame pulling are single-flight with bounded queues. Native expiry/lease checks stop capture and input independently of the UI.

Desktop Duplication selects the primary output and matching adapter. DuplicateOutput1 explicitly requests BGRA8 where available, with the legacy DXGI path retained. Row pitch is respected, IPC responses are binary, and WebGL texSubImage2D reuses a texture while correcting BGRA channels and alpha. Canvas frames are requested only on updates; pointer-only changes use small metadata updates. Frames are not persisted or logged.

This is not a zero-copy native hardware encoder. Raw-frame IPC and browser encoding can limit throughput. Rotated/HDR/unusual outputs and lock-screen/display-mode changes remain limited; unsupported capture ends the session. The displayed cursor is a simple arrow rather than every native Windows cursor shape.

## Device and viewer UX

The device page follows the reference's sidebar, online title, desktop-entry card and compact action layout. Idle artwork is an illustration, not an uploaded live desktop preview; inactive computers are not continuously captured for thumbnails. Unimplemented file transfer, terminal and port forwarding actions are not presented.

The UU-inspired refinement includes collapsible devices, all/favorite groups, account-scoped local favorites and a keyboard-operable device menu. Remote control and watching are real entry modes. The card's bottom action strip has a fixed minimum height and does not shrink under the preview; browser hit testing confirms all three actions remain visible/clickable. The desktop guest screen also keeps its connection and service-settings entries in the available height.

Control sessions open across the complete viewport with input enabled when video is usable. Viewing mode can open fullscreen without injecting input. Floating tools collapse over the video; exit and disconnect remain reachable. Complete view preserves the entire desktop and may have side bars if aspect ratios differ. Fill keeps aspect ratio and crops excess without distortion. Resize/source changes release held input without silently disabling control; backgrounding releases input, while manual pause persists.

Android uses AndroidX WindowInsetsController to hide system bars with transient edge-swipe access. The activity and keyboard-resize configuration compile successfully but must be verified on the actual device. The older 0.9 build was physically tested; it is not proof of the new 0.10 behavior.

## Quality and input

[media-0.10.md](media-0.10.md) records the official sources and thresholds. Sharp targets the actual source up to 3840×2160/60fps with a 16–40Mbps ceiling; smaller screens are not artificially upscaled. Congestion still lowers load gradually. Actual frames/second, bitrate, RTT, loss and drops are distinct from the configured target. RTT does not measure full touch-to-photon delay.

Mouse delivery targets 90Hz and expires stale queued motion; reliable clicks/keys/releases retain their ordering protections. Input errors return only category/count metadata. Native authorization or delivery failures end the session instead of silently dropping all input. No keyboard content, coordinates or tokens are logged.

## Evidence and limits

- Full frontend and backend/native regression checks pass; exact final counts and build receipts are in the local validation log.
- Actual primary capture: final 2560×1600 BGRA8, 3 frames / 49,152,048 bytes, initialization plus capture 395ms. An earlier format failure was investigated and the final explicit-BGRA path passed. This is a smoke test, not a 60fps benchmark.
- Browser integration uses the real direct HTTP/WebSocket protocol, two same-account devices and a generated 2560×1600 video source. Entry/fullscreen/input work without codes/confirmations; right-click, text and Enter pairs reach an in-memory receiver. The synthetic source measured about 30fps and must not be represented as native 4K60.
- Viewports: 1280×720, 1024×768, 820×393, 393×820 and 320×640. Device layouts have no horizontal overflow in the tested sizes; fullscreen exactly equals the viewport. Hit testing reproduced and fixed an old sticky toolbar covering keyboard/right-click buttons.
- Real 0.10 tablet-to-Windows behavior, sustained 4K60, hardware codecs, power policy, vendor IME, weak networks and end-to-end latency are NOT VERIFIED. ADB currently has no attached device.

## Dependencies and deployment

No frontend dependency was added. Existing Windows bindings gained DXGI/D3D11/GDI modules. reqwest 0.13.5 verifies the native account/session request over HTTPS; chrono 0.4.45 parses RFC3339 expiry. Both use MIT OR Apache-2.0 licenses. The certificate helper uses already available cryptography (Apache-2.0 OR BSD-3-Clause), with no package installation.

Upgrade the service, Windows host and Android controller together. Old 0.9 hosts are shown as needing upgrade; browser-only controllers identify as Web Controller rather than advertising a native host. Packaged clients support runtime HTTPS service configuration. Both endpoints must use the same service. LAN test trust is exact-IP and debug-only, short-lived and excluded from release builds; see [lan-test.md](lan-test.md).

## Final build receipt

Verified 2026-11-20: 60 frontend regressions, production build, Go tests/vet and Rust check/8 normal tests pass; the ignored real-capture smoke was explicitly run and passed. APK v2 development signature verifies. The Windows installer was generated but not installed on another PC.

- RemoteAssist-Android-arm64-0.10.0-alpha.apk — 29224404 bytes, SHA256 `a7999b77dc64d875b14797ea3d15080864fcf425f503eff2ad30236e6468d130`.
- RemoteAssist-Windows-x64-0.10.0-alpha.exe — 10512896 bytes, SHA256 `180474bc5441de2f743d47d39c4e493b60bc6b5fd2ec47e1172bcdb733c668a0`.
- RemoteAssist-Windows-setup-0.10.0-alpha.exe — 2401004 bytes, SHA256 `e659ecfe2faf79758db86e1a20881421fdecbee31f4a2b1c35a7db75ab36df2a`.
