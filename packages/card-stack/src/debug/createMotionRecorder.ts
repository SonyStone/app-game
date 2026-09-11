import { createRAF } from '@solid-primitives/raf';
import { createSignal, onCleanup, untrack } from 'solid-js';

/**
 * Records detached, JSON-serializable samples under a Solid owner. Starts idle.
 * Keeps a configurable rolling window, defaulting to five seconds; exposes UI counts
 * at most four times a second. Sampling reads DOM during RAF, not presented pixels.
 * `read` must return a fresh snapshot, or undefined when the target is unavailable.
 * Starting again discards the previous capture. Freeze and disposal stop the RAF.
 */
export function createMotionRecorder<Frame, Event>(read: () => Frame | undefined) {
  const [status, setStatus] = createSignal<'idle' | 'scheduled' | 'recording' | 'captured'>('idle');
  const [countdown, setCountdown] = createSignal(0);
  const [summary, setSummary] = createSignal({ samples: 0, duration: 0, events: 0 });
  const [capture, setCapture] = createSignal<MotionCapture<Frame, Event>>();
  const [preview, setPreview] = createSignal<MotionCapture<Frame, Event>['frames']>([]);
  const [previewEvents, setPreviewEvents] = createSignal<MotionCapture<Frame, Event>['events']>([]);
  let frames: MotionCapture<Frame, Event>['frames'] = [];
  let events: MotionCapture<Frame, Event>['events'] = [];
  let started = 0;
  let startedAt = '';
  let publishedAt = 0;
  let disposed = false;
  // Commands can run before Solid commits the status signal, including an empty start.
  let recording = false;
  let scheduled = false;
  let scheduledAt = 0;
  let options = { durationMs: 5_000, delayMs: 0, autoStop: false };
  const [, run, stop] = createRAF(() => {
    if (scheduled) {
      const remaining = Math.max(0, scheduledAt - performance.now());
      setCountdown(Math.ceil(remaining / 1000));
      if (remaining === 0) begin();
    } else if (recording) {
      if (atDeadline()) freeze('duration-limit');
      else if (!sample('raf')) freeze('target-unavailable');
    }
  });
  onCleanup(() => {
    disposed = true;
    scheduled = false;
    recording = false;
    frames = [];
    events = [];
  });

  return { status, countdown, summary, capture, preview, previewEvents, start, freeze, mark };

  /** Snapshots options for this take. A cancelled delay preserves the previous capture. */
  function start(settings: MotionRecordingOptions = {}) {
    if (disposed || recording || scheduled) return;
    options = {
      durationMs: boundedMs(settings.durationMs, 5_000, 1_000),
      delayMs: boundedMs(settings.delayMs, 0, 0),
      autoStop: settings.autoStop ?? false
    };
    if (options.delayMs > 0) {
      scheduled = true;
      scheduledAt = performance.now() + options.delayMs;
      setCountdown(Math.ceil(options.delayMs / 1000));
      setStatus('scheduled');
    } else begin();
    if (scheduled || recording) untrack(run);
  }

  function begin() {
    scheduled = false;
    setCountdown(0);
    recording = true;
    frames = [];
    events = [];
    started = performance.now();
    startedAt = new Date().toISOString();
    publishedAt = -Infinity;
    setCapture(undefined);
    setStatus('recording');
    if (!sample('start')) freeze('target-unavailable');
  }

  /** Stops observation and preserves the last window without pausing the application. */
  function freeze(reason = 'manual') {
    if (disposed) return;
    if (scheduled) {
      scheduled = false;
      untrack(stop);
      setCountdown(0);
      setStatus(untrack(capture) ? 'captured' : 'idle');
      return;
    }
    if (!recording) return;
    recording = false;
    untrack(stop);
    // Never label a late DOM read as an on-time sample, or trim the start of an auto-stopped take.
    if (!atDeadline()) sample('capture');
    publish();
    setCapture({
      schemaVersion: 1,
      startedAt,
      timeOrigin: performance.timeOrigin,
      startedAtPerformanceMs: started,
      windowMs: options.durationMs,
      recordingOptions: { ...options },
      reason,
      frames: [...frames],
      events: [...events]
    });
    setStatus('captured');
  }

  /** Adds detached event data using the same monotonic clock as the samples. */
  function mark(data: Event) {
    if (disposed || !recording) return;
    if (atDeadline()) { freeze('duration-limit'); return; }
    const t = performance.now() - started;
    events.push({ t, data });
    trim(events, t, Math.ceil(options.durationMs / 1000 * 480));
  }

  function sample(source: 'start' | 'raf' | 'capture') {
    const t = performance.now() - started;
    const data = untrack(read);
    // Prune even after a suspended tab resumes or the target disappears.
    trim(frames, t, Math.ceil(options.durationMs / 1000 * 240));
    trim(events, t, Math.ceil(options.durationMs / 1000 * 480));
    if (data === undefined) return false;
    frames.push({ t, source, data });
    trim(frames, t, Math.ceil(options.durationMs / 1000 * 240));
    if (t - publishedAt >= 250) {
      publish();
      publishedAt = t;
    }
    return true;
  }

  function publish() {
    setPreview([...frames]);
    setPreviewEvents([...events]);
    setSummary({
      samples: frames.length,
      duration: (frames.at(-1)?.t ?? 0) - (frames[0]?.t ?? 0),
      events: events.length
    });
  }

  function atDeadline() {
    return options.autoStop && performance.now() - started >= options.durationMs;
  }

  function trim<T extends { t: number }>(items: T[], now: number, limit: number) {
    let expired = 0;
    while (expired < items.length && items[expired]!.t < now - options.durationMs) expired++;
    items.splice(0, Math.max(expired, items.length - limit));
  }
}

/** Versioned capture. All `t` values are milliseconds since recording started. */
export type MotionCapture<Frame, Event> = {
  schemaVersion: 1;
  startedAt: string;
  timeOrigin: number;
  startedAtPerformanceMs: number;
  windowMs: number;
  recordingOptions: Required<MotionRecordingOptions>;
  reason: string;
  frames: { t: number; source: 'start' | 'raf' | 'capture'; data: Frame }[];
  events: { t: number; data: Event }[];
};

/** Settings apply at start; duration and delay are bounded to one minute. */
export type MotionRecordingOptions = {
  /** Retained window in milliseconds, 1,000–60,000. Defaults to 5,000. */
  durationMs?: number;
  /** Stop after durationMs instead of rolling the buffer. Defaults false. */
  autoStop?: boolean;
  /** Wait before sampling, 0–60,000 milliseconds. Defaults zero. */
  delayMs?: number;
};

function boundedMs(value: number | undefined, fallback: number, minimum: number) {
  return Number.isFinite(value) ? Math.min(60_000, Math.max(minimum, value!)) : fallback;
}
