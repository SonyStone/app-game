/**
 * Where the pebble rests: anywhere in a rectangle `pebbleInset` inside the screen's edges (the track), so the whole
 * pebble always shows. A place is kept as fractions across and down that rectangle, which survives a rotated or
 * resized screen: a pebble at an edge or in a corner stays there, one in the open keeps its relative spot.
 */

/** A point or offset in client CSS pixels. */
export type Point = { x: number; y: number };

/** The view's size in CSS pixels. */
export type ViewSize = { width: number; height: number };

/**
 * The pebble's place as fractions of the track: `x` from its left (0) to its right (1) side, `y` from its top (0) to
 * its bottom (1). 0 and 1 are flush with the screen's edges; both at once is a corner.
 */
export type Placement = { x: number; y: number };

/** The pebble's radius in CSS pixels: a 72 px disc, a comfortable target for a fingertip and the pen alike. */
export const pebbleRadius = 36;

/** Distance from the screen's edges to the pebble's center when it rests flush with them. */
export const pebbleInset = 12 + pebbleRadius;

/** The pebble's center at `placement` in a view of `view`. */
export function placementPoint(placement: Placement, view: ViewSize): Point {
  const { left, top, right, bottom } = track(view);
  return {
    x: left + (right - left) * clampUnit(placement.x),
    y: top + (bottom - top) * clampUnit(placement.y)
  };
}

/** The place whose center is nearest `point`: where a pebble carried to `point` lands, fully on screen. */
export function placementAt(point: Point, view: ViewSize): Placement {
  const { left, top, right, bottom } = track(view);
  return { x: clampUnit(fraction(point.x, left, right)), y: clampUnit(fraction(point.y, top, bottom)) };
}

/**
 * A stored place, or `undefined` when `value` is none. Accepts the earlier `{ edge, t }` form, an edge and the
 * fraction along it from its top or left end, and turns it into the same spot.
 */
export function parsePlacement(value: unknown): Placement | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const { x, y, edge, t } = value as Record<string, unknown>;
  if (isFiniteNumber(x) && isFiniteNumber(y)) {
    return { x: clampUnit(x), y: clampUnit(y) };
  }

  if (!isFiniteNumber(t)) {
    return undefined;
  }

  const along = clampUnit(t);
  switch (edge) {
    case 'top':
      return { x: along, y: 0 };
    case 'bottom':
      return { x: along, y: 1 };
    case 'left':
      return { x: 0, y: along };
    case 'right':
      return { x: 1, y: along };
    default:
      return undefined;
  }
}

/**
 * The place about `distance` pixels from `home` that takes the pebble farthest from `pen`: where it slides to get out
 * of a hovering pen's way. Against an edge or in a corner it slides along the edge, since the track stops it there.
 */
export function dodgePlacement(home: Placement, view: ViewSize, pen: Point, distance: number): Placement {
  const at = placementPoint(home, view);
  let best = at;
  let farthest = Math.hypot(at.x - pen.x, at.y - pen.y);
  for (let index = 0; index < dodgeDirections; index++) {
    const angle = (index / dodgeDirections) * 2 * Math.PI;
    const point = placementPoint(
      placementAt({ x: at.x + Math.cos(angle) * distance, y: at.y + Math.sin(angle) * distance }, view),
      view
    );
    const away = Math.hypot(point.x - pen.x, point.y - pen.y);
    // A clear margin keeps rounding from choosing between equally good directions.
    if (away > farthest + 1e-6) {
      best = point;
      farthest = away;
    }
  }

  return placementAt(best, view);
}

/** Directions a dodging pebble considers, evenly around it: every 15°, so edges and corners are among them. */
const dodgeDirections = 24;

/** The placement mirrored left to right, for the other hand. */
export function mirrorPlacement(placement: Placement): Placement {
  return { x: 1 - placement.x, y: placement.y };
}

/**
 * The direction, in radians (screen angles, y down), in which the fan opens from a pebble centered at `center`:
 * toward the open space. Each screen edge within `edgeReach` pixels of the pebble's flush position pushes the fan
 * away from it, the more the closer, so a pebble flush with an edge opens straight away from it and one in a corner
 * diagonally out of it; whatever room the edges leave turns toward the screen's middle. A pebble in the very middle
 * opens upward, clear of the hand below the pen.
 */
export function inwardAngle(center: Point, view: ViewSize): number {
  const { left, top, right, bottom } = track(view);
  const push = (distance: number) => Math.min(1, Math.max(0, 1 - distance / edgeReach));
  const pushes = {
    left: push(center.x - left),
    right: push(right - center.x),
    top: push(center.y - top),
    bottom: push(bottom - center.y)
  };
  const free = 1 - Math.max(pushes.left, pushes.right, pushes.top, pushes.bottom);
  const middle = { x: view.width / 2 - center.x, y: view.height / 2 - center.y };
  const toMiddle = Math.hypot(middle.x, middle.y);
  const x = pushes.left - pushes.right + (toMiddle > 0 ? (free * middle.x) / toMiddle : 0);
  const y = pushes.top - pushes.bottom + (toMiddle > 0 ? (free * middle.y) / toMiddle : 0);
  return Math.hypot(x, y) < 1e-6 ? -Math.PI / 2 : Math.atan2(y, x);
}

/** How far from its flush position an edge still pushes the fan, in CSS pixels: about the fan's outer ring. */
const edgeReach = 200;

/** The pebble's place where the user draws with `hand`: flush with the free hand's side, a third down the screen. */
export function defaultPlacement(hand: 'left' | 'right'): Placement {
  return { x: hand === 'left' ? 1 : 0, y: 0.35 };
}

/** The track's rectangle: where pebble centers may lie. A view too small for it collapses to its middle. */
function track(view: ViewSize) {
  const left = Math.min(pebbleInset, view.width / 2);
  const top = Math.min(pebbleInset, view.height / 2);
  return {
    left,
    top,
    right: Math.max(left, view.width - pebbleInset),
    bottom: Math.max(top, view.height - pebbleInset)
  };
}

function fraction(value: number, from: number, to: number) {
  return to > from ? (value - from) / (to - from) : 0.5;
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
