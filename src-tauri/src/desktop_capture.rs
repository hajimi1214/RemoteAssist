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
    requests: SyncSender<FrameRequest>,
    cancelled: Arc<AtomicBool>,
}

pub struct FrameRequest {
    reply: Sender<Result<Vec<u8>, String>>,
    timeout_ms: u32,
}

impl FrameRequest {
    pub fn new(reply: Sender<Result<Vec<u8>, String>>, timeout_ms: u32) -> Self {
        Self { reply, timeout_ms }
    }
}

const DEFAULT_ACQUIRE_TIMEOUT_MS: u32 = 40;
const MAX_ACQUIRE_TIMEOUT_MS: u32 = 40;

pub fn bounded_acquire_timeout_ms(requested_ms: Option<u32>) -> u32 {
    requested_ms
        .unwrap_or(DEFAULT_ACQUIRE_TIMEOUT_MS)
        .clamp(1, MAX_ACQUIRE_TIMEOUT_MS)
}

impl Capture {
    pub fn start() -> Result<Self, String> {
        let (tx, rx) = mpsc::sync_channel::<FrameRequest>(1);
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
            while let Ok(request) = rx.recv() {
                if stop.load(Ordering::Acquire) {
                    break;
                }
                let frame = desktop.frame(&stop, request.timeout_ms);
                if stop.load(Ordering::Acquire) {
                    break;
                }
                let _ = request.reply.send(frame);
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
    pub fn requester(&self) -> SyncSender<FrameRequest> {
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
    fn acquire_timeout_tracks_requested_frame_period_with_a_hard_bound() {
        assert_eq!(bounded_acquire_timeout_ms(None), 40);
        assert_eq!(bounded_acquire_timeout_ms(Some(17)), 17);
        assert_eq!(bounded_acquire_timeout_ms(Some(34)), 34);
        assert_eq!(bounded_acquire_timeout_ms(Some(0)), 1);
        assert_eq!(bounded_acquire_timeout_ms(Some(1_000)), 40);
    }

    #[test]
    fn percentile_ms_uses_nearest_rank_and_rejects_invalid_inputs() {
        let samples: Vec<f64> = (1..=100).map(f64::from).collect();
        assert_eq!(percentile_ms(&samples, 0.50), Some(50.0));
        assert_eq!(percentile_ms(&samples, 0.95), Some(95.0));
        assert_eq!(percentile_ms(&samples, 0.99), Some(99.0));
        assert_eq!(percentile_ms(&samples, 1.0), Some(100.0));
        assert_eq!(percentile_ms(&samples, f64::NAN), None);
        assert_eq!(percentile_ms(&[], 0.95), None);
    }

    #[test]
    fn staging_layout_rebuilds_for_format_changes_even_when_dimensions_match() {
        let mut desc = D3D11_TEXTURE2D_DESC {
            Width: 3840,
            Height: 2160,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            ..Default::default()
        };
        assert!(staging_needs_rebuild((0, 0), None, &desc));
        assert!(!staging_needs_rebuild(
            (3840, 2160),
            Some(DXGI_FORMAT_B8G8R8A8_UNORM),
            &desc
        ));
        desc.Format = DXGI_FORMAT_R16G16B16A16_FLOAT;
        assert!(staging_needs_rebuild(
            (3840, 2160),
            Some(DXGI_FORMAT_B8G8R8A8_UNORM),
            &desc
        ));
        assert!(!staging_needs_rebuild(
            (3840, 2160),
            Some(DXGI_FORMAT_R16G16B16A16_FLOAT),
            &desc
        ));
        desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
        assert!(staging_needs_rebuild(
            (3840, 2160),
            Some(DXGI_FORMAT_R16G16B16A16_FLOAT),
            &desc
        ));
        desc.Width = 1920;
        assert!(staging_needs_rebuild(
            (3840, 2160),
            Some(DXGI_FORMAT_B8G8R8A8_UNORM),
            &desc
        ));
        assert!(staging_needs_rebuild((1920, 2160), None, &desc));
    }

    #[test]
    fn binary16_decoder_handles_zero_subnormal_normal_and_special_values() {
        assert_eq!(half_to_f32(0x0000), 0.0);
        assert_eq!(half_to_f32(0x8000), -0.0);
        assert!((half_to_f32(0x0001) - 5.960_464_5e-8).abs() < 1e-13);
        assert_eq!(half_to_f32(0x3800), 0.5);
        assert_eq!(half_to_f32(0x3c00), 1.0);
        assert!(half_to_f32(0x7c00).is_infinite());
        assert!(half_to_f32(0x7e00).is_nan());
    }

    #[test]
    fn hdr_tone_map_preserves_sdr_midtones_and_compresses_highlights_monotonically() {
        assert_eq!(linear_sc_rgb_to_srgb8(0.0), 0);
        assert_eq!(linear_sc_rgb_to_srgb8(-1.0), 0);
        assert_eq!(linear_sc_rgb_to_srgb8(f32::NAN), 0);
        assert_eq!(linear_sc_rgb_to_srgb8(f32::INFINITY), 0);
        // scRGB reference white maps to 0.9 linear, encoded as ~0.955 sRGB.
        assert!((linear_sc_rgb_to_srgb8(1.0) as i16 - 243).abs() <= 1);
        assert!((linear_sc_rgb_to_srgb8(0.18) as i16 - 111).abs() <= 1);
        let samples = [0.0, 0.001, 0.01, 0.18, 0.5, 1.0, 1.1, 2.0, 8.0, 65_504.0];
        let mapped: Vec<_> = samples
            .iter()
            .map(|value| linear_sc_rgb_to_srgb8(*value))
            .collect();
        assert!(mapped.windows(2).all(|pair| pair[0] <= pair[1]));
        assert!(mapped[5] < mapped[6] && mapped[6] < mapped[7]);
        assert_eq!(mapped[9], 255);
    }

    #[test]
    fn hdr_tone_map_is_dense_and_monotonic_across_positive_half_values() {
        let mut previous = 0u8;
        let mut used = [false; 256];
        for bits in 0..=0x4800u16 {
            let mapped = linear_sc_rgb_to_srgb8(half_to_f32(bits));
            assert!(
                mapped >= previous,
                "tone map reversed at binary16 {bits:#06x}"
            );
            assert!(
                mapped - previous <= 1,
                "tone map banded at binary16 {bits:#06x}"
            );
            used[mapped as usize] = true;
            previous = mapped;
        }
        assert!(used.iter().filter(|value| **value).count() >= 240);
    }

    #[test]
    fn hdr_pixel_conversion_outputs_opaque_bgra_and_ignores_source_alpha() {
        let red = hdr_lut()[0x3c00]; // 1.0
        let green = hdr_lut()[0x3800]; // 0.5
        let blue = hdr_lut()[0x0000]; // 0.0
        let pixel = hdr_rgba16_to_bgra8([0x3c00, 0x3800, 0x0000, 0x0000]);
        assert_eq!(pixel, [blue, green, red, 255]);
        let transparent = hdr_rgba16_to_bgra8([0x3c00, 0x3800, 0x0000, 0x7c00]);
        assert_eq!(transparent[3], 255);
        assert_eq!(&pixel[..3], &transparent[..3]);
    }

    #[test]
    fn sparse_dirty_regions_stay_separate_and_cover_every_changed_pixel() {
        let input = [
            RECT {
                left: 0,
                top: 0,
                right: 2,
                bottom: 2,
            },
            RECT {
                left: 8,
                top: 8,
                right: 10,
                bottom: 10,
            },
        ];
        let regions = changed_regions(&input, &[], 10, 10).unwrap();
        assert_eq!(regions.len(), 2);
        assert_regions_cover_and_do_not_overlap(&input, &regions, 10, 10);
    }

    #[test]
    fn overlapping_dirty_rectangles_merge_until_the_output_is_disjoint() {
        let input = [
            RECT {
                left: 1,
                top: 1,
                right: 5,
                bottom: 5,
            },
            RECT {
                left: 4,
                top: 2,
                right: 8,
                bottom: 6,
            },
            RECT {
                left: 7,
                top: 4,
                right: 9,
                bottom: 8,
            },
        ];
        let regions = changed_regions(&input, &[], 12, 12).unwrap();
        assert_eq!(regions.len(), 1);
        assert_regions_cover_and_do_not_overlap(&input, &regions, 12, 12);
    }

    #[test]
    fn nearby_regions_use_one_box_when_headers_cost_more_than_extra_pixels() {
        let input = [
            RECT {
                left: 1,
                top: 1,
                right: 3,
                bottom: 3,
            },
            RECT {
                left: 4,
                top: 1,
                right: 6,
                bottom: 3,
            },
        ];
        let regions = changed_regions(&input, &[], 20, 20).unwrap();
        assert_eq!(regions.len(), 1);
        assert_regions_cover_and_do_not_overlap(&input, &regions, 20, 20);
    }

    #[test]
    fn widespread_and_invalid_metadata_fall_back_to_full_frame() {
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
            assert!(changed_regions(&[rect], &[], 100, 100).is_none());
        }
        assert!(changed_regions(&[], &[], 100, 100).is_none());
        assert!(changed_regions(
            &[RECT {
                left: 0,
                top: 0,
                right: 1,
                bottom: 1
            }; MAX_CHANGE_RECTS + 1],
            &[],
            100,
            100
        )
        .is_none());
    }

    #[test]
    fn rect_count_over_wire_limit_uses_one_cost_checked_box() {
        let rects: Vec<_> = (0..MAX_DELTA_RECTS + 1)
            .map(|index| RECT {
                left: (index as i32) * 3,
                top: 0,
                right: (index as i32) * 3 + 1,
                bottom: 1,
            })
            .collect();
        assert_eq!(changed_regions(&rects, &[], 1000, 100).unwrap().len(), 1);
    }

    #[test]
    fn current_texture_patches_reconstruct_scroll_with_overlapping_dirty_pixels() {
        let width = 8usize;
        let height = 5usize;
        let previous: Vec<_> = (0..width * height).collect();
        let mut current = previous.clone();
        let movement = DXGI_OUTDUPL_MOVE_RECT {
            SourcePoint: POINT { x: 0, y: 1 },
            DestinationRect: RECT {
                left: 1,
                top: 2,
                right: 4,
                bottom: 4,
            },
        };
        let dirty = [
            // Newly drawn pixels in the destination must win over an old move.
            RECT {
                left: 2,
                top: 3,
                right: 3,
                bottom: 4,
            },
            RECT {
                left: 7,
                top: 0,
                right: 8,
                bottom: 1,
            },
        ];
        for y in 0..2 {
            let source = (y + 1) * width;
            let destination = (y + 2) * width + 1;
            current[destination..destination + 3].copy_from_slice(&previous[source..source + 3]);
        }
        current[3 * width + 2] = 100;
        current[7] = 200;
        let regions = changed_regions(&dirty, &[movement], width as u32, height as u32).unwrap();
        assert_regions_cover_and_do_not_overlap(
            &[movement.DestinationRect, dirty[0], dirty[1]],
            &regions,
            width as u32,
            height as u32,
        );
        let mut rebuilt = previous;
        for region in regions {
            for y in region.top as usize..region.bottom as usize {
                let row = y * width + region.left as usize..y * width + region.right as usize;
                rebuilt[row.clone()].copy_from_slice(&current[row]);
            }
        }
        assert_eq!(rebuilt, current);
    }

    #[test]
    fn move_only_uses_destination_pixels_and_rejects_out_of_bounds_sources() {
        let mut movement = DXGI_OUTDUPL_MOVE_RECT {
            SourcePoint: POINT { x: 9, y: 4 },
            DestinationRect: RECT {
                left: 3,
                top: 2,
                right: 5,
                bottom: 4,
            },
        };
        assert!(changed_regions(&[], &[movement], 10, 8).is_none());
        movement.SourcePoint.x = 8;
        let regions = changed_regions(&[], &[movement], 10, 8).unwrap();
        assert_eq!(regions.as_slice(), &[movement.DestinationRect]);
    }

    fn assert_regions_cover_and_do_not_overlap(
        input: &[RECT],
        output: &[RECT],
        width: u32,
        height: u32,
    ) {
        for rect in output {
            assert!(rect.left >= 0 && rect.top >= 0);
            assert!(rect.right > rect.left && rect.bottom > rect.top);
            assert!(rect.right as u32 <= width && rect.bottom as u32 <= height);
        }
        for (index, left) in output.iter().enumerate() {
            for right in output.iter().skip(index + 1) {
                assert!(!rectangles_overlap(left, right));
            }
        }
        for y in 0..height as i32 {
            for x in 0..width as i32 {
                let changed = input.iter().any(|rect| {
                    x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
                });
                let transmitted = output.iter().any(|rect| {
                    x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
                });
                assert!(!changed || transmitted, "dirty pixel ({x},{y}) omitted");
            }
        }
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
        let mut multi_rect_frames = 0;
        let mut total_delta_rects = 0;
        let mut cursor_packets = 0;
        let mut bytes = 0;
        let mut raw_equivalent = 0u64;
        let mut sequence = 0;
        let mut dimensions = (0, 0);
        let requested = std::env::var("REMOTEASSIST_CAPTURE_SAMPLES")
            .ok()
            .and_then(|value| value.parse::<usize>().ok());
        let require_frame =
            std::env::var("REMOTEASSIST_CAPTURE_REQUIRE_FRAME").as_deref() == Ok("1");
        let samples = requested.unwrap_or(12).clamp(1, 300);
        let mut response_ms = Vec::with_capacity(samples);
        let mut requests = 0usize;
        let mut request_window_started = None;
        let mut request_window_ended = None;
        let mut empty_frames = 0usize;
        for _ in 0..samples {
            requests += 1;
            let request_started = std::time::Instant::now();
            request_window_started.get_or_insert(request_started);
            let (tx, rx) = mpsc::channel();
            sender
                .try_send(FrameRequest::new(tx, DEFAULT_ACQUIRE_TIMEOUT_MS))
                .unwrap();
            let frame = rx
                .recv_timeout(Duration::from_secs(2))
                .unwrap()
                .expect("frame capture must succeed");
            request_window_ended = Some(std::time::Instant::now());
            response_ms.push(request_started.elapsed().as_secs_f64() * 1000.0);
            if frame.is_empty() {
                empty_frames += 1;
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
                let count = u32::from_le_bytes(frame[24..28].try_into().unwrap()) as usize;
                assert!((1..=MAX_DELTA_RECTS).contains(&count));
                if count > 1 {
                    multi_rect_frames += 1;
                }
                total_delta_rects += count;
                let mut offset = 28usize;
                let mut previous_regions = Vec::with_capacity(count);
                for _ in 0..count {
                    let x = u32::from_le_bytes(frame[offset..offset + 4].try_into().unwrap());
                    let y = u32::from_le_bytes(frame[offset + 4..offset + 8].try_into().unwrap());
                    let w = u32::from_le_bytes(frame[offset + 8..offset + 12].try_into().unwrap());
                    let h = u32::from_le_bytes(frame[offset + 12..offset + 16].try_into().unwrap());
                    offset += 16;
                    assert!(w > 0 && h > 0 && x + w <= width && y + h <= height);
                    let region = RECT {
                        left: x as i32,
                        top: y as i32,
                        right: (x + w) as i32,
                        bottom: (y + h) as i32,
                    };
                    assert!(previous_regions
                        .iter()
                        .all(|other| !rectangles_overlap(other, &region)));
                    previous_regions.push(region);
                    offset += w as usize * h as usize * 4;
                }
                assert_eq!(frame.len(), offset);
                delta_frames += 1;
            }
            sequence = next;
            dimensions = (width, height);
            frames += 1;
            if requested.is_none() && frames == 3 {
                break;
            }
        }
        drop(capture);
        let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
        let request_window_ms = request_window_started
            .zip(request_window_ended)
            .map(|(first, last)| last.duration_since(first).as_secs_f64() * 1000.0)
            .unwrap_or_default();
        let request_rate = if request_window_ms > 0.0 {
            requests as f64 * 1000.0 / request_window_ms
        } else {
            0.0
        };
        let pixel_fps = if request_window_ms > 0.0 {
            frames as f64 * 1000.0 / request_window_ms
        } else {
            0.0
        };
        eprintln!(
            "capture_smoke dimensions={}x{} requests={} frames={} full={} delta={} multi_rect_frames={} total_delta_rects={} cursor={} empty_timeouts={} bytes={} raw_equivalent_bytes={} total_elapsed_ms={:.1} request_window_ms={:.1} request_rate_per_s={:.1} pixel_fps={:.1} dxgi_reply_p50_ms={:.2} dxgi_reply_p95_ms={:.2} dxgi_reply_p99_ms={:.2} dxgi_reply_max_ms={:.2}",
            dimensions.0,
            dimensions.1,
            requests,
            frames,
            full_frames,
            delta_frames,
            multi_rect_frames,
            total_delta_rects,
            cursor_packets,
            empty_frames,
            bytes,
            raw_equivalent,
            elapsed_ms,
            request_window_ms,
            request_rate,
            pixel_fps,
            percentile_ms(&response_ms, 0.50).unwrap_or_default(),
            percentile_ms(&response_ms, 0.95).unwrap_or_default(),
            percentile_ms(&response_ms, 0.99).unwrap_or_default(),
            response_ms.iter().copied().fold(0.0_f64, f64::max)
        );
        if require_frame {
            assert!(
                frames > 0,
                "no pixel frame arrived; cursor_packets={cursor_packets}, empty_timeouts={empty_frames}"
            );
        }
    }
}

#[cfg(test)]
fn percentile_ms(samples: &[f64], fraction: f64) -> Option<f64> {
    if samples.is_empty() || !fraction.is_finite() || !(0.0..=1.0).contains(&fraction) {
        return None;
    }
    let mut ordered = samples.to_vec();
    ordered.sort_by(f64::total_cmp);
    let index = ((ordered.len() as f64 * fraction).ceil() as usize).saturating_sub(1);
    ordered.get(index).copied()
}
struct Desktop {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    duplication: IDXGIOutputDuplication,
    staging: Option<ID3D11Texture2D>,
    dimensions: (u32, u32),
    staging_format: Option<DXGI_FORMAT>,
    sequence: u32,
}

fn staging_needs_rebuild(
    dimensions: (u32, u32),
    format: Option<DXGI_FORMAT>,
    source: &D3D11_TEXTURE2D_DESC,
) -> bool {
    dimensions != (source.Width, source.Height) || format != Some(source.Format)
}
const FULL_V1: u32 = 0x4000_0000;
const DELTA_V1: u32 = 0x8000_0000;
const MAX_CHANGE_RECTS: usize = 256;
const MAX_DELTA_RECTS: usize = 64;
const MAX_DIRTY_COVERAGE_PERCENT: u64 = 60;

fn rectangles_overlap(left: &RECT, right: &RECT) -> bool {
    left.left < right.right
        && left.right > right.left
        && left.top < right.bottom
        && left.bottom > right.top
}

fn merged_bounds(left: &RECT, right: &RECT) -> RECT {
    RECT {
        left: left.left.min(right.left),
        top: left.top.min(right.top),
        right: left.right.max(right.right),
        bottom: left.bottom.max(right.bottom),
    }
}

fn rect_area(rect: &RECT) -> u64 {
    (rect.right - rect.left) as u64 * (rect.bottom - rect.top) as u64
}

fn rect_fits(rect: &RECT, width: u32, height: u32) -> bool {
    rect.left >= 0
        && rect.top >= 0
        && rect.right > rect.left
        && rect.bottom > rect.top
        && rect.right as u32 <= width
        && rect.bottom as u32 <= height
}

/// Plan non-overlapping patches of the current texture. A move changes its
/// destination; any pixels repainted at its old position are in the dirty list.
fn changed_regions(
    dirty: &[RECT],
    moves: &[DXGI_OUTDUPL_MOVE_RECT],
    width: u32,
    height: u32,
) -> Option<Vec<RECT>> {
    let count = dirty.len().checked_add(moves.len())?;
    if !(1..=MAX_CHANGE_RECTS).contains(&count)
        || width == 0
        || height == 0
        || width > i32::MAX as u32
        || height > i32::MAX as u32
    {
        return None;
    }
    if !dirty.iter().all(|rect| rect_fits(rect, width, height)) {
        return None;
    }
    let mut regions = Vec::with_capacity(count);
    regions.extend_from_slice(dirty);
    for movement in moves {
        let destination = movement.DestinationRect;
        let source = movement.SourcePoint;
        if !rect_fits(&destination, width, height)
            || source.x < 0
            || source.y < 0
            || i64::from(source.x) + i64::from(destination.right - destination.left)
                > i64::from(width)
            || i64::from(source.y) + i64::from(destination.bottom - destination.top)
                > i64::from(height)
        {
            return None;
        }
        regions.push(destination);
    }

    // The bounding box of overlapping rectangles is always a safe superset.
    // Restart the scan after each merge because its expanded bounds can overlap
    // regions that were previously disjoint.
    loop {
        let mut merged = false;
        'scan: for index in 0..regions.len() {
            for other in index + 1..regions.len() {
                if rectangles_overlap(&regions[index], &regions[other]) {
                    regions[index] = merged_bounds(&regions[index], &regions[other]);
                    regions.swap_remove(other);
                    merged = true;
                    break 'scan;
                }
            }
        }
        if !merged {
            break;
        }
    }

    let mut bounds = regions[0];
    let mut dirty_area = 0u64;
    for rect in &regions {
        bounds = merged_bounds(&bounds, rect);
        dirty_area += rect_area(rect);
    }
    let screen_area = u64::from(width) * u64::from(height);
    let full_cost = 20u64 + screen_area * 4;
    let bbox_cost = 44u64 + rect_area(&bounds) * 4;
    let multi_cost = 28u64 + (regions.len() as u64) * 16 + dirty_area * 4;

    // Many tiny rectangles cost more headers than a single conservative box.
    // A count above the decoder limit must also use the one-rectangle format.
    if regions.len() > MAX_DELTA_RECTS || bbox_cost <= multi_cost {
        regions.clear();
        regions.push(bounds);
        if bbox_cost >= full_cost
            || rect_area(&bounds) * 100 > screen_area * MAX_DIRTY_COVERAGE_PERCENT
        {
            return None;
        }
        return Some(regions);
    }

    if multi_cost >= full_cost || dirty_area * 100 > screen_area * MAX_DIRTY_COVERAGE_PERCENT {
        return None;
    }
    Some(regions)
}
/// Decode an IEEE-754 binary16 value without adding a runtime dependency.
fn half_to_f32(value: u16) -> f32 {
    let sign = u32::from(value & 0x8000) << 16;
    let exponent = (value >> 10) & 0x1f;
    let fraction = value & 0x03ff;
    let bits = match exponent {
        0 if fraction == 0 => sign,
        0 => {
            let highest = 15 - fraction.leading_zeros() as i32;
            let exponent32 = (highest + 103) as u32;
            let mantissa = u32::from(fraction - (1 << highest)) << (23 - highest);
            sign | (exponent32 << 23) | mantissa
        }
        0x1f => sign | 0x7f80_0000 | (u32::from(fraction) << 13),
        _ => sign | (u32::from(exponent + 112) << 23) | (u32::from(fraction) << 13),
    };
    f32::from_bits(bits)
}

/// scRGB reference white (1.0 linear) maps to 0.9 linear SDR white. Values
/// above reference white use a continuous exponential shoulder into [0.9, 1),
/// then the standard sRGB transfer curve. Negative/non-finite channels become
/// black; alpha is ignored because the remote desktop is opaque.
fn linear_sc_rgb_to_srgb8(value: f32) -> u8 {
    if !value.is_finite() || value <= 0.0 {
        return 0;
    }
    let linear = if value <= 1.0 {
        value * 0.9
    } else {
        0.9 + 0.1 * (1.0 - (-(value - 1.0)).exp())
    };
    let encoded = if linear <= 0.003_130_8 {
        12.92 * linear
    } else {
        1.055 * linear.powf(1.0 / 2.4) - 0.055
    };
    (encoded.mul_add(255.0, 0.5).floor().clamp(0.0, 255.0)) as u8
}

fn hdr_lut() -> &'static [u8; 65_536] {
    static TABLE: std::sync::OnceLock<Box<[u8; 65_536]>> = std::sync::OnceLock::new();
    TABLE.get_or_init(|| {
        Box::new(std::array::from_fn(|value| {
            linear_sc_rgb_to_srgb8(half_to_f32(value as u16))
        }))
    })
}

