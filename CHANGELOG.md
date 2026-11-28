# Changelog

This file records user-visible changes. Versions remain alpha unless a release record explicitly says otherwise.

## 0.15.1-alpha

- Added a five-section settings center with search, precise mouse-sensitivity entry, confirmed preference reset, and visible save outcomes.
- Preserved usable in-memory preferences when local persistence fails and reports that limitation in the UI.
- Host-side direct sessions now expose sender and capture diagnostics for comparing encoder, queue, and capture timing against controller-side receive/presentation measurements.
- Signaling no longer advertises a public STUN service by default. Server operators can explicitly configure their chosen STUN/STUNS endpoints through `STUN_URLS`.
- Physical Windows acceptance, Android device validation, public deployment, TURN relay behavior, and end-to-end latency remain unverified.

## 0.15-alpha

- Added opt-in relative mouse capture for game-camera input and a game-oriented video profile.
- Added bounded coalescing for relative movement and corrected partial desktop update ordering before video-frame requests.
- Added an Aliyun ECS/Coturn deployment guide and game-streaming research notes.
- This version streams video only. It does not implement system/game audio or physical HID/Raw Input integration.

## Older alpha history

Earlier version notes remain in [`README.md`](README.md), [`STATUS.md`](STATUS.md), and the versioned design/validation documents under [`docs/`](docs/).
