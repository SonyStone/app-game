import { warmupFrames } from './gpuFrameTimer';

/**
 * Chooses the render scale of moving frames from their measured cost, so a device or scene too slow for the full
 * framebuffer keeps animating smoothly at a slightly softer resolution. Static frames are the caller's to draw at full
 * resolution.
 *
 * Frames drawn back to back settle on a steady scale: two slow frames in a row step it down at once to the largest
 * scale predicted to fit the budget, and a run of frames cheap enough for a larger scale steps it back up to the
 * largest one predicted to fit with headroom.
 *
 * The first frames after the GPU sat idle are a separate matter. A mobile GPU lowers its clock within a fraction of a
 * second without work and takes several frames of load to raise it again, so those frames cost a few times more than
 * the same frames a moment later. Judging the steady scale by them would lower it for good on a device that draws the
 * scene comfortably. They are left out of that judgement; instead the controller learns how much slower each of them
 * runs and draws just those frames at a smaller scale, when they would otherwise miss the budget.
 */
export function createDynamicResolution({
  budgetMs = 1000 / 60,
  scales = [1, 0.85, 0.7, 0.55]
}: {
  /** Frame cost to stay within, in the unit `observe` reports. Default one 60 Hz interval. */
  budgetMs?: number;
  /** Steady render scales from sharpest to softest; the first should be 1. */
  scales?: readonly number[];
} = {}) {
  let level = 0;
  let slow = 0;
  /** Cheapest of the current run of slow frames, a conservative estimate of the cost to scale down. */
  let slowCost = Infinity;
  let fast = 0;
  let strained = false;
  /** Cost of recent steady frames per unit of framebuffer area, at full resolution. */
  let unitCost: number | undefined;
  /**
   * How many times slower than steady frames each of the first frames after idle runs, by frames since idle; unknown
   * until a run has shown it.
   */
  const idleSlowdown: (number | undefined)[] = Array.from({ length: warmupFrames });
  /** Fixed cost of the latest frame drawn soon after idle, which a scaled frame pays on top of its scaled work. */
  let idleFixedMs = 0;
  /** Unit costs of the current run's first frames, until its steady frames tell how much slower they were. */
  let warmup: { sequence: number; unit: number }[] = [];
  /** Unit costs of the current run's first steady frames. */
  let steady: number[] = [];
  /** Cheapest fixed cost seen, the GPU's cost for that work at full clock; drifts up to follow a resized canvas. */
  let fixedFloor = Infinity;

  return {
    /** The steady scale of the framebuffer side lengths for moving frames. */
    get scale() {
      return scales[level]!;
    },
    /** Whether consecutive frames stayed slow at the smallest scale, so scaling alone cannot keep motion smooth. */
    get strained() {
      return strained;
    },
    /** Whether the latest steady frame missed the budget, so frames are queueing faster than they finish. */
    get behind() {
      return slow > 0 || strained;
    },
    /**
     * Scale for the next moving frame, drawn `sequence` frames after the GPU sat idle (default long after): the steady
     * scale, or less for the first frames after idle while they are known to run too slowly for it.
     */
    scaleFor(sequence = Infinity) {
      const scale = scales[level]!;

      if (sequence >= warmupFrames || unitCost === undefined) {
        return scale;
      }

      const predicted = unitCost * (idleSlowdown[sequence] ?? 1) * scale * scale;
      const fitting = budgetMs * warmupHeadroomRatio;

      if (predicted <= fitting) {
        return scale;
      }

      // A scaled frame also pays the fixed cost of reaching the canvas.
      const scaledFitting = Math.max(fitting - idleFixedMs, fitting / 2);

      return Math.max(scales.at(-1)!, scale * Math.sqrt(scaledFitting / predicted));
    },
    /**
     * Records a moving frame's cost in milliseconds. `scale` is the scale it was drawn at (default the steady scale),
     * `sequence` the frames drawn back to back before it (default many), and `fixedMs` the part of the cost that does
     * not shrink with the scale, such as stretching the frame over the canvas, when measured separately.
     */
    observe({
      ms,
      scale = scales[level]!,
      sequence = Infinity,
      fixedMs
    }: {
      ms: number;
      scale?: number;
      sequence?: number;
      fixedMs?: number;
    }) {
      const unit = Math.max(0, ms - (fixedMs ?? 0)) / (scale * scale);

      if (fixedMs !== undefined && fixedMs > 0) {
        fixedFloor = Math.min(fixedMs, fixedFloor * fixedFloorDrift);
      }

      if (sequence === 0) {
        warmup = [];
        steady = [];
      }

      if (sequence < warmupFrames) {
        warmup.push({ sequence, unit });
        idleFixedMs = fixedMs ?? idleFixedMs;
        return;
      }

      unitCost = unitCost === undefined ? unit : unitCost + (unit - unitCost) * unitCostBlend;
      learnIdleSlowdown(unit);

      if (ms > budgetMs * slowRatio) {
        fast = 0;
        slow++;
        slowCost = Math.min(slowCost, ms);

        if (slow >= slowFramesToStepDown) {
          strained = level === scales.length - 1;
          // Pixel work grows with area; take the largest scale predicted to fit, else the smallest.
          const fitting = scales.findIndex(
            (candidate, index) => index > level && slowCost * (candidate / scale) ** 2 <= budgetMs
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
      // The largest scale predicted to fit with headroom; costs grow with scale, so the first one that fits.
      const fitting = scales.findIndex(
        (candidate, index) => index < level && predictedAt(candidate, unit, fixedMs) < budgetMs * headroomRatio
      );

      if (fitting < 0) {
        fast = 0;
        return;
      }

      fast++;

      if (fast >= fastFramesToStepUp) {
        level = fitting;
        fast = 0;
      }
    }
  };

  /**
   * Cost of a frame at the `larger` scale, from a frame costing `unit` per unit area. A lightly loaded GPU lowers its
   * clock, inflating every measurement; under the heavier load of the larger scale it would raise it again. The fixed
   * cost, the same work every frame, tells how far the clock was lowered, and the prediction discounts that.
   */
  function predictedAt(larger: number, unit: number, fixedMs: number | undefined) {
    if (fixedMs === undefined || fixedMs <= 0) {
      return unit * larger * larger;
    }

    const slowdown = fixedMs / fixedFloor;

    return (unit / slowdown) * larger * larger + (larger < 1 ? fixedFloor : 0);
  }

  /** Once a run has a few steady frames, compares its first frames with them and blends in their slowdown. */
  function learnIdleSlowdown(unit: number) {
    if (steady.length >= steadyFramesToLearn) {
      return;
    }

    steady.push(unit);

    if (steady.length < steadyFramesToLearn) {
      return;
    }

    const steadyUnit = steady.reduce((total, value) => total + value, 0) / steady.length;

    for (const { sequence, unit: early } of warmup) {
      const slowdown = Math.min(maxIdleSlowdown, Math.max(1, early / Math.max(steadyUnit, 1e-6)));
      const learned = idleSlowdown[sequence];
      idleSlowdown[sequence] = learned === undefined ? slowdown : learned + (slowdown - learned) * idleSlowdownBlend;
    }

    warmup = [];
  }
}

/** Frames this much over budget count as slow; a little slack ignores timer jitter. */
const slowRatio = 1.05;
/** Consecutive slow frames before the scale steps down. */
const slowFramesToStepDown = 2;
/** Share of the budget a larger scale must be predicted to use before stepping up. */
const headroomRatio = 0.85;
/** Consecutive cheap frames before the scale steps up, about half a second at 60 Hz. */
const fastFramesToStepUp = 30;
/** Share of the budget the first frames after idle are scaled to; their cost varies more than steady frames'. */
const warmupHeadroomRatio = 0.85;
/** Steady frames of a run averaged before its first frames' slowdown is learned. */
const steadyFramesToLearn = 4;
/** Weight of a run's measured slowdown in the learned one; runs differ, as their views do. */
const idleSlowdownBlend = 0.5;
/** Largest slowdown learned, bounding the effect of a view that became cheaper during a run's first frames. */
const maxIdleSlowdown = 4;
/** Weight of the latest steady frame in the unit cost. */
const unitCostBlend = 0.25;
/** Growth of the fixed-cost floor per frame, about 1.2 times a second at 60 Hz, so it follows a larger canvas. */
const fixedFloorDrift = 1.003;
