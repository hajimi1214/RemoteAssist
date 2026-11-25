import assert from "node:assert/strict";
import test from "node:test";
import { PRESENTATION_WINDOW_SAMPLES, VideoPresentationWindow } from "./videoPresentation.ts";

test("presentation callback samples report cadence and a bounded tail distribution", () => {
  const window = new VideoPresentationWindow();
  let sample;
  for (let frame = 0; frame < 10; frame++) sample = window.add(frame * 16, frame + 1) ?? sample;
  assert.deepEqual(sample, {
    samples: 9, presentedFrames: 9, fps: 62.5,
    intervalP50Ms: 16, intervalP95Ms: 16
  });
  for (let frame = 10; frame < 25; frame++) sample = window.add(frame * 16, frame + 1) ?? sample;
  assert.equal(sample.samples,9,"summary work is throttled to at most four updates per second");
  sample = window.add(400,26);
  assert.equal(sample?.samples,25);
});

test("presentation counters reset, stale samples, and malformed callbacks do not invent measurements", () => {
  const window = new VideoPresentationWindow();
  assert.equal(window.add(Number.NaN, 1), undefined);
  assert.equal(window.add(0, 0), undefined);
  for (let frame = 0; frame < 10; frame++) window.add(frame * 16, frame + 1);
  assert.equal(window.add(160, 10), undefined);
  for (let frame = 0; frame < 10; frame++) window.add(1000 + frame * 16, frame + 1);
  assert.equal(window.add(1160, 11)?.fps, 62.5);
  window.reset();
  assert.equal(window.add(2000, 1), undefined);
});

test("presentation window stays bounded and drops measurements after callbacks stop", () => {
  const window = new VideoPresentationWindow();
  let sample;
  for (let frame = 0; frame < 500; frame++) sample = window.add(frame * 4, frame + 1) ?? sample;
  assert.ok(sample);
  assert.ok(sample.samples <= 300);
  assert.ok(sample.intervalP99Ms != null && sample.intervalMaxMs != null);
  assert.equal(window.add(5000, 501), undefined);
});

test("presentation sample storage reclaims expired entries during long sessions", () => {
  const window = new VideoPresentationWindow();
  for (let frame = 0; frame < 20_000; frame++) {
    window.add(frame * 16, frame + 1);
  }
  const retained = window as unknown as { samples: Array<{ at: number }>; firstSample: number };
  assert.ok(retained.samples.length - retained.firstSample <= PRESENTATION_WINDOW_SAMPLES);
  assert.ok(retained.samples.length <= PRESENTATION_WINDOW_SAMPLES * 2);
});
