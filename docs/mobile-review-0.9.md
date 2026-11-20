# Mobile controller review — 2026-11-20

The mobile target is a controller for an existing Windows host. It does not capture the Android screen or grant control without the Windows host's explicit approval.

Validated behaviors:

- Touch taps emit a click on release; movement does not synthesize a click. Drag mode emits a held left button and release. A second finger switches to bounded wheel events and sends release-all first. Lifting one finger does not turn the other into a click; cancellation and app backgrounding release held input.
- Touch controls provide right click, wheel buttons, drag mode, common navigation keys and an explicit stop action. The keyboard panel edits text locally before sending a bounded Unicode `text_input` event. NUL/control data, malformed UTF-16 and oversized payloads are rejected by both TypeScript and Windows native validation.
- The remote video keeps `object-fit: contain` pointer mapping, pauses input on source-size/orientation changes, supports native fullscreen where WebView allows it, and falls back to an in-app fixed fullscreen surface when it does not. Safe-area insets, portrait bottom navigation, landscape toolbars and `adjustResize` are configured.
- Android uses a runtime HTTPS service address. Credentials are held in memory only; the Windows credential store is not used on Android. The address accepts an origin only and rejects HTTP, credentials, paths, query strings and fragments.
- Android controller mode hides host sharing controls and uses a separate mobile home with a connection entry and service settings. Unauthenticated device/history pages show login prompts instead of empty panels.

Validation:

- `npm test`: 54 passing. `npm run build`: PASS.
- Windows native Rust tests: 6 passing, including bounded Unicode text and authorization checks.
- Browser WebRTC loopback: video decoded; right click, wheel, Enter key pair and Unicode Chinese/emoji text events reached the in-memory receiver through the DataChannel. Stopping operation disabled controls and cleared the draft. App fullscreen fallback expanded to the full viewport when native fullscreen was unavailable.
- Mobile layouts checked at 393x820, 820x393 and 1024x768 in the browser. No horizontal overflow was observed; runtime HTTPS validation rejected an HTTP test address.

Not verified:

- A physical Android phone/tablet, vendor WebView codec behavior, real keyboard IME composition, background process eviction, battery policy and touch latency.
- Two-machine mobile-to-Windows weak-network performance or production TURN behavior.
- ARM64 debug APK generation and v2 signature verification pass. The 29 MB development-signed APK is at `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`. ADB found no attached Android device, so it was not installed on a physical phone.

The Android input protocol requires the updated Windows client because text support is advertised through the input-channel keepalive response. Old Windows clients remain safe but report text input unavailable.
