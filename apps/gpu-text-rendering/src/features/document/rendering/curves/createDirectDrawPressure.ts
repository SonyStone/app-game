import { ResultAsync } from 'neverthrow';

/**
 * Detects a device too slow to draw overview pages directly, so they can switch to whole-page tiles as soon as a
 * coarse fallback exists instead of waiting for sharp tiles. After two consecutive observed frames costing more than
 * `slowMs`, `constrained` stays true until this document session is disposed and `changed` requests a redraw. `cost`
 * is called right after the caller's synchronous submission and resolves that frame's cost in milliseconds, or
 * undefined for a frame that says nothing about the device's speed, which is skipped; at most one cost is pending, and
 * frames observed meanwhile are skipped.
 */
export function createDirectDrawPressure(
  cost: () => Promise<number | undefined>,
  changed: () => void,
  /** Frame cost above which a direct overview frame counts as slow, in the unit `cost` resolves. */
  slowMs = 25
) {
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
      queueMicrotask(() => {
        if (!active) {
          return;
        }

        void ResultAsync.fromThrowable(cost, () => undefined)().then((result) => {
          observing = false;
          if (!active || result.isErr() || result.value === undefined) {
            return;
          }

          slowFrames = result.value > slowMs ? slowFrames + 1 : 0;
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
