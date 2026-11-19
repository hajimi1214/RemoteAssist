use serde::Deserialize;
use std::collections::BTreeSet;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};
use thiserror::Error;

const MAX_EVENT_AGE_MS: u64 = 30_000;
const MAX_EVENTS_PER_SECOND: usize = 120;
const HOST_CONSENT_VALIDITY_MS: u64 = 30_000;
const INPUT_LEASE: Duration = Duration::from_secs(8);
const INITIAL_INPUT_LEASE: Duration = Duration::from_secs(30);
const AUTH_CREDENTIAL_TARGET: &str = "com.remoteassist.desktop.auth";

#[cfg(test)]
mod tests {
    use super::*;

    fn event(token: &str, ts: u64) -> InputEvent {
        InputEvent {
            event_type: InputType::KeyDown,
            session_token: token.to_string(),
            ts,
            payload: serde_json::json!({"key":"a", "code":"KeyA"}),
        }
    }

    #[test]
    fn expiry_revokes_input_without_a_network_notification() {
        let mut permission = PermissionAdapter {
            authorized: true,
            session_token: Some("session-token".into()),
            expires_at_ms: Some(2000),
            lease_deadline: Some(Instant::now() + INPUT_LEASE),
            ..Default::default()
        };
        assert!(
            validate_adapter_permission(&event("session-token", 1999), &mut permission, 1999)
                .is_ok()
        );
        assert!(matches!(
            validate_adapter_permission(&event("session-token", 2000), &mut permission, 2000),
            Err(InputError::NotAuthorized)
        ));
        assert!(!permission.authorized);
        assert!(permission.session_token.is_none());
    }

    #[test]
    fn only_currently_pressed_remote_inputs_are_tracked() {
        let mut permission = PermissionAdapter::default();
        let mut input = event("token", 1000);
        input.event_type = InputType::KeyDown;
        track_pressed(&input, &mut permission);
        track_pressed(&input, &mut permission);
        assert_eq!(permission.pressed_keys.len(), 1);
        input.event_type = InputType::KeyUp;
        track_pressed(&input, &mut permission);
        assert!(permission.pressed_keys.is_empty());
        input.event_type = InputType::MouseDown;
        input.payload = serde_json::json!({"button": 0, "x": 0.5, "y": 0.5});
        track_pressed(&input, &mut permission);
        assert!(permission.pressed_buttons.contains(&0));
        input.event_type = InputType::MouseUp;
        track_pressed(&input, &mut permission);
        assert!(permission.pressed_buttons.is_empty());
    }

    #[test]
    fn wheel_delta_preserves_both_directions() {
        assert_eq!(wheel_delta(120.0) as i32, -120);
        assert_eq!(wheel_delta(-120.0) as i32, 120);
        assert_eq!(wheel_delta(800.0) as i32, -120);
    }

    #[test]
    fn rejects_wrong_token_and_rate_excess() {
        let mut permission = PermissionAdapter {
            authorized: true,
            session_token: Some("session-token".into()),
            expires_at_ms: Some(10000),
            lease_deadline: Some(Instant::now() + INPUT_LEASE),
            ..Default::default()
        };
        assert!(matches!(
            validate_adapter_permission(&event("other-token", 1000), &mut permission, 1000),
            Err(InputError::InvalidSessionToken)
        ));
        for _ in 0..MAX_EVENTS_PER_SECOND {
            assert!(validate_adapter_permission(
                &event("session-token", 1000),
                &mut permission,
                1000
            )
            .is_ok());
        }
        assert!(matches!(
            validate_adapter_permission(&event("session-token", 1000), &mut permission, 1000),
            Err(InputError::RateLimited)
        ));
        let mut release = event("session-token", 1000);
        release.event_type = InputType::KeyUp;
        assert!(validate_adapter_permission(&release, &mut permission, 1000).is_ok());
    }

