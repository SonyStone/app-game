import type { createMockCanvas } from './createMockCanvas';

/**
 * The navigation puck's view operations as NavigationPuckAddon performs them (`operators/view_operations.py`,
 * `view_handlers.py`), on the mockup's 2D view. An operation starts on a press, follows the pointer until `end`, and
 * accepts an initial delta, as a drag-select start does:
 *
 * - `pan` moves the drawing with the pointer.
 * - `zoom` scales by `1 + 0.002 × Δy` per move (the addon's `view_distance += Δy × 0.02 × 0.1 × view_distance`),
 *   zooming in as the pointer moves up, around the window's center.
 * - `roll` turns the view by the signed angle between the directions from the window's center to the press and to
 *   the pointer, added to the angle at the press; with Shift the result snaps to 15° steps.
 */
export function createPuckNavigation(paint: ReturnType<typeof createMockCanvas>) {
  let active: { action: PuckAction; last: Point; start: Point; startAngle: number; appliedAngle: number } | undefined;

  return {
    active: () => active !== undefined,
    start(action: PuckAction, pointer: Point, shift = false, delta: Point = { x: 0, y: 0 }) {
      active = { action, last: pointer, start: pointer, startAngle: paint.view().angle, appliedAngle: 0 };
      apply(pointer, delta, shift);
    },
    move(pointer: Point, shift = false) {
      if (active) {
        apply(pointer, { x: pointer.x - active.last.x, y: pointer.y - active.last.y }, shift);
        active.last = pointer;
      }
    },
    end() {
      active = undefined;
    }
  };

  function apply(pointer: Point, delta: Point, shift: boolean) {
    if (!active) {
      return;
    }

    if (active.action === 'pan') {
      paint.pan(delta.x, delta.y);
    } else if (active.action === 'zoom') {
      paint.zoomBy(1 / Math.max(0.1, 1 + 0.002 * delta.y));
    } else {
      const center = { x: innerWidth / 2, y: innerHeight / 2 };
      const from = Math.atan2(active.start.y - center.y, active.start.x - center.x);
      const to = Math.atan2(pointer.y - center.y, pointer.x - center.x);
      if (Math.hypot(pointer.x - center.x, pointer.y - center.y) < 1e-4) {
        return;
      }

      let angle = ((((to - from) * 180) / Math.PI + 540) % 360) - 180;
      if (shift) {
        angle = Math.round((angle + active.startAngle) / 15) * 15 - active.startAngle;
      }

      paint.rotateBy(angle - active.appliedAngle);
      active.appliedAngle = angle;
    }
  }
}

/** The navigation squares' operations, by the addon's names. */
export type PuckAction = 'pan' | 'zoom' | 'roll';

type Point = { x: number; y: number };
