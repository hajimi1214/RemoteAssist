use serde::Deserialize;
use std::collections::BTreeSet;
#[cfg(windows)]
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};
use thiserror::Error;
#[cfg(windows)]
mod desktop_capture;

#[cfg(all(feature = "lan-test", not(debug_assertions)))]
compile_error!("the lan-test feature must only be used in a debug build");

const MAX_EVENT_AGE_MS: u64 = 30_000;
const MAX_EVENTS_PER_SECOND: usize = 120;
const INPUT_LEASE: Duration = Duration::from_secs(8);
const INITIAL_INPUT_LEASE: Duration = Duration::from_secs(30);
const AUTH_CREDENTIAL_TARGET: &str = "com.remoteassist.desktop.auth";

#[cfg(windows)]
fn is_private_lan_ipv4(host: Option<&str>) -> bool {
    let Some(host) = host else { return false };
    let Ok(address) = host.parse::<std::net::Ipv4Addr>() else {
        return false;
    };
    let octets = address.octets();
    octets[0] == 10
        || (octets[0] == 172 && (16..=31).contains(&octets[1]))
        || (octets[0] == 192 && octets[1] == 168)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn lan_test_http_host_is_limited_to_private_ipv4() {
        assert!(is_private_lan_ipv4(Some("192.168.0.100")));
        assert!(is_private_lan_ipv4(Some("10.0.0.1")));
        assert!(is_private_lan_ipv4(Some("172.31.255.254")));
        assert!(!is_private_lan_ipv4(Some("127.0.0.1")));
        assert!(!is_private_lan_ipv4(Some("172.32.0.1")));
        assert!(!is_private_lan_ipv4(Some("192.169.0.1")));
        assert!(!is_private_lan_ipv4(Some("remote.example")));
        assert!(!is_private_lan_ipv4(None));
    }

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
    fn relative_game_mouse_delta_is_bounded_and_button_edges_keep_legacy_payload_shape() {
        assert_eq!(
            relative_mouse_delta(&serde_json::json!({"dx":-180,"dy":72})).unwrap(),
            (-180, 72)
        );
        for payload in [
            serde_json::json!({"dx":1025,"dy":0}),
            serde_json::json!({"dx":1.5,"dy":0}),
            serde_json::json!({"dx":0}),
        ] {
            assert!(matches!(
                relative_mouse_delta(&payload),
                Err(InputError::InvalidPayload)
            ));
        }
        let mut down = event("session", 1000);
        down.event_type = InputType::MouseDown;
        down.payload = serde_json::json!({"button":0,"relative":true});
        let mut permission = PermissionAdapter {
            authorized: true,
            session_token: Some("session".into()),
            expires_at_ms: Some(2000),
            lease_deadline: Some(Instant::now() + INPUT_LEASE),
            ..Default::default()
        };
        assert!(validate_adapter_permission(&down, &mut permission, 1000).is_ok());
        track_pressed(&down, &mut permission);
        assert!(permission.pressed_buttons.contains(&0));
    }

    #[test]
    fn unicode_text_is_bounded_and_still_requires_live_authorization() {
        assert_eq!(
            text_input_units(&serde_json::json!({"text":"中文🙂"}))
                .unwrap()
                .len(),
            4
        );
        for text in [
            "".to_string(),
            "a".repeat(129),
            "bad\0text".into(),
            "\u{1b}".into(),
        ] {
            assert!(text_input_units(&serde_json::json!({"text":text})).is_err());
        }
        let mut permission = PermissionAdapter::default();
        let mut input = event("token", 1000);
        input.event_type = InputType::TextInput;
        input.payload = serde_json::json!({"text":"中文"});
        assert!(matches!(
            validate_adapter_permission(&input, &mut permission, 1000),
            Err(InputError::NotAuthorized)
        ));
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

    #[cfg(windows)]
    #[test]
    fn stale_capture_cleanup_cannot_cancel_a_new_request() {
        let state = Arc::new(Mutex::new(DirectCaptureState::default()));
        state.lock().unwrap().request_id = Some("old-request".into());
        let pending = PendingCaptureGuard {
            state: state.clone(),
            request_id: "old-request".into(),
        };
        assert!(state.lock().unwrap().clear_request("old-request"));
        state.lock().unwrap().request_id = Some("new-request".into());
        drop(pending);
        assert_eq!(
            state.lock().unwrap().request_id.as_deref(),
            Some("new-request")
        );
        assert!(!state.lock().unwrap().clear_request("old-request"));
        assert!(state.lock().unwrap().clear_request("new-request"));
    }

    #[cfg(windows)]
    #[test]
    fn failed_capture_start_releases_pending_reservation() {
        let state = Arc::new(Mutex::new(DirectCaptureState::default()));
        state.lock().unwrap().request_id = Some("failed-request".into());
        let generation = state.lock().unwrap().generation;
        {
            let _pending = PendingCaptureGuard {
                state: state.clone(),
                request_id: "failed-request".into(),
            };
        }
        let state = state.lock().unwrap();
        assert!(state.request_id.is_none());
        assert!(state.active.is_none());
        assert_ne!(state.generation, generation);
    }
}

#[derive(Default)]
struct AppState {
    permission: Arc<Mutex<PermissionAdapter>>,
    #[cfg(windows)]
    capture: Arc<Mutex<DirectCaptureState>>,
    #[cfg(windows)]
    capture_starting: AtomicBool,
    #[cfg(windows)]
    capture_pulling: AtomicBool,
}
#[cfg(windows)]
#[derive(Default)]
struct DirectCaptureState {
    generation: u64,
    request_id: Option<String>,
    active: Option<(String, desktop_capture::Capture)>,
}
#[cfg(windows)]
impl DirectCaptureState {
    fn clear(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.request_id = None;
        self.active = None;
    }
    fn clear_request(&mut self, request_id: &str) -> bool {
        if self.request_id.as_deref() != Some(request_id) {
            return false;
        }
        self.clear();
        true
    }
}
#[cfg(windows)]
struct PendingCaptureGuard {
    state: Arc<Mutex<DirectCaptureState>>,
    request_id: String,
}
#[cfg(windows)]
impl Drop for PendingCaptureGuard {
    fn drop(&mut self) {
        if let Ok(mut state) = self.state.lock() {
            if state.request_id.as_deref() == Some(&self.request_id) && state.active.is_none() {
                state.clear();
            }
        }
    }
}
#[cfg(windows)]
struct FlightGuard<'a>(&'a AtomicBool);
#[cfg(windows)]
impl Drop for FlightGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[derive(Default)]
struct PermissionAdapter {
    authorized: bool,
    session_token: Option<String>,
    expires_at_ms: Option<u64>,
    lease_deadline: Option<Instant>,
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
    MouseRelative,
    MouseDown,
    MouseUp,
    MouseWheel,
    KeyDown,
    KeyUp,
    TextInput,
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
fn clear_input_authorization(state: State<'_, AppState>) -> Result<(), InputError> {
    #[cfg(windows)]
    if let Ok(mut capture) = state.capture.lock() {
        capture.clear();
    }
    let mut permission = state
        .permission
        .lock()
        .map_err(|_| InputError::NotAuthorized)?;
    revoke_permission(&mut permission)?;
    NoopCaptureAdapter.stop_capture();
    NoopSessionIndicator.set_status("disconnected");
    Ok(())
}

#[derive(serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DirectAcceptance {
    id: String,
    controller_token: String,
    state: String,
    expires_at: String,
    host_device_id: String,
}