    #[test]
    fn missing_peer_heartbeat_revokes_even_before_session_expiry() {
        let mut permission = PermissionAdapter {
            authorized: true,
            session_token: Some("session-token".into()),
            expires_at_ms: Some(100_000),
            lease_deadline: Some(Instant::now() - Duration::from_secs(1)),
            ..Default::default()
        };
        assert!(matches!(
            validate_adapter_permission(&event("session-token", 1000), &mut permission, 1000),
            Err(InputError::NotAuthorized)
        ));
        assert!(!permission.authorized);
        assert!(permission.session_token.is_none());
        assert!(permission.lease_deadline.is_none());
    }
}

#[derive(Default)]
struct AppState {
    permission: Arc<Mutex<PermissionAdapter>>,
}

#[derive(Default)]
struct PermissionAdapter {
    authorized: bool,
    session_token: Option<String>,
    expires_at_ms: Option<u64>,
    lease_deadline: Option<Instant>,
    pending_host_consent_until_ms: Option<u64>,
    recent_events: Vec<u64>,
    pressed_keys: BTreeSet<u16>,
    pressed_buttons: BTreeSet<i64>,
}

trait InputAdapter {
    fn send(&self, event: &InputEvent) -> Result<(), InputError>;
    fn release(&self, key: Option<u16>, button: Option<i64>) -> Result<(), InputError>;
}

trait CaptureAdapter {
    fn stop_capture(&self);
}

trait SessionIndicator {
    fn set_status(&self, _status: &str);
}

trait DisplayInfoAdapter {
    fn normalize_point(&self, x: f64, y: f64) -> (i32, i32);
}

struct NoopCaptureAdapter;
struct NoopSessionIndicator;
struct PrimaryDisplayInfoAdapter;

impl CaptureAdapter for NoopCaptureAdapter {
    fn stop_capture(&self) {}
}

impl SessionIndicator for NoopSessionIndicator {
    fn set_status(&self, _status: &str) {}
}

