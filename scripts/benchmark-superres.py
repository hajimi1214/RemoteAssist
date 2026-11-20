"""Offline FSRCNN x2 comparison on generated desktop patterns. No capture or network I/O."""

import argparse
import json
from pathlib import Path
from time import perf_counter

import cv2
import numpy as np


def desktop_pattern(width, height):
    reference = np.full((height, width, 3), (248, 246, 243), dtype=np.uint8)
    cv2.rectangle(reference, (0, 0), (width - 1, 34), (58, 49, 37), -1)
    cv2.putText(reference, "Remote desktop   0123456789", (12, 23), cv2.FONT_HERSHEY_SIMPLEX,
                0.6, (240, 240, 240), 1, cv2.LINE_AA)
    for row, y in enumerate(range(55, height - 5, 19)):
        cv2.line(reference, (8, y + 5), (width - 9, y + 5), (222, 217, 209), 1)
        for column, x in enumerate(range(16, width - 100, 131)):
            cv2.putText(reference, f"{row + 1:02d}  {column * 3.17:.2f}  Abc", (x, y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.37 + 0.06 * (row % 3),
                        (100 - 25 * (column % 3), 48, 27), 1, cv2.LINE_AA)
    return reference


def timed(transform, count):
    transform()
    durations = []
    for _ in range(count):
        start = perf_counter()
        out = transform()
        durations.append((perf_counter() - start) * 1000)
    return out, {"median_ms": round(float(np.median(durations)), 2),
                 "p95_ms": round(float(np.percentile(durations, 95)), 2)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path, help="Local OpenCV-compatible FSRCNN_x2.pb file")
    parser.add_argument("--samples", type=int, default=15)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    if not 5 <= args.samples <= 100 or not 1 <= args.threads <= 16:
        parser.error("use 5-100 samples and 1-16 threads")
    cv2.setNumThreads(args.threads)
    cv2.ocl.setUseOpenCL(False)
    model = cv2.dnn_superres.DnnSuperResImpl_create()
    model.readModel(str(args.model.resolve()))
    model.setModel("fsrcnn", 2)
    for width, height in ((320, 180), (640, 360), (1280, 720)):
        reference = desktop_pattern(width * 2, height * 2)
        source = cv2.resize(reference, (width, height), interpolation=cv2.INTER_AREA)
        methods = {"bicubic": lambda: cv2.resize(source, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC),
                   "fsrcnn_x2": lambda: model.upsample(source)}
        for name, transform in methods.items():
            out, timing = timed(transform, args.samples)
            assert out.shape == reference.shape
            print(json.dumps({"input": f"{width}x{height}", "method": name, "opencv": cv2.__version__,
                              "samples": args.samples, "threads": args.threads, **timing,
                              "psnr_db": round(cv2.PSNR(reference, out), 2)}), flush=True)


if __name__ == "__main__":
    main()
