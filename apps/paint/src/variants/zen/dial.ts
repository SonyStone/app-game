import type { Point } from './placement';

/**
 * A jog dial around `center`: follows a finger circling it and counts whole `step` turns (radians) from where the
 * finger started, clockwise positive. Turning back counts back down, so scrubbing to and fro lands on the same step
 * for the same angle. Moves within `deadRadius` of the center are skipped, since their angle jumps.
 */
export function createDial(center: Point, start: Point, step: number, deadRadius = 16) {
  let previous = angleOf(start);
  /** The angle turned since the start, unwrapped across ±π. */
  let turned = 0;

  return {
    /** Follows the finger to `point`; returns the whole steps turned since the start. */
    move(point: Point) {
      const angle = angleOf(point);
      if (angle === undefined) {
        return steps();
      }

      if (previous !== undefined) {
        turned += Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
      }

      previous = angle;
      return steps();
    },
    /** The angle turned since the start, in radians: where the next step is. */
    turned: () => turned,
    /**
     * Stops the dial at `steps`, where the history ends: turning on beyond it is forgotten, so turning back takes
     * effect at once rather than after unwinding the extra turn.
     */
    limit(steps: number) {
      const low = steps > 0 ? steps * step : (steps - 1) * step + epsilon;
      const high = steps < 0 ? steps * step : (steps + 1) * step - epsilon;
      turned = Math.min(high, Math.max(low, turned));
    }
  };

  function steps() {
    // `|| 0` turns −0 into 0.
    return Math.trunc(turned / step) || 0;
  }

  function angleOf(point: Point) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return Math.hypot(dx, dy) < deadRadius ? undefined : Math.atan2(dy, dx);
  }
}

/** Keeps a limited dial just inside its last step, clear of rounding at the step's edge. */
const epsilon = 1e-6;
