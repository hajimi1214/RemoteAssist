//! Visible account-device sessions use Desktop Duplication on the primary monitor.
//! Frames are pulled one at a time, losslessly, with no disk persistence or queue.
use std::sync::mpsc::{self, Sender, SyncSender};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use windows::core::Interface;
use windows::Win32::Foundation::{HMODULE, POINT};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_UNKNOWN;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::*;
use windows::Win32::Graphics::Dxgi::*;
use windows::Win32::Graphics::Gdi::{MonitorFromPoint, MONITOR_DEFAULTTOPRIMARY};
use windows::Win32::UI::WindowsAndMessaging::{GetCursorInfo, CURSORINFO, CURSOR_SHOWING};

pub struct Capture {
    requests: SyncSender<Sender<Result<Vec<u8>, String>>>,
    cancelled: Arc<AtomicBool>,
}
impl Capture {
    pub fn start() -> Result<Self, String> {
        let (tx, rx) = mpsc::sync_channel::<Sender<Result<Vec<u8>, String>>>(1);
        let cancelled = Arc::new(AtomicBool::new(false));
        let stop = cancelled.clone();
        let (ready, check) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let mut desktop = match Desktop::open() {
                Ok(v) => {
                    let _ = ready.send(Ok(()));
                    v
                }
                Err(e) => {
                    let _ = ready.send(Err(e));
                    return;
                }
            };
            while let Ok(reply) = rx.recv() {
                if stop.load(Ordering::Acquire) {
                    break;
                }
                let frame = desktop.frame(&stop);
                if stop.load(Ordering::Acquire) {
                    break;
                }
                let _ = reply.send(frame);
            }
        });
        check
            .recv_timeout(Duration::from_secs(10))
            .map_err(|_| "capture_start_timeout".to_string())??;
        Ok(Self {
            requests: tx,
            cancelled,
        })
    }
    pub fn requester(&self) -> SyncSender<Sender<Result<Vec<u8>, String>>> {
        self.requests.clone()
    }
}
impl Drop for Capture {
    fn drop(&mut self) {
        self.cancelled.store(true, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Explicit operator-only smoke check. No frame contents are written or logged.
    #[test]
    #[ignore = "requires a visible, unlocked Windows desktop and explicit environment opt-in"]
    fn primary_display_capture_smoke() {
        assert_eq!(
            std::env::var("REMOTEASSIST_CAPTURE_SMOKE").as_deref(),
            Ok("1")
        );
        let started = std::time::Instant::now();
        let capture = Capture::start().expect("primary desktop duplication must start");
        let sender = capture.requester();
        let mut frames = 0;
        let mut bytes = 0;
        let mut dimensions = (0, 0);
        for _ in 0..12 {
            let (tx, rx) = mpsc::channel();
            sender.try_send(tx).unwrap();
            let frame = rx
                .recv_timeout(Duration::from_secs(2))
                .unwrap()
                .expect("frame capture must succeed");
            if frame.is_empty() {
                continue;
            }
            assert!(frame.len() >= 16);
            let width = u32::from_le_bytes(frame[0..4].try_into().unwrap());
            let height = u32::from_le_bytes(frame[4..8].try_into().unwrap());
            assert!(frame.len() == 16 || frame.len() == 16 + width as usize * height as usize * 4);
            if frame.len() == 16 {
                continue;
            }
            dimensions = (width, height);
            frames += 1;
            bytes += frame.len();
            if frames == 3 {
                break;
            }
        }
        assert!(frames > 0, "at least one actual desktop frame is required");
        drop(capture);
        eprintln!(
            "capture_smoke dimensions={}x{} frames={} bytes={} elapsed_ms={}",
            dimensions.0,
            dimensions.1,
            frames,
            bytes,
            started.elapsed().as_millis()
        );
    }
}
struct Desktop {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    duplication: IDXGIOutputDuplication,
    staging: Option<ID3D11Texture2D>,
    dimensions: (u32, u32),
}
impl Desktop {
    fn open() -> Result<Self, String> {
        unsafe {
            let primary = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
            let factory: IDXGIFactory1 = CreateDXGIFactory1().map_err(|_| "dxgi_unavailable")?;
            let mut index = 0;
            while let Ok(adapter) = factory.EnumAdapters1(index) {
                let mut out = 0;
                while let Ok(output) = adapter.EnumOutputs(out) {
                    let desc = output.GetDesc().map_err(|_| "display_unavailable")?;
                    if desc.Monitor == primary && desc.AttachedToDesktop.as_bool() {
                        let mut device = None;
                        let mut context = None;
                        D3D11CreateDevice(
                            &adapter,
                            D3D_DRIVER_TYPE_UNKNOWN,
                            HMODULE::default(),
                            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                            None,
                            D3D11_SDK_VERSION,
                            Some(&mut device),
                            None,
                            Some(&mut context),
                        )
                        .map_err(|_| "d3d_unavailable")?;
                        let device = device.ok_or("d3d_unavailable")?;
                        // Request a format our shader can consume explicitly.
                        // Windows converts a different fullscreen scan-out format
                        // to BGRA8, rather than returning HDR/10-bit bytes to JS.
                        let duplication = match output.cast::<IDXGIOutput5>() {
                            Ok(output5) => output5
                                .DuplicateOutput1(&device, 0, &[DXGI_FORMAT_B8G8R8A8_UNORM])
                                .or_else(|_| {
                                    output.cast::<IDXGIOutput1>()?.DuplicateOutput(&device)
                                }),
                            Err(_) => output
                                .cast::<IDXGIOutput1>()
                                .and_then(|value| value.DuplicateOutput(&device)),
                        }
                        .map_err(|_| "desktop_duplication_failed")?;
                        if duplication.GetDesc().Rotation != DXGI_MODE_ROTATION_IDENTITY {
                            return Err("rotated_primary_display_not_supported".into());
                        }
                        return Ok(Self {
                            device,
                            context: context.ok_or("d3d_unavailable")?,
                            duplication,
                            staging: None,
                            dimensions: (0, 0),
                        });
                    }
                    out += 1;
                }
                index += 1;
            }
            Err("primary_display_not_found".into())
        }
    }
    fn frame(&mut self, cancelled: &AtomicBool) -> Result<Vec<u8>, String> {
        unsafe {
            let mut info = DXGI_OUTDUPL_FRAME_INFO::default();
            let mut resource = None;
            if let Err(error) = self
                .duplication
                .AcquireNextFrame(40, &mut info, &mut resource)
            {
                if error.code() == DXGI_ERROR_WAIT_TIMEOUT {
                    return Ok(Vec::new());
                }
                return Err("desktop_capture_interrupted".into());
            }
            let result = if cancelled.load(Ordering::Acquire) {
                Err("capture_cancelled".into())
            } else if info.LastPresentTime == 0 && self.dimensions != (0, 0) {
                // DXGI can wake only for a cursor update. Avoid a full 4K GPU
                // readback/IPC copy when the existing desktop texture is valid.
                Ok(self.header())
            } else {
                self.copy(resource.ok_or("capture_resource_missing"))
            };
            let _ = self.duplication.ReleaseFrame();
            result
        }
    }
    unsafe fn copy(&mut self, resource: Result<IDXGIResource, &str>) -> Result<Vec<u8>, String> {
        let texture = resource?
            .cast::<ID3D11Texture2D>()
            .map_err(|_| "capture_texture_invalid")?;
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        texture.GetDesc(&mut desc);
        if std::env::var("REMOTEASSIST_CAPTURE_SMOKE").as_deref() == Ok("1") {
            let output = self.duplication.GetDesc();
            eprintln!("capture_texture width={} height={} format={} output_format={} row_sample={} rotation={}",desc.Width,desc.Height,desc.Format.0,output.ModeDesc.Format.0,desc.SampleDesc.Count,output.Rotation.0);
        }
        if desc.Width == 0
            || desc.Height == 0
            || u64::from(desc.Width) * u64::from(desc.Height) > 33_177_600
        {
            return Err("display_dimensions_unsupported".into());
        }
        // These variants all carry the same B,G,R,A byte order. No CPU color
        // conversion or loss of text resolution is required for the SDR canvas.
        if !matches!(
            desc.Format,
            DXGI_FORMAT_B8G8R8A8_UNORM
                | DXGI_FORMAT_B8G8R8A8_UNORM_SRGB
                | DXGI_FORMAT_B8G8R8A8_TYPELESS
        ) {
            return Err(format!("display_format_unsupported_{}", desc.Format.0));
        }
        if self.dimensions != (desc.Width, desc.Height) {
            let mut staging = None;
            let mut cpu = desc;
            cpu.Usage = D3D11_USAGE_STAGING;
            cpu.BindFlags = 0;
            cpu.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
            cpu.MiscFlags = 0;
            self.device
                .CreateTexture2D(&cpu, None, Some(&mut staging))
                .map_err(|_| "capture_buffer_failed")?;
            self.staging = staging;
            self.dimensions = (desc.Width, desc.Height);
        }
        let staging = self.staging.as_ref().ok_or("capture_buffer_failed")?;
        self.context.CopyResource(staging, &texture);
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        self.context
            .Map(staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
            .map_err(|_| "capture_map_failed")?;
        let row = desc.Width as usize * 4;
        let len = row * desc.Height as usize;
        if mapped.pData.is_null() || (mapped.RowPitch as usize) < row {
            self.context.Unmap(staging, 0);
            return Err("capture_stride_invalid".into());
        }
        let mut bytes = self.header();
        bytes.reserve(len);
        for y in 0..desc.Height as usize {
            bytes.extend_from_slice(std::slice::from_raw_parts(
                (mapped.pData as *const u8).add(y * mapped.RowPitch as usize),
                row,
            ));
        }
        self.context.Unmap(staging, 0);
        Ok(bytes)
    }

    unsafe fn header(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(16);
        bytes.extend_from_slice(&self.dimensions.0.to_le_bytes());
        bytes.extend_from_slice(&self.dimensions.1.to_le_bytes());
        let mut cursor = CURSORINFO {
            cbSize: std::mem::size_of::<CURSORINFO>() as u32,
            ..Default::default()
        };
        let shown = GetCursorInfo(&mut cursor).is_ok() && cursor.flags == CURSOR_SHOWING;
        bytes.extend_from_slice(&(if shown { cursor.ptScreenPos.x } else { -1 }).to_le_bytes());
        bytes.extend_from_slice(&(if shown { cursor.ptScreenPos.y } else { -1 }).to_le_bytes());
        bytes
    }
}
