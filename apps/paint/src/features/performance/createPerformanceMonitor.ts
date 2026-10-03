import type { ViewSize } from '@app-game/paint-core/camera';
import { makeFrameCostHistory } from '@app-game/solid-gpu/performance/makeFrameCostHistory';
import { makeTimer } from '@solid-primitives/timer';
import { createEffect, createSignal, untrack, type Accessor } from 'solid-js';
import type { FrameEvent } from '../engine';
import { paintPerformance } from './paintPerformance';

/**
 * Records the drawing engine's frame timing while `enabled` and reports it through `window.paintPerformance` and the
 * dev server's `/__performance` endpoint. Each frame's cost is the engine's CPU submission time (`renderMs`) plus its
 * wait for submitted GPU work (`queueWaitMs`), both measured by the engine on its own thread. The frame's start and
 * the interval between frames are measured on the main thread when the event arrives, so intervals include message
 * delivery. Frames starting within `continuityMs` of the previous one count as back to back for the frame rate.
 *
 * Disabling forgets recorded frames and removes the monitor from reports. Must be created within a Solid owner.
 */
export function createPerformanceMonitor(options: {
  /** Whether frames are recorded and reported; the engine sends frame events only while this is true. */
  enabled: Accessor<boolean>;
  /** Names this monitor in reports, such as the execution mode. Read when a report is requested. */
  label: Accessor<string>;
  /** Drawing stage size in CSS pixels, reported with the device pixel ratio. */
  size: Accessor<ViewSize>;
}) {
  const history = makeFrameCostHistory(reportCapacity);
  /** Notifies `samples` readers; the history mutates its array in place. */
  const [changed, notifyChanged] = createSignal<void>(undefined, { equals: false });
  const [idle, setIdle] = createSignal(true);
  let clearSettle: (() => void) | undefined;

  createEffect(options.enabled, (enabled) => {
    if (!enabled) {
      return;
    }

    const unregister = paintPerformance.register({
      label: options.label,
      samples: () => history.samples,
      idle,
      canvas: () => {
        const { width, height } = options.size();
        const dpr = devicePixelRatio;

        return { width: Math.round(width * dpr), height: Math.round(height * dpr), dpr };
      },
      reset
    });

    return () => {
      unregister();
      reset();
    };
  });

  return {
    /** Recorded frames, oldest first; reading it tracks new frames and resets. */
    samples: () => {
      changed();
      return history.samples;
    },
    /** No frame has arrived for `settleMs`, so no frame rate applies. */
    idle,
    record,
    reset
  };

  /** Records an engine frame event; ignored while disabled, such as a late event after disabling. */
  function record(frame: Pick<FrameEvent, 'renderMs' | 'queueWaitMs'>) {
    if (!untrack(options.enabled)) {
      return;
    }

    const timestamp = performance.now() - frame.renderMs - frame.queueWaitMs;
    const gap = timestamp - (history.samples.at(-1)?.timestamp ?? -Infinity);
    const sample = history.record({ timestamp, delta: gap > 0 && gap <= continuityMs ? gap : 0 }, frame.renderMs);

    sample.gpuMs = frame.queueWaitMs;
    setIdle(false);
    notifyChanged();
    clearSettle?.();
    clearSettle = makeTimer(() => setIdle(true), settleMs, setTimeout);
  }

  /** Forgets recorded frames. */
  function reset() {
    clearSettle?.();
    clearSettle = undefined;
    history.reset();
    setIdle(true);
    notifyChanged();
  }
}

/** Frames kept for reports, about 30 seconds of continuous drawing at 120 Hz. The panel shows the latest few. */
const reportCapacity = 3600;

/** Milliseconds without a frame after which the monitor reports idle. */
const settleMs = 150;

/** Longest gap between frame starts that still counts as back-to-back drawing, in milliseconds. */
const continuityMs = 100;
