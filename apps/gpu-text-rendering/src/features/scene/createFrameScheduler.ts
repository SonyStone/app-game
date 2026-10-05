import { errorMessage, gpuError } from '@app-game/solid-gpu/errors';
import { createRAF } from '@solid-primitives/raf';
import { ok, Result } from 'neverthrow';
import { flush, onCleanup, untrack } from 'solid-js';
import type { ViewerError } from '../../shared/errors';

/**
 * Owns one demand-driven clock. Subscriptions can keep it running independently of one another.
 * Reactive writes from update callbacks, and the effects they trigger, settle before the render phase, so render
 * callbacks and `draw` observe them in the same frame. `track` wraps the render phase and draw of each frame, so a caller can observe their
 * reactive reads; update and present callbacks run outside it. Present callbacks run only after `draw` reports a
 * submitted frame.
 */
export function createFrameScheduler(
  /** Draws the frame, returning whether it submitted one rather than deferring it. */
  draw: () => Result<boolean, ViewerError>,
  onError: (error: ViewerError) => void,
  track: (record: () => void) => void
) {
  const subscriptions = new Set<FrameSubscription>();
  let stopped = false;
  let active = true;
  let invalidated = false;
  let previous: number | undefined;
  let time = 0;

  const [, start, cancel] = createRAF(advance);

  const loop = {
    /** Coalesces requests; hidden views retain the request until they resume. */
    invalidate() {
      if (stopped) {
        return;
      }

      invalidated = true;

      if (active) {
        untrack(start);
      }
    },

    /**
     * Renders the current state now, without advancing animation time, for work that must reach the next paint, such
     * as redrawing a canvas whose resize just cleared it. Satisfies pending requests like a scheduled frame.
     */
    redraw() {
      if (stopped || !active) {
        return;
      }

      render({ timestamp: performance.now(), delta: 0, time });
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

    const delta = previous === undefined ? 0 : Math.min(0.1, Math.max(0, (timestamp - previous) / 1000));
    previous = timestamp;
    time += delta;

    const frame = { timestamp, delta, time };
    // Solid stages writes until a microtask. Settling them and their effects now lets this frame render the update.
    const updated = flush(() => runPhase('update', frame));

    if (updated.isErr()) {
      loop.fail(updated.error);
      return;
    }

    if (stopped) {
      return;
    }

    render(frame);
  }

  /** Runs render callbacks and draws, then pauses unless a request arrived meanwhile or a subscription is continuous. */
  function render(frame: FrameTime) {
    // This render reads current state, so it satisfies every request so far, including those caused by updates.
    invalidated = false;

    let rendered: Result<boolean, ViewerError> = ok(false);

    track(() => {
      rendered = runPhase('render', frame).map(() => false);

      if (rendered.isOk() && !stopped) {
        rendered = draw();
      }
    });

    if (rendered.isOk() && rendered.value && !stopped) {
      rendered = runPhase('present', frame).map(() => true);
    }

    if (rendered.isErr()) {
      loop.fail(rendered.error);
      return;
    }

    if (!invalidated && ![...subscriptions].some((subscription) => subscription.continuous)) {
      pause();
    }
  }

  /** Runs one phase's callbacks in subscription order, stopping early if a callback stops the loop. */
  function runPhase(phase: FrameSubscription['phase'], frame: FrameTime) {
    return Result.fromThrowable(
      () => {
        for (const subscription of subscriptions) {
          if (stopped) {
            return;
          }

          if (subscription.phase === phase) {
            subscription.callback(frame);
          }
        }
      },
      (cause) => gpuError('render', errorMessage(cause), cause)
    )();
  }

  function pause() {
    cancel();
    previous = undefined;
  }
}

/** Seconds of active animation; delta is zero after idle/resume and capped at 100 ms after a stall. */
export type FrameTime = {
  /** Raw RAF timestamp in milliseconds, for diagnostics rather than animation progress. */
  timestamp: number;
  /** Seconds since the previous active frame: 0 after idle or resume, at most 0.1. */
  delta: number;
  /** Accumulated active seconds; does not advance while idle or hidden. */
  time: number;
};

/**
 * Updates run before render callbacks; both phases precede the shared GPU pass. Present callbacks follow a submitted
 * pass in the same task, while the canvas still holds the frame's image.
 */
export type FrameSubscription = {
  callback: (frame: FrameTime) => void;
  phase: 'update' | 'render' | 'present';
  continuous: boolean;
};
