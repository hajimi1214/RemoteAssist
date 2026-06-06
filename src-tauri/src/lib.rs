use serde::Deserialize;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;
use thiserror::Error;

const MAX_EVENT_AGE_MS: u64 = 30_000;
const MAX_EVENTS_PER_SECOND: usize = 120;

#[derive(Default)]
struct AppState {
    permission: Mutex<PermissionAdapter>,
}

#[derive(Default)]
struct PermissionAdapter {
    authorized: bool,
    session_token: Option<String>,
    recent_events: Vec<u64>,
}

trait InputAdapter {
    fn send(&self, event: &InputEvent) -> Result<(), InputError>;
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
fn set_input_authorized(session_token: String, state: State<'_, AppState>) -> Result<(), InputError> {
    if session_token.len() < 16 {
        return Err(InputError::InvalidSessionToken);
    }
    let mut permission = state.permission.lock().map_err(|_| InputError::NotAuthorized)?;
    permission.authorized = true;
    permission.session_token = Some(session_token);
    permission.recent_events.clear();
    Ok(())
}

#[tauri::command]
fn clear_input_authorization(state: State<'_, AppState>) -> Result<(), InputError> {
    let mut permission = state.permission.lock().map_err(|_| InputError::NotAuthorized)?;
    permission.authorized = false;
    permission.session_token = None;
    permission.recent_events.clear();
    NoopCaptureAdapter.stop_capture();
    NoopSessionIndicator.set_status("disconnected");
    Ok(())
}

#[tauri::command]
fn send_input_event(event: InputEvent, state: State<'_, AppState>) -> Result<(), InputError> {
    validate_permission(&event, &state)?;
    platform_input_adapter().send(&event)
}

fn validate_permission(event: &InputEvent, state: &State<'_, AppState>) -> Result<(), InputError> {
    let now = now_ms();
    if event.ts.abs_diff(now) > MAX_EVENT_AGE_MS {
        return Err(InputError::InvalidTimestamp);
    }
    let mut permission = state.permission.lock().map_err(|_| InputError::NotAuthorized)?;
    if !permission.authorized {
        return Err(InputError::NotAuthorized);
    }
    if permission.session_token.as_deref() != Some(event.session_token.as_str()) {
        return Err(InputError::InvalidSessionToken);
    }
    permission.recent_events.retain(|seen| now.saturating_sub(*seen) < 1_000);
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
        .invoke_handler(tauri::generate_handler![
            set_input_authorized,
            clear_input_authorization,
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
                let flag = mouse_button_flag(&event.payload, matches!(event.event_type, InputType::MouseDown))?;
                INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx: 0,
                            dy: 0,
                            mouseData: 0,
                            dwFlags: flag,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                }
            }
            InputType::MouseWheel => {
                let delta = event.payload.get("deltaY").and_then(|v| v.as_f64()).ok_or(InputError::InvalidPayload)?;
                INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx: 0,
                            dy: 0,
                            mouseData: (-delta).clamp(-120.0, 120.0) as u32,
                            dwFlags: MOUSEEVENTF_WHEEL,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                }
            }
            InputType::KeyDown | InputType::KeyUp => {
                let vk = key_to_virtual_key(&event.payload)?;
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: vk,
                            wScan: 0,
                            dwFlags: if matches!(event.event_type, InputType::KeyUp) { KEYEVENTF_KEYUP } else { Default::default() },
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
}

#[cfg(windows)]
fn mouse_xy(display: &PrimaryDisplayInfoAdapter, payload: &serde_json::Value) -> Result<(i32, i32), InputError> {
    let x = payload.get("x").and_then(|v| v.as_f64()).ok_or(InputError::InvalidPayload)?;
    let y = payload.get("y").and_then(|v| v.as_f64()).ok_or(InputError::InvalidPayload)?;
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
    let button = payload.get("button").and_then(|v| v.as_i64()).ok_or(InputError::InvalidPayload)?;
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

#[cfg(windows)]
fn key_to_virtual_key(payload: &serde_json::Value) -> Result<windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY, InputError> {
    use windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY;
    let key = payload.get("key").and_then(|v| v.as_str()).ok_or(InputError::InvalidPayload)?;
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
    Ok(VIRTUAL_KEY(vk))
}
