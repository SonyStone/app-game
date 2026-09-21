import { createRAF } from '@solid-primitives/raf';
import { Result } from 'neverthrow';
import { onCleanup, untrack } from 'solid-js';
import { errorMessage, gpuError, type ViewerError } from '../../shared/errors';

/** Owns one demand-driven clock. Subscriptions can keep it running independently of one another. */
export function createFrameScheduler(
  draw: (frame: FrameTime) => Result<void, ViewerError>,
  onError: (error: ViewerError) => void
) {
  const subscriptions = new Set<FrameSubscription>();
  let stopped = false;
  let active = true;
  let continuous = false;
  let invalidated = false;
  let running = false;
  let previous: number | undefined;
  let time = 0;

  const [, start, cancel] = createRAF((timestamp) => advance(timestamp));

  const loop = {
    /** Coalesces requests; hidden views retain the request until they resume. */
    invalidate() {
      if (stopped) {
        return;
      }

      invalidated = true;

      if (active && !running) {
        running = true;
        untrack(start);
      }
    },

    /** Pauses presentation and animation time while the page is hidden. */
    setActive(value: boolean) {
      active = value;

      if (active) {
        loop.invalidate();
      } else {
        pause();
      }
    },

    /** Optional scene-wide override. Components normally request continuous frames through useFrame. */
    setContinuous(value: boolean) {
      continuous = value;
      loop.invalidate();
    },

    /** Permanently stops this session. Subsequent invalidations and subscriptions have no effect. */
    stop() {
      stopped = true;
      subscriptions.clear();
      pause();
    },

    /** Stops and reports a typed failure once, including exceptions from frame callbacks. */
    fail(error: ViewerError) {
      if (stopped) {
        return;
      }

      loop.stop();
      onError(error);
    },

    /** Registers synchronous work. The returned disposer removes only this subscription. */
    subscribe(subscription: FrameSubscription) {
      if (!stopped) {
        subscriptions.add(subscription);
        loop.invalidate();
      }

      return () => {
        if (subscriptions.delete(subscription)) {
          loop.invalidate();
        }
      };
    }
  };

  onCleanup(loop.stop);

  return loop;

  function advance(timestamp: number) {
    if (stopped || !active) {
      return;
    }

    invalidated = false;

    const delta = previous === undefined ? 0 : Math.min(0.1, Math.max(0, (timestamp - previous) / 1000));
    previous = timestamp;
    time += delta;

    const frame = { timestamp, delta, time };
    const updated = Result.fromThrowable(
      () => {
        for (const phase of ['update', 'render'] as const) {
          for (const subscription of subscriptions) {
            if (stopped) {
              return;
            }

            if (subscription.phase === phase) {
              subscription.callback(frame);
            }
          }
        }
      },
      (cause) => gpuError('render', errorMessage(cause), cause)
    )();

    if (updated.isErr()) {
      loop.fail(updated.error);
      return;
    }

    if (stopped) {
      return;
    }

    const rendered = draw(frame);

    if (rendered.isErr()) {
      loop.fail(rendered.error);
      return;
    }

    if (!continuous && !invalidated && ![...subscriptions].some((subscription) => subscription.continuous)) {
      pause();
    }
  }

  function pause() {
    if (running) {
      running = false;
      cancel();
    }

    previous = undefined;
  }
}

/** Seconds of active animation; delta is zero after idle/resume and capped at 100 ms after a stall. */
export type FrameTime = {
  /** Raw RAF timestamp in milliseconds, for diagnostics rather than animation progress. */
  timestamp: number;
  delta: number;
  time: number;
};

/** Updates run before render callbacks; both phases precede the shared GPU pass. */
export type FrameSubscription = {
  callback: (frame: FrameTime) => void;
  phase: 'update' | 'render';
  continuous: boolean;
};