impl DisplayInfoAdapter for PrimaryDisplayInfoAdapter {
    fn normalize_point(&self, x: f64, y: f64) -> (i32, i32) {
        let clamped_x = x.clamp(0.0, 1.0);
        let clamped_y = y.clamp(0.0, 1.0);
        ((clamped_x * 65_535.0) as i32, (clamped_y * 65_535.0) as i32)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum InputType {
    MouseMove,
    MouseDown,
    MouseUp,
    MouseWheel,
    KeyDown,
    KeyUp,
}

#[derive(Debug, Deserialize)]
struct InputEvent {
    #[serde(rename = "type")]
    event_type: InputType,
    #[serde(rename = "sessionToken")]
    session_token: String,
    ts: u64,
    payload: serde_json::Value,
}

#[derive(Debug, Error)]
enum InputError {
    #[error("input_not_authorized")]
    NotAuthorized,
    #[error("invalid_session_token")]
    InvalidSessionToken,
    #[error("invalid_timestamp")]
    InvalidTimestamp,
    #[error("input_rate_limited")]
    RateLimited,
    #[error("invalid_payload")]
    InvalidPayload,
    #[cfg_attr(windows, allow(dead_code))]
    #[error("platform_not_supported")]
    PlatformNotSupported,
    #[error("send_input_failed")]
    SendInputFailed,
}

impl serde::Serialize for InputError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[tauri::command]
fn request_input_authorization(state: State<'_, AppState>) -> Result<bool, InputError> {
    let accepted = confirm_host_control();
    let mut permission = state
        .permission
        .lock()
        .map_err(|_| InputError::NotAuthorized)?;
    permission.pending_host_consent_until_ms = if accepted {
        Some(now_ms().saturating_add(HOST_CONSENT_VALIDITY_MS))
    } else {
        None
    };
    Ok(accepted)
}

#[tauri::command]
fn set_input_authorized(
    session_token: String,
    expires_at_ms: u64,
    state: State<'_, AppState>,
) -> Result<(), InputError> {
    if session_token.len() < 16 || expires_at_ms <= now_ms() {
        return Err(InputError::InvalidSessionToken);
    }
    let mut permission = state
        .permission
        .lock()
        .map_err(|_| InputError::NotAuthorized)?;
    if !permission
        .pending_host_consent_until_ms
        .is_some_and(|expiry| now_ms() <= expiry)
    {
        return Err(InputError::NotAuthorized);
    }
    release_pressed(&mut permission)?;
    permission.pending_host_consent_until_ms = None;
    permission.authorized = true;
    permission.session_token = Some(session_token);
    permission.expires_at_ms = Some(expires_at_ms);
    permission.lease_deadline = Some(Instant::now() + INITIAL_INPUT_LEASE);
    permission.recent_events.clear();
    Ok(())
}

#[cfg(windows)]
fn confirm_host_control() -> bool {
    use windows::core::w;
    use windows::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, IDYES, MB_DEFBUTTON2, MB_ICONWARNING, MB_YESNO,
    };

    let result = unsafe {
        MessageBoxW(
            None,
            w!("Allow remote mouse and keyboard control? Confirm that you selected your PRIMARY full display. Window and secondary-display control are not supported in this build."),
            w!("RemoteAssist — Explicit approval required"),
            MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2,
        )
    };
    result == IDYES
}

#[cfg(not(windows))]
fn confirm_host_control() -> bool {
    false
}

#[tauri::command]
fn clear_input_authorization(state: State<'_, AppState>) -> Result<(), InputError> {
    let mut permission = state
        .permission
        .lock()
        .map_err(|_| InputError::NotAuthorized)?;
    revoke_permission(&mut permission)?;
    NoopCaptureAdapter.stop_capture();
    NoopSessionIndicator.set_status("disconnected");
    Ok(())
}

fn release_pressed(permission: &mut PermissionAdapter) -> Result<(), InputError> {
    let adapter = platform_input_adapter();
    let mut failed = false;
    for key in permission.pressed_keys.clone() {
        if adapter.release(Some(key), None).is_ok() {
            permission.pressed_keys.remove(&key);
        } else {
            failed = true;
        }
    }
    for button in permission.pressed_buttons.clone() {
        if adapter.release(None, Some(button)).is_ok() {
            permission.pressed_buttons.remove(&button);
        } else {
            failed = true;
        }
    }
    if failed {
        Err(InputError::SendInputFailed)
    } else {
        Ok(())
    }
}

fn revoke_permission(permission: &mut PermissionAdapter) -> Result<(), InputError> {
    permission.authorized = false;
    permission.session_token = None;
    permission.expires_at_ms = None;
    permission.lease_deadline = None;
    permission.pending_host_consent_until_ms = None;
    permission.recent_events.clear();
    release_pressed(permission)
}

#[tauri::command]
fn release_remote_inputs(
    session_token: String,
    state: State<'_, AppState>,
) -> Result<(), InputError> {
    let mut permission = state
        .permission
        .lock()
        .map_err(|_| InputError::NotAuthorized)?;
    if !permission.authorized || permission.session_token.as_deref() != Some(session_token.as_str())
    {
        return Err(InputError::NotAuthorized);
    }
    release_pressed(&mut permission)
}

fn permission_is_live(permission: &PermissionAdapter, now: u64) -> bool {
    permission.authorized
        && permission.expires_at_ms.is_some_and(|expiry| now < expiry)
        && permission
            .lease_deadline
            .is_some_and(|expiry| Instant::now() < expiry)
}

#[tauri::command]
fn renew_input_lease(session_token: String, state: State<'_, AppState>) -> Result<(), InputError> {
    let mut permission = state
        .permission
        .lock()
        .map_err(|_| InputError::NotAuthorized)?;
    if !permission_is_live(&permission, now_ms()) {
        let _ = revoke_permission(&mut permission);
        return Err(InputError::NotAuthorized);
    }
    if permission.session_token.as_deref() != Some(session_token.as_str()) {
        return Err(InputError::InvalidSessionToken);
    }
    permission.lease_deadline = Some(Instant::now() + INPUT_LEASE);
    Ok(())
}

#[tauri::command]
fn read_stored_auth() -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        use windows::core::w;
        use windows::Win32::Security::Credentials::{
            CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
        };

