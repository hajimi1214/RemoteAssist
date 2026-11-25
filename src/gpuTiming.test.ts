import assert from "node:assert/strict";
import test from "node:test";
import { AsyncGpuTimer, createAsyncGpuTimer } from "./gpuTiming.ts";
import type { DisjointTimerQueryExtension } from "./gpuTiming.ts";

type TestQuery = { available: boolean; nanoseconds: number };

function timerHarness() {
  const queries: TestQuery[] = [];
  const deleted: TestQuery[] = [];
  const state = { disjoint: false, checks: 0 };
  const extension: DisjointTimerQueryExtension = {
    TIME_ELAPSED_EXT: 1,
    GPU_DISJOINT_EXT: 2,
    QUERY_RESULT_AVAILABLE_EXT: 3,
    QUERY_RESULT_EXT: 4,
    createQueryEXT: () => {
      const query = { available: false, nanoseconds: 0 };
      queries.push(query);
      return query;
    },
    beginQueryEXT: () => undefined,
    endQueryEXT: () => undefined,
    getQueryObjectEXT: (query, parameter) => parameter === extension.QUERY_RESULT_AVAILABLE_EXT
      ? (query as TestQuery).available
      : (query as TestQuery).nanoseconds,
    deleteQueryEXT: query => { deleted.push(query as TestQuery); },
  };
  const gl = { getParameter: () => { state.checks++; return state.disjoint; } } as unknown as WebGLRenderingContext;
  return { timer: (interval = 1, limit = 8) => new AsyncGpuTimer(gl, extension, interval, limit), queries, deleted, state };
}

test("GPU timer samples intermittently and reads only completed queries", () => {
  const harness = timerHarness();
  const timer = harness.timer(2);
  assert.equal(timer.begin(), undefined);
  const query = timer.begin() as TestQuery;
  timer.end(query);

  assert.deepEqual(timer.collect(), []);
  assert.equal(harness.state.checks, 0,"pending GPU queries must be polled without reading a blocking parameter");
  assert.equal(harness.deleted.length, 0);
  query.available = true;
  query.nanoseconds = 1_750_000;
  assert.deepEqual(timer.collect(), [1.75]);
  assert.equal(harness.state.checks, 1);
  assert.deepEqual(harness.deleted, [query]);
});

test("GPU timer bounds pending work and drops disjoint measurements", () => {
  const harness = timerHarness();
  const timer = harness.timer(1, 1);
  const query = timer.begin() as TestQuery;
  timer.end(query);
  assert.equal(timer.begin(), undefined);
  query.available = true;
  query.nanoseconds = 2_000_000;
  harness.state.disjoint = true;
  assert.deepEqual(timer.collect(), []);
  assert.deepEqual(harness.deleted, [query]);
  harness.state.disjoint = false;
  const next = timer.begin();
  assert.ok(next);
  timer.stop();
  assert.equal(harness.deleted.length, 2);
});

test("unavailable GPU timer extensions leave capture enabled", () => {
  const unavailable = { getExtension: () => null } as unknown as WebGLRenderingContext;
  assert.equal(createAsyncGpuTimer(unavailable), undefined);
  const throwing = { getExtension: () => { throw new Error("extension query failed"); } } as unknown as WebGLRenderingContext;
  assert.equal(createAsyncGpuTimer(throwing), undefined);
});

test("GPU timer creation failure deletes the partial query and disables instrumentation", () => {
  const harness = timerHarness();
  const extension: DisjointTimerQueryExtension = {
    TIME_ELAPSED_EXT: 1,
    GPU_DISJOINT_EXT: 2,
    QUERY_RESULT_AVAILABLE_EXT: 3,
    QUERY_RESULT_EXT: 4,
    createQueryEXT: () => {
      const query = { available: false, nanoseconds: 0 };
      harness.queries.push(query);
      return query;
    },
    beginQueryEXT: () => { throw new Error("query unavailable"); },
    endQueryEXT: () => undefined,
    getQueryObjectEXT: () => false,
    deleteQueryEXT: (query: object) => { harness.deleted.push(query as TestQuery); },
  };
  const timer = new AsyncGpuTimer(
    { getParameter: () => false } as unknown as WebGLRenderingContext,
    extension,
    1,
  );

  assert.equal(timer.begin(), undefined);
  assert.equal(timer.begin(), undefined);
  assert.deepEqual(harness.deleted, [harness.queries[0]]);
});
