# Manual Windows Test

> Historical single-machine checklist. It describes the pre-0.10 approval/code UI and is not the current product flow. Use [the LAN two-PC runbook](lan-two-pc-runbook.md) for current same-account and one-time-code acceptance.

## Single-Machine Smoke Test

1. Start signaling: `cd server; & "C:\Program Files\Go\bin\go.exe" run ./cmd/signaling`.
2. Start desktop UI: `.\scripts\dev.ps1`.
3. Open one window as host and choose `远程协助` → `共享这台电脑`.
4. Click `选择主显示器` and choose the primary full monitor. Window/tab/secondary-display control is unsupported.
5. Confirm an 8-digit code appears and expires in 5 minutes.
6. Open another window as controller and choose `连接另一台电脑`.
7. Enter the code.
8. Confirm the host sees an obvious authorization prompt.
9. Click `确认并允许控制` and confirm in the native Windows prompt.
10. Confirm video appears on the controller.
11. Click `操作远程电脑` in the controller toolbar, then move/click/type. Confirm input is delivered only while host-authorized and locally enabled. Use a second machine to avoid a same-desktop input/capture feedback loop.
12. Press Escape/Tab or click `停止操作` to release input locally. Click `停止共享` on the host or `断开` on the controller and confirm video/input stop.
13. Check fit/100%/150% and fullscreen. Confirm resize/source-size changes suspend input and never change the remote display mode.
14. Check that leaving an active session asks for confirmation; cancel preserves it. Try 320px client width, 200% text, light/dark themes and keyboard-only navigation.

## LAN Dual-Machine Test

NOT VERIFIED. Requires two Windows 10/11 machines on the same LAN.

## Public Server Test

NOT VERIFIED. Requires a real domain, public server, firewall/security-group changes, and real TURN credentials.