        let mut credential: *mut CREDENTIALW = std::ptr::null_mut();
        if unsafe {
            CredReadW(
                w!("com.remoteassist.desktop.auth"),
                CRED_TYPE_GENERIC,
                None,
                &mut credential,
            )
        }
        .is_err()
        {
            return Ok(None);
        }
        if credential.is_null() {
            return Ok(None);
        }
        let result = unsafe {
            let entry = &*credential;
            let bytes =
                std::slice::from_raw_parts(entry.CredentialBlob, entry.CredentialBlobSize as usize);
            String::from_utf8(bytes.to_vec())
                .map_err(|_| "stored_auth_invalid_encoding".to_string())
        };
        unsafe { CredFree(credential.cast()) };
        return result.map(Some);
    }
    #[cfg(not(windows))]
    Err("secure_credential_store_unavailable".to_string())
}

#[tauri::command]
fn write_stored_auth(auth_state: String) -> Result<(), String> {
    if auth_state.len() > 5_000 {
        return Err("stored_auth_too_large".to_string());
    }
    #[cfg(windows)]
    {
        use windows::core::PWSTR;
        use windows::Win32::Security::Credentials::{
            CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
        };

        let mut target: Vec<u16> = AUTH_CREDENTIAL_TARGET
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let mut username: Vec<u16> = "RemoteAssist".encode_utf16().chain(Some(0)).collect();
        let mut blob = auth_state.into_bytes();
        let credential = CREDENTIALW {
            Type: CRED_TYPE_GENERIC,
            TargetName: PWSTR(target.as_mut_ptr()),
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            UserName: PWSTR(username.as_mut_ptr()),
            ..Default::default()
        };
        let result = unsafe { CredWriteW(&credential, 0) }
            .map_err(|_| "credential_store_write_failed".to_string());
        blob.fill(0);
        return result;
    }
    #[cfg(not(windows))]
    Err("secure_credential_store_unavailable".to_string())
}

#[tauri::command]
fn delete_stored_auth() -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::core::w;
        use windows::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};
        let _ =
            unsafe { CredDeleteW(w!("com.remoteassist.desktop.auth"), CRED_TYPE_GENERIC, None) };
        Ok(())
    }
    #[cfg(not(windows))]
    Err("secure_credential_store_unavailable".to_string())
}

#[tauri::command]
fn send_input_event(event: InputEvent, state: State<'_, AppState>) -> Result<(), InputError> {
    let now = now_ms();
    let mut permission = state
        .permission
        .lock()
        .map_err(|_| InputError::NotAuthorized)?;
    validate_adapter_permission(&event, &mut permission, now)?;
    // Keep revocation and input delivery ordered under the same lock.
    platform_input_adapter().send(&event)?;
    track_pressed(&event, &mut permission);
    Ok(())
}

fn track_pressed(event: &InputEvent, permission: &mut PermissionAdapter) {
    match event.event_type {
        InputType::KeyDown | InputType::KeyUp => {
            if let Ok(key) = virtual_key_value(&event.payload) {
                if matches!(event.event_type, InputType::KeyDown) {
                    permission.pressed_keys.insert(key);
                } else {
                    permission.pressed_keys.remove(&key);
                }
            }
        }
        InputType::MouseDown | InputType::MouseUp => {
            if let Some(button @ 0..=2) = event.payload.get("button").and_then(|v| v.as_i64()) {
                if matches!(event.event_type, InputType::MouseDown) {
                    permission.pressed_buttons.insert(button);
                } else {
                    permission.pressed_buttons.remove(&button);
                }
            }
        }
        _ => {}
    }
}

