import { frameCost, summarizeFrameCosts, type FrameCostSample } from './makeFrameCostHistory';

/**
 * Creates a page's registry of frame-cost monitors and the report API over it. An app typically creates one at module
 * level, installs `{ report, reset }` on `window` for in-page automation such as Playwright, and forwards dev-server
 * requests to it with `answerPerformanceRequests`.
 */
export function makePerformanceReports() {
  const monitors = new Set<PerformanceMonitorSource>();

  return {
    /** Adds a mounted monitor to reports and returns its removal. */
    register(monitor: PerformanceMonitorSource) {
      monitors.add(monitor);

      return () => {
        monitors.delete(monitor);
      };
    },

    /** Describes every registered monitor's recorded frames; `samples` adds the per-frame records. */
    report(options: { samples?: boolean } = {}): PerformanceReport {
      return {
        url: location.href,
        budgetMs: round(budgetMs),
        monitors: [...monitors].map((monitor) => describeMonitor(monitor, options.samples ?? false))
      };
    },

    /** Forgets recorded frames in every monitor, to measure only what happens next. */
    reset() {
      monitors.forEach((monitor) => monitor.reset());
    }
  };
}

/** A page's monitor registry and report API. */
export type PerformanceReports = ReturnType<typeof makePerformanceReports>;

/** What a mounted monitor contributes to reports. Read whenever a report is requested. */
export type PerformanceMonitorSource = {
  /** Distinguishes monitors on one page, such as split-view panes. */
  label: () => string;
  /** Recorded frames, oldest first. */
  samples: () => readonly FrameCostSample[];
  /** Whether the monitored loop has stopped drawing. */
  idle: () => boolean;
  /** Canvas size in device pixels and the device pixel ratio. */
  canvas: () => { width: number; height: number; dpr: number };
  /** Forgets recorded frames. */
  reset: () => void;
};

/** A page's frame-cost report; JSON-serializable. */
export type PerformanceReport = {
  url: string;
  /** Frame budget used for `overBudget`, in milliseconds: 60 Hz. */
  budgetMs: number;
  monitors: MonitorReport[];
};

/**
 * One monitor's recorded frames, summarized; milliseconds are rounded to 0.01. Absent values are null rather than
 * omitted, so every report has the same keys: statistics without frames, and frame rate after idle.
 */
export type MonitorReport = {
  label: string;
  canvas: { width: number; height: number; dpr: number };
  /** Whether the loop has stopped drawing; single on-demand frames leave it idle between them. */
  idle: boolean;
  /** Recorded frames, up to the monitor's capacity. */
  frames: number;
  /** Milliseconds from the first to the last recorded frame's start. */
  spanMs: number;
  /** Frame rate of the trailing back-to-back frames; null when the latest frame followed idle. */
  fps: number | null;
  /** Main-thread milliseconds from frame start to submission. */
  cpuMs: Distribution | null;
  /** Milliseconds from submission to GPU completion, over frames whose GPU work has finished. */
  gpuMs: Distribution | null;
  /** CPU plus GPU milliseconds per frame. */
  totalMs: Distribution | null;
  /** Frames whose total exceeded `budgetMs`. */
  overBudget: number;
  /** Per-frame records, oldest first, when requested. Unknown GPU times and intervals are omitted. */
  samples?: readonly FrameCostSample[];
};

/** Summary statistics of a set of millisecond values. */
export type Distribution = { mean: number; p50: number; p95: number; max: number };

/** Summarizes one monitor for a report. */
export function describeMonitor(monitor: PerformanceMonitorSource, includeSamples: boolean): MonitorReport {
  const samples = monitor.samples();
  const totals = samples.map(frameCost);
  const fps = summarizeFrameCosts(samples).fps;

  return {
    label: monitor.label(),
    canvas: monitor.canvas(),
    idle: monitor.idle(),
    frames: samples.length,
    spanMs: round(samples.length > 0 ? samples.at(-1)!.timestamp - samples[0]!.timestamp : 0),
    fps: fps === undefined ? null : round(fps),
    cpuMs: distribution(samples.map((sample) => sample.cpuMs)),
    gpuMs: distribution(samples.flatMap((sample) => (sample.gpuMs === undefined ? [] : [sample.gpuMs]))),
    totalMs: distribution(totals),
    overBudget: totals.filter((total) => total > budgetMs).length,
    ...(includeSamples ? { samples: samples.map(roundSample) } : {})
  };
}

/**
 * Answers a dev server's report requests arriving over Vite's HMR websocket and returns the unsubscription; call it
 * from `import.meta.hot.dispose` so a replaced module stops answering. Listens for `<channel>:request` with
 * `{ id, samples }`, replying `<channel>:report` with `{ id, report }`, and for `<channel>:reset`. The dev server's
 * bridge plugin uses the same channel.
 */
export function answerPerformanceRequests(
  hot: PerformanceHot,
  reports: Pick<PerformanceReports, 'report' | 'reset'>,
  channel: string
) {
  const answer = ({ id, samples }: { id: string; samples: boolean }) =>
    hot.send(`${channel}:report`, { id, report: reports.report({ samples }) });
  const reset = () => reports.reset();

  hot.on(`${channel}:request`, answer);
  hot.on(`${channel}:reset`, reset);

  return () => {
    hot.off(`${channel}:request`, answer);
    hot.off(`${channel}:reset`, reset);
  };
}

/** The part of Vite's `import.meta.hot` the responder uses. */
export type PerformanceHot = {
  on(event: string, listener: (payload: any) => void): void;
  off(event: string, listener: (payload: any) => void): void;
  send(event: string, payload?: unknown): void;
};

const budgetMs = 1000 / 60;

/** Nearest-rank percentiles; null for no values. */
function distribution(values: readonly number[]): Distribution | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;

  return {
    mean: round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
    p50: round(percentile(50)),
    p95: round(percentile(95)),
    max: round(sorted.at(-1)!)
  };
}

/** Copies a sample with rounded milliseconds, omitting unknown fields. */
function roundSample({ timestamp, cpuMs, gpuMs, intervalMs }: FrameCostSample): FrameCostSample {
  return {
    timestamp: round(timestamp),
    cpuMs: round(cpuMs),
    ...(gpuMs === undefined ? {} : { gpuMs: round(gpuMs) }),
    ...(intervalMs === undefined ? {} : { intervalMs: round(intervalMs) })
  };
}

/** Rounds milliseconds to 0.01, below timer resolution in browsers. */
function round(ms: number) {
  return Math.round(ms * 100) / 100;
}
