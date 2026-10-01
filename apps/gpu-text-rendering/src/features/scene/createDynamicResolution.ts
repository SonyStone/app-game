/**
 * Chooses the render scale of moving frames from their measured cost, so a device or scene too slow for the full
 * framebuffer keeps animating smoothly at a slightly softer resolution. Two slow frames in a row step the scale down
 * at once to the largest one predicted to fit the budget, so a heavy gesture stutters for only those two frames; a run
 * of frames cheap enough to fit the budget at the next larger scale steps it back up one scale. Static frames are the
 * caller's to draw at full resolution.
 */
export function createDynamicResolution({
  budgetMs = 1000 / 60,
  scales = [1, 0.85, 0.7, 0.55]
}: {
  /** Frame cost to stay within, in milliseconds. Default one 60 Hz interval. */
  budgetMs?: number;
  /** Render scales from sharpest to softest; the first should be 1. */
  scales?: readonly number[];
} = {}) {
  let level = 0;
  let slow = 0;
  /** Cheapest of the current run of slow frames, a conservative estimate of the cost to scale down. */
  let slowCost = Infinity;
  let fast = 0;
  let strained = false;

  return {
    /** Scale of the framebuffer side lengths for the next moving frame. */
    get scale() {
      return scales[level]!;
    },
    /** Whether consecutive frames stayed slow at the smallest scale, so scaling alone cannot keep motion smooth. */
    get strained() {
      return strained;
    },
    /** Records a moving frame's cost: main-thread work plus GPU completion, in milliseconds. */
    observe(frameMs: number) {
      if (frameMs > budgetMs * slowRatio) {
        fast = 0;
        slow++;
        slowCost = Math.min(slowCost, frameMs);

        if (slow >= slowFramesToStepDown) {
          strained = level === scales.length - 1;
          // Pixel work grows with area; take the largest scale predicted to fit, else the smallest.
          const current = scales[level]!;
          const fitting = scales.findIndex(
            (scale, index) => index > level && slowCost * (scale / current) ** 2 <= budgetMs
          );
          level = fitting < 0 ? scales.length - 1 : fitting;
          slow = 0;
          slowCost = Infinity;
        }

        return;
      }

      slow = 0;
      slowCost = Infinity;
      strained = false;
      const larger = scales[level - 1];
      // Pixel work grows with area; step up only when the larger scale would still fit with headroom.
      const predicted = larger === undefined ? Infinity : frameMs * (larger / scales[level]!) ** 2;

      if (predicted < budgetMs * headroomRatio) {
        fast++;

        if (fast >= fastFramesToStepUp) {
          level--;
          fast = 0;
        }
      } else {
        fast = 0;
      }
    }
  };
}

/** Frames this much over budget count as slow; a little slack ignores timer jitter. */
const slowRatio = 1.05;
/** Consecutive slow frames before the scale steps down. */
const slowFramesToStepDown = 2;
/** Share of the budget a larger scale must be predicted to use before stepping up. */
const headroomRatio = 0.85;
/** Consecutive cheap frames before the scale steps up, about half a second at 60 Hz. */
const fastFramesToStepUp = 30;