#[tauri::command]
async fn accept_direct_capture(
    server_url: String,
    access_token: String,
    device_id: String,
    session_id: String,
    host_token: String,
    request_id: String,
    state: State<'_, AppState>,
) -> Result<DirectAcceptance, String> {
    #[cfg(not(windows))]
    {
        let _ = (
            server_url,
            access_token,
            device_id,
            session_id,
            host_token,
            request_id,
            state,
        );
        Err("windows_host_required".into())
    }
    #[cfg(windows)]
    {
        if state.capture_starting.swap(true, Ordering::AcqRel) {
            return Err("capture_busy".into());
        }
        let _flight = FlightGuard(&state.capture_starting);
        let mut base = reqwest::Url::parse(&server_url).map_err(|_| "invalid_service")?;
        let local = matches!(base.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
        let lan_test_http = cfg!(feature = "lan-test")
            && cfg!(debug_assertions)
            && base.scheme() == "http"
            && is_private_lan_ipv4(base.host_str());
        if !(base.scheme() == "https"
            || cfg!(debug_assertions) && local && base.scheme() == "http"
            || lan_test_http)
            || !base.username().is_empty()
            || base.password().is_some()
            || base.query().is_some()
            || base.fragment().is_some()
            || base.path() != "/"
        {
            return Err("invalid_service".into());
        }
        let valid_id = |id: &str| {
            !id.is_empty()
                && id.len() <= 128
                && id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        };
        if !valid_id(&device_id)
            || !valid_id(&session_id)
            || !valid_id(&request_id)
            || access_token.is_empty()
            || access_token.len() > 4096
            || host_token.len() < 16
            || host_token.len() > 512
        {
            return Err("invalid_direct_request".into());
        }
        let generation = {
            let mut lock = state.capture.lock().map_err(|_| "capture_busy")?;
            if lock.request_id.is_some() {
                return Err("capture_busy".into());
            }
            lock.generation = lock.generation.wrapping_add(1);
            lock.request_id = Some(request_id.clone());
            lock.generation
        };
        let _pending = PendingCaptureGuard {
            state: state.capture.clone(),
            request_id: request_id.clone(),
        };
        base.set_path(&format!(
            "/api/v1/devices/{device_id}/direct-sessions/{session_id}/accept"
        ));
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none());
        // Local development credentials must never traverse an environment proxy.
        let client = if local || lan_test_http {
            client.no_proxy()
        } else {
            client
        }
        .build()
        .map_err(|_| "service_unavailable")?;
        let capture = tauri::async_runtime::spawn_blocking(desktop_capture::Capture::start)
            .await
            .map_err(|_| "capture_start_failed")??;
        {
            let lock = state.capture.lock().map_err(|_| "capture_busy")?;
            if lock.generation != generation {
                return Err("direct_cancelled".into());
            }
        }
        let mut response = client
            .post(base)
            .bearer_auth(access_token)
            .json(&serde_json::json!({"hostToken":host_token}))
            .send()
            .await
            .map_err(|_| "direct_accept_failed")?;
        if !response.status().is_success() {
            return Err("direct_access_denied".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "invalid_direct_response")?
        {
            if bytes.len() + chunk.len() > 65536 {
                return Err("invalid_direct_response".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let acceptance: DirectAcceptance =
            serde_json::from_slice(&bytes).map_err(|_| "invalid_direct_response")?;
        if acceptance.id != session_id
            || acceptance.host_device_id != device_id
            || acceptance.state != "AUTHORIZED_ACTIVE"
            || acceptance.controller_token.len() < 16
            || acceptance.controller_token.len() > 512
        {
            return Err("invalid_direct_response".into());
        }
        let expiry = chrono::DateTime::parse_from_rfc3339(&acceptance.expires_at)
            .map_err(|_| "invalid_expiry")?
            .timestamp_millis();
        if expiry <= now_ms() as i64 || expiry - now_ms() as i64 > 8 * 60 * 60 * 1000 {
            return Err("invalid_expiry".into());
        }
        let mut lock = state.capture.lock().map_err(|_| "capture_busy")?;
        if lock.generation != generation {
            return Err("direct_cancelled".into());
        }
        let mut permission = state.permission.lock().map_err(|_| "input_unavailable")?;
        release_pressed(&mut permission).map_err(|_| "input_release_failed")?;
        permission.authorized = true;
        permission.session_token = Some(acceptance.controller_token.clone());
        permission.expires_at_ms = Some(expiry as u64);
        permission.lease_deadline = Some(Instant::now() + INITIAL_INPUT_LEASE);
        permission.recent_events.clear();
        lock.active = Some((acceptance.controller_token.clone(), capture));
        Ok(acceptance)
    }
}

#[tauri::command]
fn local_device_name() -> String {
    #[cfg(windows)]
    {
        std::env::var("COMPUTERNAME")
            .ok()
            .filter(|name| !name.trim().is_empty() && name.len() <= 255)
            .unwrap_or_else(|| "Windows PC".into())
    }
    #[cfg(not(windows))]
    {
        "RemoteAssist Device".into()
    }
}

#[tauri::command]
fn clear_direct_capture(request_id: String, state: State<'_, AppState>) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = (request_id, state);
        Ok(())
    }
    #[cfg(windows)]
    {
        let mut capture = state.capture.lock().map_err(|_| "capture_unavailable")?;
        if capture.clear_request(&request_id) {
            let mut permission = state.permission.lock().map_err(|_| "input_unavailable")?;
            revoke_permission(&mut permission).map_err(|_| "input_release_failed")?;
        }
        Ok(())
    }
}

#[tauri::command]
async fn next_desktop_frame(
    session_token: String,
    state: State<'_, AppState>,
) -> Result<tauri::ipc::Response, String> {
    #[cfg(not(windows))]
    {
        let _ = (session_token, state);
        Err("windows_host_required".into())
    }
    #[cfg(windows)]
    {
        if state.capture_pulling.swap(true, Ordering::AcqRel) {
            return Err("capture_busy".into());
        }
        let _flight = FlightGuard(&state.capture_pulling);
        {
            let p = state.permission.lock().map_err(|_| "input_unavailable")?;
            if !permission_is_live(&p, now_ms())
                || p.session_token.as_deref() != Some(&session_token)
            {
                return Err("direct_access_expired".into());
            }
        }
        let (generation, sender) = {
            let lock = state.capture.lock().map_err(|_| "capture_unavailable")?;
            let (token, capture) = lock.active.as_ref().ok_or("capture_unavailable")?;
            if token != &session_token {
                return Err("capture_not_owned".into());
            }
            (lock.generation, capture.requester())
        };
        let data = tauri::async_runtime::spawn_blocking(move || {
            let (tx, rx) = std::sync::mpsc::channel();
            sender.try_send(tx).map_err(|_| "capture_busy")?;
            rx.recv_timeout(Duration::from_secs(2))
                .map_err(|_| "capture_timeout")?
        })
        .await
        .map_err(|_| "capture_failed")??;
        {
            let lock = state.capture.lock().map_err(|_| "capture_unavailable")?;
            if lock.generation != generation || lock.active.is_none() {
                return Err("capture_ended".into());
            }
        }
        {
            let p = state.permission.lock().map_err(|_| "input_unavailable")?;
            if !permission_is_live(&p, now_ms())
                || p.session_token.as_deref() != Some(&session_token)
            {
                return Err("direct_access_expired".into());
            }
        }
        Ok(tauri::ipc::Response::new(data))
    }
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
    let cost = if matches!(event.event_type, InputType::TextInput) {
        text_input_units(&event.payload)?.len().div_ceil(8)
    } else {
        1
    };
    if permission.recent_events.len() + cost > MAX_EVENTS_PER_SECOND {
        return Err(InputError::RateLimited);
    }
    permission
        .recent_events
        .extend(std::iter::repeat_n(now, cost));
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            let permission = Arc::downgrade(&app.state::<AppState>().permission);
            #[cfg(windows)]
            let capture = Arc::downgrade(&app.state::<AppState>().capture);
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(500));
                let Some(permission) = permission.upgrade() else {
                    break;
                };
                #[cfg(windows)]
                let capture = match capture.upgrade() {
                    Some(value) => value,
                    None => break,
                };
                #[cfg(windows)]
                let mut capture = match capture.lock() {
                    Ok(value) => value,
                    Err(_) => continue,
                };
                if let Ok(mut permission) = permission.lock() {
                    if permission.authorized && !permission_is_live(&permission, now_ms()) {
                        let _ = revoke_permission(&mut permission);
                    } else if !permission.authorized {
                        let _ = release_pressed(&mut permission);
                    }
                    #[cfg(windows)]
                    if !permission.authorized && capture.active.is_some() {
                        capture.clear();
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
                #[cfg(windows)]
                if let Ok(mut capture) = window.state::<AppState>().capture.lock() {
                    capture.clear();
                }
                if let Ok(mut permission) = window.state::<AppState>().permission.lock() {
                    let _ = revoke_permission(&mut permission);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            clear_input_authorization,
            release_remote_inputs,
            renew_input_lease,
            read_stored_auth,
            write_stored_auth,
            delete_stored_auth,
            send_input_event,
            accept_direct_capture,
            next_desktop_frame,
            clear_direct_capture,
            local_device_name
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
            KEYEVENTF_UNICODE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_MOVE, MOUSEEVENTF_WHEEL,
            MOUSEINPUT, VIRTUAL_KEY,
        };

        if matches!(event.event_type, InputType::TextInput) {
            let units = text_input_units(&event.payload)?;
            // Unicode down/up pairs are submitted together. No clipboard or shell is involved.
            let mut inputs = Vec::with_capacity(units.len() * 2);
            for unit in units {
                let special = match unit {
                    10 => Some(13),
                    9 => Some(9),
                    _ => None,
                };
                let base = if special.is_some() {
                    Default::default()
                } else {
                    KEYEVENTF_UNICODE
                };
                for flags in [base, base | KEYEVENTF_KEYUP] {
                    inputs.push(INPUT {
                        r#type: INPUT_KEYBOARD,
                        Anonymous: INPUT_0 {
                            ki: KEYBDINPUT {
                                wVk: VIRTUAL_KEY(special.unwrap_or(0)),
                                wScan: if special.is_some() { 0 } else { unit },
                                dwFlags: flags,
                                time: 0,
                                dwExtraInfo: 0,
                            },
                        },
                    });
                }
            }
            let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
            if sent as usize != inputs.len() {
                // A partial array can end on a Unicode key-down; pair it before failing.
                if sent % 2 == 1 && (sent as usize) < inputs.len() {
                    unsafe {
                        SendInput(
                            &inputs[sent as usize..sent as usize + 1],
                            std::mem::size_of::<INPUT>() as i32,
                        );
                    }
                }
                return Err(InputError::SendInputFailed);
            }
            return Ok(());
        }

        let input = match event.event_type {
            InputType::MouseRelative => {
                let (dx, dy) = relative_mouse_delta(&event.payload)?;
                INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx,
                            dy,
                            dwFlags: MOUSEEVENTF_MOVE,
                            ..Default::default()
                        },
                    },
                }
            }
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
                let (dx, dy, flags) =
                    if event.payload.get("relative").and_then(|v| v.as_bool()) == Some(true) {
                        (0, 0, flag)
                    } else {
                        let (x, y) = mouse_xy(&self.display, &event.payload)?;
                        (x, y, flag | MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE)
                    };
                INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dx,
                            dy,
                            mouseData: 0,
                            dwFlags: flags,
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
            InputType::TextInput => return Err(InputError::InvalidPayload),
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

#[cfg(any(windows, test))]
fn relative_mouse_delta(payload: &serde_json::Value) -> Result<(i32, i32), InputError> {
    fn axis(value: Option<&serde_json::Value>) -> Result<i32, InputError> {
        value
            .and_then(|v| v.as_i64())
            .filter(|v| (-1024..=1024).contains(v))
            .map(|v| v as i32)
            .ok_or(InputError::InvalidPayload)
    }
    Ok((axis(payload.get("dx"))?, axis(payload.get("dy"))?))
}

fn text_input_units(payload: &serde_json::Value) -> Result<Vec<u16>, InputError> {
    let text = payload
        .get("text")
        .and_then(|value| value.as_str())
        .ok_or(InputError::InvalidPayload)?;
    let units: Vec<u16> = text.encode_utf16().collect();
    if units.is_empty()
        || units.len() > 128
        || text
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t')
    {
        return Err(InputError::InvalidPayload);
    }
    Ok(units)
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
