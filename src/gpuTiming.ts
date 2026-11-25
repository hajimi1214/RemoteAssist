export const GPU_QUERY_SAMPLE_INTERVAL = 30;
export const GPU_QUERY_PENDING_LIMIT = 8;
const MAX_GPU_QUERY_MS = 1_000;

type GpuQuery = object;

export interface DisjointTimerQueryExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
  QUERY_RESULT_AVAILABLE_EXT: number;
  QUERY_RESULT_EXT: number;
  createQueryEXT(): GpuQuery | null;
  beginQueryEXT(target: number, query: GpuQuery): void;
  endQueryEXT(target: number): void;
  getQueryObjectEXT(query: GpuQuery, parameter: number): boolean | number;
  deleteQueryEXT(query: GpuQuery): void;
}

/** Samples WebGL GPU work asynchronously. It never waits for a query result. */
export class AsyncGpuTimer {
  private eligibleFrames = 0;
  private activeQuery: GpuQuery | undefined;
  private pendingQueries: GpuQuery[] = [];
  private disabled = false;
  private readonly gl: WebGLRenderingContext;
  private readonly extension: DisjointTimerQueryExtension;
  private readonly sampleInterval: number;
  private readonly pendingLimit: number;

  constructor(
    gl: WebGLRenderingContext,
    extension: DisjointTimerQueryExtension,
    sampleInterval = GPU_QUERY_SAMPLE_INTERVAL,
    pendingLimit = GPU_QUERY_PENDING_LIMIT,
  ) {
    this.gl = gl;
    this.extension = extension;
    this.sampleInterval = sampleInterval;
    this.pendingLimit = pendingLimit;
  }

  begin(): GpuQuery | undefined {
    if (this.disabled || this.activeQuery) return undefined;
    this.eligibleFrames++;
    if (this.eligibleFrames % this.sampleInterval !== 0 || this.pendingQueries.length >= this.pendingLimit) return undefined;

    let query: GpuQuery | null = null;
    try {
      query = this.extension.createQueryEXT();
      if (!query) {
        this.disable();
        return undefined;
      }
      this.extension.beginQueryEXT(this.extension.TIME_ELAPSED_EXT, query);
      this.activeQuery = query;
      return query;
    } catch {
      if (query) this.deleteQuery(query);
      this.disable();
      return undefined;
    }
  }

  end(query: GpuQuery | undefined): void {
    if (!query || query !== this.activeQuery || this.disabled) return;
    try {
      this.extension.endQueryEXT(this.extension.TIME_ELAPSED_EXT);
      this.pendingQueries.push(query);
      this.activeQuery = undefined;
    } catch {
      this.disable();
    }
  }

  collect(): number[] {
    if (this.disabled || this.pendingQueries.length === 0) return [];
    try {
      const availableQueries = new Set(this.pendingQueries.filter(query =>
        this.extension.getQueryObjectEXT(query, this.extension.QUERY_RESULT_AVAILABLE_EXT) === true));
      if (availableQueries.size === 0) return [];
      if (this.gl.getParameter(this.extension.GPU_DISJOINT_EXT) === true) {
        this.clearPending();
        return [];
      }
      const remaining: GpuQuery[] = [];
      const measurements: number[] = [];
      for (const query of this.pendingQueries) {
        if (!availableQueries.has(query)) {
          remaining.push(query);
          continue;
        }
        const nanoseconds = this.extension.getQueryObjectEXT(query, this.extension.QUERY_RESULT_EXT);
        if (typeof nanoseconds === "number" && Number.isFinite(nanoseconds)
          && nanoseconds >= 0 && nanoseconds <= MAX_GPU_QUERY_MS * 1_000_000) {
          measurements.push(nanoseconds / 1_000_000);
        }
        this.deleteQuery(query);
      }
      this.pendingQueries = remaining;
      return measurements;
    } catch {
      this.disable();
      return [];
    }
  }

  stop(): void {
    this.disabled = true;
    if (this.activeQuery) {
      try { this.extension.endQueryEXT(this.extension.TIME_ELAPSED_EXT); } catch { /* Context may already be lost. */ }
      this.deleteQuery(this.activeQuery);
      this.activeQuery = undefined;
    }
    this.clearPending();
  }

  private disable(): void {
    this.disabled = true;
    if (this.activeQuery) {
      try { this.extension.endQueryEXT(this.extension.TIME_ELAPSED_EXT); } catch { /* The extension may already be lost. */ }
      this.deleteQuery(this.activeQuery);
      this.activeQuery = undefined;
    }
    this.clearPending();
  }

  private clearPending(): void {
    for (const query of this.pendingQueries) this.deleteQuery(query);
    this.pendingQueries = [];
  }

  private deleteQuery(query: GpuQuery): void {
    try { this.extension.deleteQueryEXT(query); } catch { /* Ignore cleanup errors during context loss. */ }
  }
}

export function createAsyncGpuTimer(gl: WebGLRenderingContext): AsyncGpuTimer | undefined {
  try {
    const extension = gl.getExtension("EXT_disjoint_timer_query") as unknown as DisjointTimerQueryExtension | null;
    return extension ? new AsyncGpuTimer(gl, extension) : undefined;
  } catch {
    return undefined;
  }
}
