/** Shares CPU, operation and upload budgets across overview construction and texture streaming.
 * Budgets use demand-driven 16ms windows, including in workers without animation frames.
 * All budget options must be positive and finite; invalid values throw RangeError.
 * CPU limits are cooperative: a single bounded tile operation may overrun the time budget.
 */
export function createPageWork(
  options: {
    cpuMs?: number;
    operations?: number;
    uploadBytes?: number;
    windowMs?: number;
    now?: () => number;
    wait?: (ms: number) => Promise<void>;
  } = {}
) {
  const {
    cpuMs = 4,
    operations = 64,
    uploadBytes = 4 * 258 * 258 * 4,
    windowMs = 16,
    now = () => performance.now(),
    wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
  } = options;
  if ([cpuMs, operations, uploadBytes, windowMs].some((value) => !Number.isFinite(value) || value <= 0))
    throw new RangeError('Page work budgets must be positive finite numbers.');
  let start = now(),
    cpu = 0,
    jobs = 0,
    bytes = 0,
    yields = 0,
    disposed = false;
  let peakCpu = 0,
    peakJobs = 0,
    peakBytes = 0;
  let continuation: Promise<void> | undefined;
  let active = 0;
  const slots: (() => void)[] = [];
  const check = (valid: () => boolean) => {
    if (disposed || !valid()) throw new ObsoletePageError();
  };
  return {
    /** Executes one synchronous tile operation after reserving its budget. Never charge I/O wait time. */
    async run<T>(operation: () => T, valid: () => boolean = () => true, upload = 0): Promise<T> {
      check(valid);
      for (;;) {
        if (now() - start >= windowMs) {
          start = now();
          cpu = 0;
          jobs = 0;
          bytes = 0;
        }
        // Permit one oversized upload in an otherwise empty window so custom budgets cannot deadlock.
        if (jobs < operations && cpu < cpuMs && (bytes === 0 || bytes + upload <= uploadBytes)) break;
        if (!continuation) {
          yields++;
          continuation = wait(Math.max(0, start + windowMs - now())).finally(() => {
            continuation = undefined;
          });
        }
        await continuation;
        check(valid);
      }
      jobs++;
      bytes += upload;
      const before = now();
      try {
        return operation();
      } finally {
        cpu += now() - before;
        peakCpu = Math.max(peakCpu, cpu);
        peakJobs = Math.max(peakJobs, jobs);
        peakBytes = Math.max(peakBytes, bytes);
      }
    },
    /** At most two page preparations retain intermediate pixels, including explicit overview updates. */
    async task<T>(operation: () => Promise<T>, valid: () => boolean): Promise<T> {
      check(valid);
      if (active >= 2) await new Promise<void>((resolve) => slots.push(resolve));
      else active++;
      try {
        check(valid);
        return await operation();
      } finally {
        const next = slots.shift();
        if (next) next();
        else active--;
      }
    },
    stats: () => ({
      workYields: yields,
      peakWorkCpuMs: peakCpu,
      peakWorkOperations: peakJobs,
      peakUploadBytes: peakBytes,
      activePageJobs: active
    }),
    /** Waiting callers wake at the next budget window or released slot, then reject without publishing. */
    dispose() {
      disposed = true;
    }
  };
}

/** Expected cancellation of derived page work after a newer view/version or disposal.
 * Catch by type, never by its human-readable message; source pixels remain unchanged.
 */
export class ObsoletePageError extends Error {
  constructor() {
    super('Obsolete virtual page');
    this.name = 'ObsoletePageError';
  }
}