fn validate_adapter_permission(
    event: &InputEvent,
    permission: &mut PermissionAdapter,
    now: u64,
) -> Result<(), InputError> {
    if !permission_is_live(permission, now) {
        let _ = revoke_permission(permission);
        return Err(InputError::NotAuthorized);
    }
    if event.ts.abs_diff(now) > MAX_EVENT_AGE_MS {
        return Err(InputError::InvalidTimestamp);
    }
    if !permission.authorized {
        return Err(InputError::NotAuthorized);
    }
    if permission.session_token.as_deref() != Some(event.session_token.as_str()) {
        return Err(InputError::InvalidSessionToken);
    }
    if matches!(event.event_type, InputType::KeyUp | InputType::MouseUp) {
        return Ok(());
    }
    permission
        .recent_events
        .retain(|seen| now.saturating_sub(*seen) < 1_000);
    if permission.recent_events.len() >= MAX_EVENTS_PER_SECOND {
        return Err(InputError::RateLimited);
    }
    permission.recent_events.push(now);
    Ok(())
}

fn platform_input_adapter() -> impl InputAdapter {
    WindowsInputAdapter {
        display: PrimaryDisplayInfoAdapter,
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis() as u64
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            let permission = Arc::downgrade(&app.state::<AppState>().permission);
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(500));
                let Some(permission) = permission.upgrade() else {
                    break;
                };
                if let Ok(mut permission) = permission.lock() {
                    if permission.authorized && !permission_is_live(&permission, now_ms()) {
                        let _ = revoke_permission(&mut permission);
                    } else if !permission.authorized {
                        let _ = release_pressed(&mut permission);
                    }
                };
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(
                event,
                tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
            ) {
                if let Ok(mut permission) = window.state::<AppState>().permission.lock() {
                    let _ = revoke_permission(&mut permission);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            request_input_authorization,
            set_input_authorized,
            clear_input_authorization,
            release_remote_inputs,
            renew_input_lease,
            read_stored_auth,
            write_stored_auth,
            delete_stored_auth,
            send_input_event
        ])
        .run(tauri::generate_context!())
        .expect("failed to run RemoteAssist");
}

struct WindowsInputAdapter {
    display: PrimaryDisplayInfoAdapter,
}

#[cfg(not(windows))]
impl InputAdapter for WindowsInputAdapter {
    fn send(&self, _event: &InputEvent) -> Result<(), InputError> {
        Err(InputError::PlatformNotSupported)
    }
    fn release(&self, _key: Option<u16>, _button: Option<i64>) -> Result<(), InputError> {
        Err(InputError::PlatformNotSupported)
    }
}

#[cfg(windows)]
impl InputAdapter for WindowsInputAdapter {
    fn send(&self, event: &InputEvent) -> Result<(), InputError> {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_KEYUP,
            MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_MOVE, MOUSEEVENTF_WHEEL, MOUSEINPUT,
        };