fn hdr_rgba16_to_bgra8(rgba: [u16; 4]) -> [u8; 4] {
    let table = hdr_lut();
    [
        table[rgba[2] as usize],
        table[rgba[1] as usize],
        table[rgba[0] as usize],
        255,
    ]
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
                        // Prefer BGRA8 when the duplication API can provide it.
                        // HDR outputs may still arrive as R16G16B16A16_FLOAT; copy()
                        // tone-maps that source to the browser's SDR BGRA8 canvas.
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
                            staging_format: None,
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
    fn frame(&mut self, cancelled: &AtomicBool, timeout_ms: u32) -> Result<Vec<u8>, String> {
        unsafe {
            let mut info = DXGI_OUTDUPL_FRAME_INFO::default();
            let mut resource = None;
            if let Err(error) =
                self.duplication
                    .AcquireNextFrame(timeout_ms, &mut info, &mut resource)
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
                Ok(self.header(16))
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
        if std::env::var("REMOTEASSIST_CAPTURE_FORMAT_DEBUG").as_deref() == Ok("1")
            && self.staging_format != Some(desc.Format)
        {
            let output = self.duplication.GetDesc();
            eprintln!(
                "capture_format width={} height={} source_format={} output_format={} sample_count={} rotation={}",
                desc.Width,
                desc.Height,
                desc.Format.0,
                output.ModeDesc.Format.0,
                desc.SampleDesc.Count,
                output.Rotation.0
            );
        }
        if desc.Width == 0
            || desc.Height == 0
            || u64::from(desc.Width) * u64::from(desc.Height) > 33_177_600
        {
            return Err("display_dimensions_unsupported".into());
        }
        // SDR duplication variants are already BGRA8. HDR output is scRGB
        // R16G16B16A16_FLOAT and is tone-mapped to SDR BGRA8 below; unsupported
        // formats still fail closed instead of reinterpreting their bytes.
        let source_bytes_per_pixel = if matches!(
            desc.Format,
            DXGI_FORMAT_B8G8R8A8_UNORM
                | DXGI_FORMAT_B8G8R8A8_UNORM_SRGB
                | DXGI_FORMAT_B8G8R8A8_TYPELESS
        ) {
            4usize
        } else if desc.Format == DXGI_FORMAT_R16G16B16A16_FLOAT {
            8usize
        } else {
            return Err(format!("display_format_unsupported_{}", desc.Format.0));
        };
        let hdr_sc_rgb = source_bytes_per_pixel == 8;
        let layout_changed = staging_needs_rebuild(self.dimensions, self.staging_format, &desc);
        if layout_changed {
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
            self.staging_format = Some(desc.Format);
        }
        // A new source layout requires a full pixel baseline even at the same
        // dimensions; never apply fresh-format damage over the previous image.
        let regions = if layout_changed {
            None
        } else {
            self.changed_region(info, desc.Width, desc.Height)
        };
        let regions = regions.unwrap_or_else(|| {
            vec![RECT {
                left: 0,
                top: 0,
                right: desc.Width as i32,
                bottom: desc.Height as i32,
            }]
        });
        let full = regions.len() == 1
            && regions[0].left == 0
            && regions[0].top == 0
            && regions[0].right as u32 == desc.Width
            && regions[0].bottom as u32 == desc.Height;
        let sequence = self
            .sequence
            .checked_add(1)
            .ok_or("capture_sequence_exhausted")?;
        let staging = self.staging.as_ref().ok_or("capture_buffer_failed")?;
        if full {
            self.context.CopyResource(staging, &texture);
        } else {
            for region in &regions {
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
        }
        let pixel_bytes = regions
            .iter()
            .map(|region| rect_area(region) as usize * 4)
            .sum::<usize>();
        let packet_size = if full { 20 } else { 28 + regions.len() * 16 } + pixel_bytes;
        let mut bytes = self.header(packet_size);
        bytes[0..4]
            .copy_from_slice(&(desc.Width | if full { FULL_V1 } else { DELTA_V1 }).to_le_bytes());
        bytes.extend_from_slice(&sequence.to_le_bytes());
        if !full {
            bytes.extend_from_slice(&self.sequence.to_le_bytes());
            bytes.extend_from_slice(&(regions.len() as u32).to_le_bytes());
        }
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        self.context
            .Map(staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
            .map_err(|_| "capture_map_failed")?;
        if mapped.pData.is_null()
            || (mapped.RowPitch as usize) < desc.Width as usize * source_bytes_per_pixel
        {
            self.context.Unmap(staging, 0);
            return Err("capture_stride_invalid".into());
        }
        for region in &regions {
            let region_width = (region.right - region.left) as usize;
            let region_height = (region.bottom - region.top) as usize;
            let row = region_width * 4;
            if !full {
                for value in [
                    region.left as u32,
                    region.top as u32,
                    region_width as u32,
                    region_height as u32,
                ] {
                    bytes.extend_from_slice(&value.to_le_bytes());
                }
            }
            for y in region.top as usize..region.bottom as usize {
                let source_row = (mapped.pData as *const u8).add(
                    y * mapped.RowPitch as usize + region.left as usize * source_bytes_per_pixel,
                );
                if hdr_sc_rgb {
                    for x in 0..region_width {
                        let pixel = source_row.add(x * 8) as *const u16;
                        let rgba = [
                            u16::from_le(std::ptr::read_unaligned(pixel)),
                            u16::from_le(std::ptr::read_unaligned(pixel.add(1))),
                            u16::from_le(std::ptr::read_unaligned(pixel.add(2))),
                            u16::from_le(std::ptr::read_unaligned(pixel.add(3))),
                        ];
                        bytes.extend_from_slice(&hdr_rgba16_to_bgra8(rgba));
                    }
                } else {
                    bytes.extend_from_slice(std::slice::from_raw_parts(source_row, row));
                }
            }
        }
        self.context.Unmap(staging, 0);
        debug_assert_eq!(bytes.len(), packet_size);
        self.sequence = sequence;
        Ok(bytes)
    }

    unsafe fn changed_region(
        &self,
        info: &DXGI_OUTDUPL_FRAME_INFO,
        width: u32,
        height: u32,
    ) -> Option<Vec<RECT>> {
        let metadata_size = info.TotalMetadataBufferSize as usize;
        if metadata_size == 0
            || metadata_size > MAX_CHANGE_RECTS * std::mem::size_of::<DXGI_OUTDUPL_MOVE_RECT>()
        {
            return None;
        }
        // DXGI supplies a full current desktop texture. Copy its pixels from
        // each move destination, not from the previous frame's source point.
        // This includes any new dirty paint over that destination, with no
        // dependency on order or in-place texture moves in the WebView.
        let mut moves = [DXGI_OUTDUPL_MOVE_RECT::default(); MAX_CHANGE_RECTS];
        let mut move_bytes = 0;
        if self
            .duplication
            .GetFrameMoveRects(
                std::mem::size_of_val(&moves) as u32,
                moves.as_mut_ptr(),
                &mut move_bytes,
            )
            .is_err()
            || move_bytes as usize > std::mem::size_of_val(&moves)
            || move_bytes as usize % std::mem::size_of::<DXGI_OUTDUPL_MOVE_RECT>() != 0
        {
            return None;
        }
        let mut dirty = [RECT::default(); MAX_CHANGE_RECTS];
        let mut dirty_bytes = 0;
        if self
            .duplication
            .GetFrameDirtyRects(
                std::mem::size_of_val(&dirty) as u32,
                dirty.as_mut_ptr(),
                &mut dirty_bytes,
            )
            .is_err()
            || dirty_bytes as usize > std::mem::size_of_val(&dirty)
            || dirty_bytes as usize % std::mem::size_of::<RECT>() != 0
            || move_bytes as usize + dirty_bytes as usize > metadata_size
        {
            return None;
        }
        changed_regions(
            &dirty[..dirty_bytes as usize / std::mem::size_of::<RECT>()],
            &moves[..move_bytes as usize / std::mem::size_of::<DXGI_OUTDUPL_MOVE_RECT>()],
            width,
            height,
        )
    }

    unsafe fn header(&self, capacity: usize) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(capacity);
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
