import type { FrameTime } from '../scene/createFrameScheduler';

/**
 * Keeps the costs of the latest `capacity` presented frames, oldest first. Every recorded frame counts, including
 * single on-demand frames; only frames drawn back to back also carry the interval that frame rate derives from.
 */
export function makeFrameCostHistory(capacity: number) {
  const samples: FrameCostSample[] = [];
  let previous: number | undefined;

  return {
    /** Recorded frames, oldest first. The array and its samples change as frames are recorded and GPU work settles. */
    samples: samples as readonly FrameCostSample[],

    /**
     * Records a presented frame with its main-thread cost and render scale and returns its sample, whose `gpuMs` and
     * `passMs` the caller fills in once the GPU finishes. A frame whose `delta` is zero, after idle, resume or an out-of-band redraw, has no interval.
     */
    record(frame: FrameTime, cpuMs: number, scale?: number) {
      const sample: FrameCostSample = {
        timestamp: frame.timestamp,
        cpuMs,
        scale,
        intervalMs: frame.delta > 0 && previous !== undefined ? frame.timestamp - previous : undefined
      };

      previous = frame.timestamp;
      samples.push(sample);

      if (samples.length > capacity) {
        samples.shift();
      }

      return sample;
    },

    /** Forgets every recorded frame; the next frame has no interval. */
    reset() {
      samples.length = 0;
      previous = undefined;
    }
  };
}

/** One presented frame's cost. */
export type FrameCostSample = {
  /** The frame's start on the `performance.now()` clock, in milliseconds. */
  timestamp: number;
  /** Main-thread milliseconds from the frame's start until its commands were submitted. */
  cpuMs: number;
  /** Milliseconds from submission until the GPU finished the queue's work; undefined until then. */
  gpuMs?: number;
  /**
   * Milliseconds the GPU spent executing the frame's render passes, on devices with timestamp queries. Unlike `gpuMs`
   * it excludes queueing and presentation, so it is the figure to compare when judging rendering work.
   */
  passMs?: number;
  /** Framebuffer resolution relative to the canvas; below 1 for moving frames drawn at reduced resolution. */
  scale?: number;
  /** Milliseconds since the previous frame when the loop ran without pausing in between. */
  intervalMs?: number;
};

/**
 * Summarizes a history: the latest frame's total cost, the cost range over the history, and the frame rate of the
 * trailing run of back-to-back frames, which is undefined when the latest frame followed idle.
 */
export function summarizeFrameCosts(samples: readonly FrameCostSample[]) {
  const costs = samples.map(frameCost);
  const run: number[] = [];

  for (let index = samples.length - 1; index >= 0 && run.length < fpsFrames; index--) {
    const interval = samples[index]!.intervalMs;

    if (interval === undefined) {
      break;
    }

    run.push(interval);
  }

  const meanInterval = run.reduce((total, interval) => total + interval, 0) / run.length;

  return {
    latestMs: costs.at(-1),
    minMs: costs.length > 0 ? Math.min(...costs) : undefined,
    maxMs: costs.length > 0 ? Math.max(...costs) : undefined,
    fps: run.length > 0 && meanInterval > 0 ? 1000 / meanInterval : undefined
  };
}

/** Total milliseconds of main-thread and known GPU work for a frame. */
export function frameCost(sample: FrameCostSample) {
  return sample.cpuMs + (sample.gpuMs ?? 0);
}

/** Frame rate averages at most this many trailing intervals, about half a second at 60 Hz. */
const fpsFrames = 30;
