# Manual Windows Test

## Single-Machine Smoke Test

1. Start signaling: `cd server; & "C:\Program Files\Go\bin\go.exe" run ./cmd/signaling`.
2. Start desktop UI: `.\scripts\dev.ps1`.
3. Open one window as host and click `Share This Computer`.
4. Click `Start Sharing` and choose a screen or window.
5. Confirm an 8-digit code appears and expires in 5 minutes.
6. Open another window as controller and click `Control Another Computer`.
7. Enter the code.
8. Confirm the host sees an obvious authorization prompt.
9. Click `Allow Control`.
10. Confirm video appears on the controller.
11. Move/click/type in the remote view and confirm input reaches the host only while authorized.
12. Click `Disconnect Now` on host and confirm video/input stop.

## LAN Dual-Machine Test

NOT VERIFIED. Requires two Windows 10/11 machines on the same LAN.

## Public Server Test

NOT VERIFIED. Requires a real domain, public server, firewall/security-group changes, and real TURN credentials.
