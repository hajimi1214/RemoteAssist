# Windows capture and viewer, 0.14 alpha

## What changed

- DXGI move destinations and dirty rectangles can share one bounded patch packet. Pixels come from the current D3D texture, including any new drawing over a moved region. Missing or invalid metadata, too many rectangles, and broad updates retain the full-frame fallback. The native packet is allocated before mapping the staging texture. The packet format, session authorization and signaling are unchanged.
- The WebGL renderer draws only changed rectangles and the old/new cursor footprints when the drawing buffer is preserved and floating-point precision is adequate. It redraws the whole canvas on a full packet, resize, or unsupported context. The capture track requests a frame before the draw; an explicit first draw after attachment also covers an idle desktop.
- Once WebRTC has successfully applied sender settings, the native capture loop follows the accepted frame-rate ceiling, up to 60 fps. It keeps one pending pull and does not skip intermediate delta packets. This saves unnecessary capture work under reduced profiles; it is not a measurement of end-to-end FPS.
- The viewer separates picture, input and connection tools. Pause, fullscreen and disconnect remain in the fixed-size toolbar. Opening or dismissing the tools does not forward desktop clicks, and the connection page exposes codec, decoded size, receive timing, FPS and loss where available.

## Open-source references

| Source | Finding |
| --- | --- |
| [RustDesk video service](https://github.com/rustdesk/rustdesk/blob/master/src/server/video_service.rs), [AGPL-3.0 license](https://github.com/rustdesk/rustdesk/blob/master/LICENCE) | Its capture service inspects whether the encoder accepts a GPU texture and has distinct video-memory and fallback paths. That is a useful reference for a future texture-to-hardware-encoder experiment. This release still uses WebView WebRTC encoding. |
| [Sunshine Windows VRAM capture](https://github.com/LizardByte/Sunshine/blob/master/src/platform/windows/display_vram.cpp), [GPL-3.0 license](https://github.com/LizardByte/Sunshine/blob/master/LICENSE) | Its D3D11 path has GPU shaders for YUV conversion. The design illustrates keeping color conversion near the texture and encoder; 0.14 instead reduces the work of its existing BGRA path. |
| [Desktop Duplication](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api), [DXGI move rectangle](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_2/ns-dxgi1_2-dxgi_outdupl_move_rect) | The acquired surface contains the current desktop. Reading pixels at move destinations plus dirty regions makes the patch self-contained relative to its existing baseline without in-place GPU copy hazards. |
| [OpenCV dnn_superres](https://github.com/opencv/opencv_contrib/tree/4.x/modules/dnn_superres), [FSRCNN paper](https://arxiv.org/abs/1608.00367), [FSRCNN reference implementation and weights](https://github.com/Saafke/FSRCNN_Tensorflow) | The x2 reference weights were evaluated offline. The FSRCNN repository includes an Apache-2.0 license. The OpenCV 4.11 test runtime is Apache-2.0; the Python wheel's packaging scripts are MIT, with bundled notices in the local installation. |

The reviewed source files, licenses, model and test runtime are in the ignored `.local/research/desktop-0.14/` directory. No RustDesk or Sunshine source was copied into the product. The model and its runtime are also excluded from the installers.

## Offline neural upscaling experiment

The [benchmark](../scripts/benchmark-superres.py) generates colored text, table rows and lines at twice the input resolution, downsamples with area interpolation, and compares bicubic and FSRCNN x2 against the generated reference. Runs used an AMD Ryzen 7 8845H, OpenCV 4.11.0, four CPU threads, one warm-up and ten timed calls per method. OpenCL was disabled; no real desktop frames were read. The x2 weight SHA-256 was `366b33f0084c7b3f2bf6724f0a2c77bca94fcec9d7b6d72389d330073b380d5c`.

| Input | Bicubic median / p95 | FSRCNN median / p95 | PSNR, bicubic / FSRCNN |
| --- | ---: | ---: | ---: |
| 320×180 | 0.18 / 0.55 ms | 63.51 / 67.99 ms | 22.19 / 23.17 dB |
| 640×360 | 0.85 / 1.02 ms | 253.52 / 264.57 ms | 21.20 / 21.99 dB |
| 1280×720 | 4.22 / 4.92 ms | 1064.75 / 1295.22 ms | 20.77 / 21.53 dB |

Higher PSNR means smaller pixel error on this synthetic pattern, not proven improvement in reading text, codec artifacts or video. A 60 fps stream has 16.7 ms for a whole frame. The tested inference path does not fit that budget, even at the smallest size. An experimental receiver-side GPU implementation should be compared against native scaling on text and moving content, with its own latency and drop measurements before it is enabled.

To reproduce with the local model and environment:

```powershell
$env:PYTHONPATH = (Resolve-Path .local/research/desktop-0.14/python4).Path
python scripts/benchmark-superres.py .local/research/desktop-0.14/FSRCNN_x2.pb --samples 10 --threads 4
```

Use a Python environment with NumPy and `opencv-contrib-python-headless==4.11.0.86`. OpenCV 5.1.0 could not load this legacy TensorFlow graph in the same test.

## Verification

- PASS: 82 frontend tests and production build, Go test/build/vet, Rust check and 19 Rust tests (one operator-only desktop smoke ignored).
- PASS: browser WebGL/Canvas synthetic fixture, with real track frame callbacks and sampled exact RGBA pixels for initial paint, a patch, a moved cursor and a hidden cursor. In a 500 ms window, changing the capture ceiling from 60 to 15 changed the mock IPC pull count from 30 to 6. This count does not represent decoded FPS.
- PASS: viewer fixture at desktop, 393×820 portrait and 740×360 landscape. Controls kept 44×44 hit areas, panel scroll stayed internal, and dismissing the panel emitted no remote clicks. Windows x64 portable and NSIS builds identify as 0.14.0-alpha.
- NOT VERIFIED: 0.14 hardware capture of real moves, sustained 4K60, impact on end-to-end latency, different Windows GPUs, or measured superiority to UU.
