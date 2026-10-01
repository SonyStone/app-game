import { ResultAsync } from 'neverthrow';

/**
 * Detects a device too slow to draw overview pages directly, so they can switch to whole-page tiles as soon as a
 * coarse fallback exists instead of waiting for sharp tiles. After two consecutive observed frames whose
 * completion exceeds {@link slowFrameMs}, `constrained` stays true until this document session is disposed and
 * `changed` requests a redraw. Sampling starts after the caller's synchronous submission, so queue pressure is
 * included; at most one fence is pending, and frames observed meanwhile are skipped.
 */
export function createDirectDrawPressure(completed: () => Promise<void>, changed: () => void) {
  let constrained = false;
  let slowFrames = 0;
  let observing = false;
  let active = true;

  return {
    /** Whether direct overview drawing has proved too slow on this device. */
    get constrained() {
      return constrained;
    },
    /** Samples the frame just submitted; call only for frames that drew overview pages directly. */
    observe() {
      if (!active || constrained || observing) {
        return;
      }

      observing = true;
      const started = performance.now();
      queueMicrotask(() => {
        if (!active) {
          return;
        }

        void ResultAsync.fromThrowable(completed, () => undefined)().then((result) => {
          observing = false;
          if (!active || result.isErr()) {
            return;
          }

          slowFrames = performance.now() - started > slowFrameMs ? slowFrames + 1 : 0;
          if (slowFrames >= 2) {
            constrained = true;
            changed();
          }
        });
      });
    },
    /** Pending observations become inert; no GPU resource is owned by this tracker. */
    destroy() {
      active = false;
    }
  };
}

/** Completion time above which a direct overview frame counts as slow: well below 30 frames per second. */
const slowFrameMs = 25;
