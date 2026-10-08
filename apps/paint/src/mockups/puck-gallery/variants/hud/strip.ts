import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { pressHandlers } from '../../kit/pressHandlers';
import {
  clearOfCircle,
  distance,
  fitDelta,
  overlapsCircle,
  radii,
  shiftRect,
  type FunctionId,
  type Hand,
  type Rect
} from './geometry';

/**
 * The contract every HUD strip follows. A strip opens with the current value or item at `home`, under the pen, and
 * previews what lies under the pointer as it moves; a lift commits, a lift back at home changes nothing, and Escape
 * restores what it changed.
 */

/**
 * How a strip was opened: `drag` follows the press that opened it until it lifts (the pen's one-stroke gesture);
 * `tap` stays open for taps and drags on itself (two-step mode); `key` stays open for arrows and Enter.
 */
export type StripVia = 'drag' | 'tap' | 'key';

/** What a strip needs when it opens. */
export type StripContext = {
  studio: Studio;
  hand: Hand;
  /** The ring's center: the zoom pivot, and the circle that tap-mode strips keep clear of. */
  center: Point;
  /** Where the strip opens; the current value or item lies here. */
  home: Point;
  via: StripVia;
};

/** The input side of a strip, the same for every kind. Created when the strip opens; holds no owner. */
export type StripModel = {
  fn: FunctionId;
  /** Previews the value or item under the pointer of a press in progress. */
  move: (point: Point) => void;
  /** Previews the value or item under a tap, without the tremble threshold of a drag. */
  tap: (point: Point) => void;
  /**
   * One step from the keyboard or the wheel: `dx` +1 is right, `dy` +1 is up. Each strip uses the axis it lies
   * along and falls back to the other; Shift may select a second axis (saturation in the color picker).
   */
  step: (dx: number, dy: number, shift: boolean) => void;
  /** Keeps the previewed change; returns whether anything changed since the strip opened or last committed. */
  commit: () => boolean;
  /** Restores what the strip changed since it opened or last committed. */
  cancel: () => void;
  /**
   * Whether a committed tap is a finished action that closes a toggled HUD. Strips you step through repeatedly
   * (History, Zoom) stay open.
   */
  finishes: boolean;
};

/**
 * Places a strip's bounding box: in tap and key mode it moves away from the ring until it clears it, so that the hub
 * stays reachable, then inside the window. The first of `directions` (unit vectors; by default away from the center,
 * then the other seven compass directions) whose result still clears the ring after fitting wins; when none does, the
 * first is used. A drag strip only moves inside the window. Returns the shift to apply to every part of the strip.
 */
export function placeStrip(context: StripContext, bounds: Rect, directions?: readonly Point[]): Point {
  const fitted = (delta: Point) => {
    const fit = fitDelta(shiftRect(bounds, delta));
    return { x: delta.x + fit.x, y: delta.y + fit.y };
  };
  if (context.via === 'drag') {
    return fitted({ x: 0, y: 0 });
  }

  const radius = radii.rim + 8;
  const middle = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  const away = Math.atan2(middle.y - context.center.y, middle.x - context.center.x || 0.001);
  const candidates =
    directions ??
    Array.from({ length: 8 }, (_, turn) => {
      const angle = away + (Math.ceil(turn / 2) * (turn % 2 ? 1 : -1) * Math.PI) / 4;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    });
  const placed = candidates.map((direction) => fitted(clearOfCircle(bounds, context.center, radius, direction)));
  return placed.find((delta) => !overlapsCircle(shiftRect(bounds, delta), context.center, radius)) ?? placed[0]!;
}

/**
 * Press handlers for a strip in tap or key mode: a drag previews what lies under the pointer and its lift commits,
 * a tap sets what lies under it at once. `committed` hears whether anything changed.
 */
export function stripPress(model: StripModel, committed: (changed: boolean) => void) {
  return pressHandlers({
    move(press) {
      if (press.moved) {
        model.move(press.point);
      }
    },
    tap(press) {
      model.tap(press.point);
      committed(model.commit());
    },
    end() {
      committed(model.commit());
    },
    cancel() {
      model.cancel();
    }
  });
}

/**
 * A drag's tremble guard: `true` once the pointer has moved `threshold` pixels from `home`, at once in tap and key
 * mode. Strips call it before previewing, so that a pen settling at home changes nothing.
 */
export function createTrembleGuard(context: StripContext, threshold = 5) {
  let live = context.via !== 'drag';
  return (point: Point) => {
    live ||= distance(point, context.home) >= threshold;
    return live;
  };
}