        let input = match event.event_type {
            InputType::MouseMove => {
                let (x, y) = mouse_xy(&self.display, &event.payload)?;
                INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx: x,
                            dy: y,
                            mouseData: 0,
                            dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                }
            }
            InputType::MouseDown | InputType::MouseUp => {
                let flag = mouse_button_flag(
                    &event.payload,
                    matches!(event.event_type, InputType::MouseDown),
                )?;
                INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx: mouse_xy(&self.display, &event.payload)?.0,
                            dy: mouse_xy(&self.display, &event.payload)?.1,
                            mouseData: 0,
                            dwFlags: flag | MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                }
            }
            InputType::MouseWheel => {
                let delta = event
                    .payload
                    .get("deltaY")
                    .and_then(|v| v.as_f64())
                    .ok_or(InputError::InvalidPayload)?;
                INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx: 0,
                            dy: 0,
                            mouseData: wheel_delta(delta),
                            dwFlags: MOUSEEVENTF_WHEEL,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                }
            }
            InputType::KeyDown | InputType::KeyUp => {
                let vk = windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(
                    virtual_key_value(&event.payload)?,
                );
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: vk,
                            wScan: 0,
                            dwFlags: if matches!(event.event_type, InputType::KeyUp) {
                                KEYEVENTF_KEYUP
                            } else {
                                Default::default()
                            },
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                }
            }
        };

        let sent = unsafe { SendInput(&[input], std::mem::size_of::<INPUT>() as i32) };
        if sent == 0 {
            return Err(InputError::SendInputFailed);
        }
        Ok(())
    }

    fn release(&self, key: Option<u16>, button: Option<i64>) -> Result<(), InputError> {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_KEYUP,
            MOUSEINPUT, VIRTUAL_KEY,
        };
        let input = if let Some(key) = key {
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(key),
                        dwFlags: KEYEVENTF_KEYUP,
                        ..Default::default()
                    },
                },
            }
        } else if let Some(button) = button {
            INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dwFlags: mouse_button_flag(&serde_json::json!({"button":button}), false)?,
                        ..Default::default()
                    },
                },
            }
        } else {
            return Err(InputError::InvalidPayload);
        };
        if unsafe { SendInput(&[input], std::mem::size_of::<INPUT>() as i32) } == 1 {
            Ok(())
        } else {
            Err(InputError::SendInputFailed)
        }
    }
}

fn wheel_delta(delta: f64) -> u32 {
    // Win32 carries a signed wheel delta in an unsigned DWORD.
    // A direct float-to-u32 cast saturates negative scroll to zero.
    (-delta).clamp(-120.0, 120.0) as i32 as u32
}

#[cfg(windows)]
fn mouse_xy(
    display: &PrimaryDisplayInfoAdapter,
    payload: &serde_json::Value,
) -> Result<(i32, i32), InputError> {
    let x = payload
        .get("x")
        .and_then(|v| v.as_f64())
        .ok_or(InputError::InvalidPayload)?;
    let y = payload
        .get("y")
        .and_then(|v| v.as_f64())
        .ok_or(InputError::InvalidPayload)?;
    Ok(display.normalize_point(x, y))
}

#[cfg(windows)]
fn mouse_button_flag(
    payload: &serde_json::Value,
    down: bool,
) -> Result<windows::Win32::UI::Input::KeyboardAndMouse::MOUSE_EVENT_FLAGS, InputError> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP,
        MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    };
    let button = payload
        .get("button")
        .and_then(|v| v.as_i64())
        .ok_or(InputError::InvalidPayload)?;
    Ok(match (button, down) {
        (0, true) => MOUSEEVENTF_LEFTDOWN,
        (0, false) => MOUSEEVENTF_LEFTUP,
        (1, true) => MOUSEEVENTF_MIDDLEDOWN,
        (1, false) => MOUSEEVENTF_MIDDLEUP,
        (2, true) => MOUSEEVENTF_RIGHTDOWN,
        (2, false) => MOUSEEVENTF_RIGHTUP,
        _ => return Err(InputError::InvalidPayload),
    })
}

fn virtual_key_value(payload: &serde_json::Value) -> Result<u16, InputError> {
    let key = payload
        .get("key")
        .and_then(|v| v.as_str())
        .ok_or(InputError::InvalidPayload)?;
    let vk = match key {
        "Backspace" => 0x08,
        "Tab" => 0x09,
        "Enter" => 0x0D,
        "Shift" => 0x10,
        "Control" => 0x11,
        "Alt" => 0x12,
        "Escape" => 0x1B,
        " " => 0x20,
        "ArrowLeft" => 0x25,
        "ArrowUp" => 0x26,
        "ArrowRight" => 0x27,
        "ArrowDown" => 0x28,
        "Delete" => 0x2E,
        value if value.len() == 1 => value.as_bytes()[0].to_ascii_uppercase() as u16,
        _ => return Err(InputError::InvalidPayload),
    };
    Ok(vk)
}
