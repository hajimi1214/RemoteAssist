//! Visible account-device sessions use Desktop Duplication on the primary monitor.
//! Frames are pulled one at a time, losslessly, with no disk persistence or queue.
use std::sync::mpsc::{self, Sender, SyncSender};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use windows::core::Interface;
use windows::Win32::Foundation::{HMODULE, POINT, RECT};
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

    #[test]
    fn small_dirty_metadata_is_conservatively_aggregated() {
        let bounds = dirty_bounds(
            &[
                RECT {
                    left: 10,
                    top: 20,
                    right: 30,
                    bottom: 40,
                },
                RECT {
                    left: 25,
                    top: 15,
                    right: 45,
                    bottom: 35,
                },
            ],
            100,
            100,
        )
        .unwrap();
        assert_eq!(
            (bounds.left, bounds.top, bounds.right, bounds.bottom),
            (10, 15, 45, 40)
        );
        for rect in [
            RECT {
                left: -1,
                top: 0,
                right: 10,
                bottom: 10,
            },
            RECT {
                left: 0,
                top: 0,
                right: 101,
                bottom: 10,
            },
            RECT {
                left: 20,
                top: 0,
                right: 10,
                bottom: 10,
            },
            RECT {
                left: 0,
                top: 0,
                right: 100,
                bottom: 100,
            },
        ] {
            assert!(dirty_bounds(&[rect], 100, 100).is_none());
        }
        assert!(dirty_bounds(&[], 100, 100).is_none());
        assert!(dirty_bounds(
            &[RECT {
                left: 0,
                top: 0,
                right: 1,
                bottom: 1
            }; 257],
            100,
            100
        )
        .is_none());
    }

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
        let mut full_frames = 0;
        let mut delta_frames = 0;
        let mut cursor_packets = 0;
        let mut bytes = 0;
        let mut raw_equivalent = 0u64;
        let mut sequence = 0;
        let mut dimensions = (0, 0);
        let requested = std::env::var("REMOTEASSIST_CAPTURE_SAMPLES")
            .ok()
            .and_then(|value| value.parse::<usize>().ok());
        let samples = requested.unwrap_or(12).clamp(1, 300);
        for _ in 0..samples {
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
            let tagged_width = u32::from_le_bytes(frame[0..4].try_into().unwrap());
            let width = tagged_width & 0x3fff_ffff;
            let height = u32::from_le_bytes(frame[4..8].try_into().unwrap());
            bytes += frame.len();
            if frame.len() == 16 {
                raw_equivalent += 16;
                cursor_packets += 1;
                continue;
            }
            raw_equivalent += 20 + u64::from(width) * u64::from(height) * 4;
            let next = u32::from_le_bytes(frame[16..20].try_into().unwrap());
            assert_eq!(next, sequence + 1);
            if tagged_width & FULL_V1 != 0 {
                assert_eq!(frame.len(), 20 + width as usize * height as usize * 4);
                full_frames += 1;
            } else {
                assert_eq!(tagged_width & DELTA_V1, DELTA_V1);
                assert_eq!(
                    u32::from_le_bytes(frame[20..24].try_into().unwrap()),
                    sequence
                );
                assert_eq!(u32::from_le_bytes(frame[24..28].try_into().unwrap()), 1);
                let x = u32::from_le_bytes(frame[28..32].try_into().unwrap());
                let y = u32::from_le_bytes(frame[32..36].try_into().unwrap());
                let w = u32::from_le_bytes(frame[36..40].try_into().unwrap());
                let h = u32::from_le_bytes(frame[40..44].try_into().unwrap());
                assert!(w > 0 && h > 0 && x + w <= width && y + h <= height);
                assert_eq!(frame.len(), 44 + w as usize * h as usize * 4);
                delta_frames += 1;
            }
            sequence = next;
            dimensions = (width, height);
            frames += 1;
            if requested.is_none() && frames == 3 {
                break;
            }
        }
        assert!(frames > 0, "at least one actual desktop frame is required");
        drop(capture);
        eprintln!(
            "capture_smoke dimensions={}x{} frames={} full={} delta={} cursor={} bytes={} raw_equivalent_bytes={} elapsed_ms={}",
            dimensions.0,
            dimensions.1,
            frames,
            full_frames,delta_frames,cursor_packets,
            bytes,
            raw_equivalent,
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
    sequence: u32,
}
const FULL_V1: u32 = 0x4000_0000;
const DELTA_V1: u32 = 0x8000_0000;
const MAX_DIRTY_RECTS: usize = 256;

