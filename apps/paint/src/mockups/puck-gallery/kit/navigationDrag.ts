import type { Point } from './createSketchCanvas';
import type { Studio } from './createStudio';

/**
 * Continuous view navigation from a press, as the Puck's Pan, Zoom and Rotate do: `start` on the press, `move` with
 * every pointer move, `end` on the lift. Plain state, no owner needed.
 *
 * - `pan` moves the drawing with the pointer.
 * - `zoom` scales by the vertical move, up zooms in (×2 per 115 px), around `pivot`: the press by default.
 * - `rotate` turns the view by the angle the pointer sweeps around `pivot` (the window's center by default), as
 *   the angle at the press plus the swept angle; with Shift the result snaps to 15° steps. Near the pivot, where
 *   the angle is unstable, moves are ignored.
 */
export function navigationDrag(studio: Studio) {
  let active:
    | { kind: NavigationKind; last: Point; pivot: Point; startPointer: number; startAngle: number; applied: number }
    | undefined;

  return {
    /** The kind of navigation in progress. */
    kind: () => active?.kind,
    start(kind: NavigationKind, at: Point, pivot?: Point) {
      const center = pivot ?? (kind === 'rotate' ? { x: innerWidth / 2, y: innerHeight / 2 } : at);
      active = {
        kind,
        last: at,
        pivot: center,
        startPointer: Math.atan2(at.y - center.y, at.x - center.x),
        startAngle: studio.view().angle,
        applied: 0
      };
    },
    move(at: Point, shift = false) {
      if (!active) {
        return;
      }

      const delta = { x: at.x - active.last.x, y: at.y - active.last.y };
      active.last = at;
      if (active.kind === 'pan') {
        studio.pan(delta.x, delta.y);
      } else if (active.kind === 'zoom') {
        studio.zoomBy(2 ** (-delta.y / 115), active.pivot);
      } else {
        const { pivot } = active;
        if (Math.hypot(at.x - pivot.x, at.y - pivot.y) < 24) {
          return;
        }

        let swept =
          ((((Math.atan2(at.y - pivot.y, at.x - pivot.x) - active.startPointer) * 180) / Math.PI + 540) % 360) - 180;
        if (shift) {
          swept = Math.round((swept + active.startAngle) / 15) * 15 - active.startAngle;
        }

        studio.rotateBy(swept - active.applied, pivot);
        active.applied = swept;
      }
    },
    end() {
      active = undefined;
    }
  };
}

export type NavigationKind = 'pan' | 'zoom' | 'rotate';