// Invalid or widespread metadata falls back to a full frame. A conservative
// bounding box may include clean pixels, but can never omit a reported change.
fn dirty_bounds(rects: &[RECT], width: u32, height: u32) -> Option<RECT> {
    if rects.is_empty() || rects.len() > MAX_DIRTY_RECTS {
        return None;
    }
    let mut bounds = RECT {
        left: width as i32,
        top: height as i32,
        right: 0,
        bottom: 0,
    };
    for rect in rects {
        if rect.left < 0
            || rect.top < 0
            || rect.right <= rect.left
            || rect.bottom <= rect.top
            || rect.right as u32 > width
            || rect.bottom as u32 > height
        {
            return None;
        }
        bounds.left = bounds.left.min(rect.left);
        bounds.top = bounds.top.min(rect.top);
        bounds.right = bounds.right.max(rect.right);
        bounds.bottom = bounds.bottom.max(rect.bottom);
    }
    let area = (bounds.right - bounds.left) as u64 * (bounds.bottom - bounds.top) as u64;
    (area * 100 <= u64::from(width) * u64::from(height) * 60).then_some(bounds)
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
                            sequence: 0,
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
                self.copy(resource.ok_or("capture_resource_missing"), &info)
            };
            let _ = self.duplication.ReleaseFrame();
            result
        }
    }
    unsafe fn copy(
        &mut self,
        resource: Result<IDXGIResource, &str>,
        info: &DXGI_OUTDUPL_FRAME_INFO,
    ) -> Result<Vec<u8>, String> {
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
        let resized = self.dimensions != (desc.Width, desc.Height);
        if resized {
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
        let region = if resized {
            None
        } else {
            self.changed_region(info, desc.Width, desc.Height)
        };
        let region = region.unwrap_or(RECT {
            left: 0,
            top: 0,
            right: desc.Width as i32,
            bottom: desc.Height as i32,
        });
        let full = region.left == 0
            && region.top == 0
            && region.right as u32 == desc.Width
            && region.bottom as u32 == desc.Height;
        let sequence = self
            .sequence
            .checked_add(1)
            .ok_or("capture_sequence_exhausted")?;
        let staging = self.staging.as_ref().ok_or("capture_buffer_failed")?;
        if full {
            self.context.CopyResource(staging, &texture);
        } else {
            let source = D3D11_BOX {
                left: region.left as u32,
                top: region.top as u32,
                front: 0,
                right: region.right as u32,
                bottom: region.bottom as u32,
                back: 1,
            };
            self.context.CopySubresourceRegion(
                staging,
                0,
                region.left as u32,
                region.top as u32,
                0,
                &texture,
                0,
                Some(&source),
            );
        }
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        self.context
            .Map(staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
            .map_err(|_| "capture_map_failed")?;
        let region_width = (region.right - region.left) as usize;
        let region_height = (region.bottom - region.top) as usize;
        let row = region_width * 4;
        let len = row * region_height;
        if mapped.pData.is_null() || (mapped.RowPitch as usize) < desc.Width as usize * 4 {
            self.context.Unmap(staging, 0);
            return Err("capture_stride_invalid".into());
        }
        let mut bytes = self.header();
        bytes[0..4]
            .copy_from_slice(&(desc.Width | if full { FULL_V1 } else { DELTA_V1 }).to_le_bytes());
        bytes.extend_from_slice(&sequence.to_le_bytes());
        if !full {
            bytes.extend_from_slice(&self.sequence.to_le_bytes());
            bytes.extend_from_slice(&1u32.to_le_bytes());
            for value in [
                region.left as u32,
                region.top as u32,
                region_width as u32,
                region_height as u32,
            ] {
                bytes.extend_from_slice(&value.to_le_bytes());
            }
        }
        bytes.reserve(len);
        for y in region.top as usize..region.bottom as usize {
            bytes.extend_from_slice(std::slice::from_raw_parts(
                (mapped.pData as *const u8)
                    .add(y * mapped.RowPitch as usize + region.left as usize * 4),
                row,
            ));
        }
        self.context.Unmap(staging, 0);
        self.sequence = sequence;
        Ok(bytes)
    }

    unsafe fn changed_region(
        &self,
        info: &DXGI_OUTDUPL_FRAME_INFO,
        width: u32,
        height: u32,
    ) -> Option<RECT> {
        if info.TotalMetadataBufferSize == 0
            || info.TotalMetadataBufferSize as usize > MAX_DIRTY_RECTS * std::mem::size_of::<RECT>()
        {
            return None;
        }
        // A desktop move needs the previous source pixels. Full fallback avoids
        // GPU in-place overlap hazards and keeps this protocol deterministic.
        let mut moves = 0;
        let mut move_rect = DXGI_OUTDUPL_MOVE_RECT::default();
        if self
            .duplication
            .GetFrameMoveRects(
                std::mem::size_of_val(&move_rect) as u32,
                &mut move_rect,
                &mut moves,
            )
            .is_err()
            || moves != 0
        {
            return None;
        }
        let mut rects = [RECT::default(); MAX_DIRTY_RECTS];
        let mut required = 0;
        if self
            .duplication
            .GetFrameDirtyRects(
                std::mem::size_of_val(&rects) as u32,
                rects.as_mut_ptr(),
                &mut required,
            )
            .is_err()
            || required == 0
            || required as usize > std::mem::size_of_val(&rects)
            || required as usize % std::mem::size_of::<RECT>() != 0
        {
            return None;
        }
        dirty_bounds(
            &rects[..required as usize / std::mem::size_of::<RECT>()],
            width,
            height,
        )
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
