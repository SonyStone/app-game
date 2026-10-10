/**
 * Where the pebble rests: on a track that runs around the screen at `pebbleInset` from its edges, so the pebble can sit
 * at any edge or corner. A place is kept as an edge and a fraction along it, which survives a rotated or resized
 * screen; the corners are the ends of the edges.
 */

/** A point or offset in client CSS pixels. */
export type Point = { x: number; y: number };

/** The view's size in CSS pixels. */
export type ViewSize = { width: number; height: number };

/**
 * The pebble's place: `edge` and `t`, the fraction along it from its top or left end (0 and 1 are the corners).
 */
export type Placement = { edge: 'top' | 'right' | 'bottom' | 'left'; t: number };

/** The pebble's radius in CSS pixels. */
export const pebbleRadius = 22;

/** Distance from the screen's edges to the pebble's center. */
export const pebbleInset = 14 + pebbleRadius;

/** The pebble's center at `placement` in a view of `view`. */
export function placementPoint(placement: Placement, view: ViewSize): Point {
  const { left, top, right, bottom } = track(view);
  const t = Math.min(1, Math.max(0, placement.t));
  switch (placement.edge) {
    case 'top':
      return { x: left + (right - left) * t, y: top };
    case 'bottom':
      return { x: left + (right - left) * t, y: bottom };
    case 'left':
      return { x: left, y: top + (bottom - top) * t };
    case 'right':
      return { x: right, y: top + (bottom - top) * t };
  }
}

/**
 * The place nearest to `point`, where a carried pebble lands. Within `cornerSnap` pixels of a corner it lands in the
 * corner, so corners are easy to hit.
 */
export function snapPlacement(point: Point, view: ViewSize): Placement {
  const { left, top, right, bottom } = track(view);
  const x = Math.min(right, Math.max(left, point.x));
  const y = Math.min(bottom, Math.max(top, point.y));
  const fx = fraction(x, left, right);
  const fy = fraction(y, top, bottom);
  const nearLeft = x - left < cornerSnap;
  const nearRight = right - x < cornerSnap;
  const nearTop = y - top < cornerSnap;
  const nearBottom = bottom - y < cornerSnap;
  if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
    return { edge: nearTop ? 'top' : 'bottom', t: nearLeft ? 0 : 1 };
  }

  const distances = [
    { edge: 'top', distance: y - top, t: fx },
    { edge: 'bottom', distance: bottom - y, t: fx },
    { edge: 'left', distance: x - left, t: fy },
    { edge: 'right', distance: right - x, t: fy }
  ] as const;
  const nearest = distances.reduce((best, candidate) => (candidate.distance < best.distance ? candidate : best));
  return { edge: nearest.edge, t: nearest.t };
}

/** Distance from a corner, in CSS pixels, within which a carried pebble lands in the corner. */
const cornerSnap = 56;

/**
 * The place `distance` pixels along the track from `home`, in the direction that takes the pebble farther from `pen`:
 * where it slides to get out of a hovering pen's way. It slides around corners.
 */
export function dodgePlacement(home: Placement, view: ViewSize, pen: Point, distance: number): Placement {
  const length = perimeter(view);
  const at = trackPosition(home, view);
  const candidates = [at + distance, at - distance].map((position) => placementAt(position, view));
  const away = (placement: Placement) => {
    const point = placementPoint(placement, view);
    return Math.hypot(point.x - pen.x, point.y - pen.y);
  };

  return length > 0 && away(candidates[1]!) > away(candidates[0]!) ? candidates[1]! : candidates[0]!;
}

/** The placement mirrored left to right, for the other hand. */
export function mirrorPlacement(placement: Placement): Placement {
  if (placement.edge === 'left' || placement.edge === 'right') {
    return { edge: placement.edge === 'left' ? 'right' : 'left', t: placement.t };
  }

  return { edge: placement.edge, t: 1 - placement.t };
}

/**
 * The direction, in radians (screen angles, y down), in which the fan opens from `placement`: straight away from its
 * edge, or diagonally out of a corner.
 */
export function inwardAngle(placement: Placement): number {
  const corner = placement.t <= 0 || placement.t >= 1;
  const normal = { top: Math.PI / 2, bottom: -Math.PI / 2, left: 0, right: Math.PI }[placement.edge];
  if (!corner) {
    return normal;
  }

  // At a corner the fan opens between this edge's normal and the other edge's.
  const vertical = placement.edge === 'top' || placement.edge === 'bottom';
  const x = vertical ? (placement.t <= 0 ? 1 : -1) : placement.edge === 'left' ? 1 : -1;
  const y = vertical ? (placement.edge === 'top' ? 1 : -1) : placement.t <= 0 ? 1 : -1;
  return Math.atan2(y, x);
}

/** The pebble's place where the user draws with `hand`: on the side of the free hand, a third down the screen. */
export function defaultPlacement(hand: 'left' | 'right'): Placement {
  return { edge: hand === 'left' ? 'right' : 'left', t: 0.35 };
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

function perimeter(view: ViewSize) {
  const { left, top, right, bottom } = track(view);
  return 2 * (right - left + (bottom - top));
}

/** `placement` as a distance along the track, clockwise from the top-left corner. */
function trackPosition(placement: Placement, view: ViewSize) {
  const { left, top, right, bottom } = track(view);
  const width = right - left;
  const height = bottom - top;
  const t = Math.min(1, Math.max(0, placement.t));
  switch (placement.edge) {
    case 'top':
      return width * t;
    case 'right':
      return width + height * t;
    case 'bottom':
      return width + height + width * (1 - t);
    case 'left':
      return 2 * width + height + height * (1 - t);
  }
}

/** The placement at distance `position` along the track, clockwise from the top-left corner, wrapping around. */
function placementAt(position: number, view: ViewSize): Placement {
  const { left, top, right, bottom } = track(view);
  const width = right - left;
  const height = bottom - top;
  const length = perimeter(view);
  if (length <= 0) {
    return { edge: 'top', t: 0.5 };
  }

  let at = ((position % length) + length) % length;
  if (at <= width) {
    return { edge: 'top', t: fraction(at, 0, width) };
  }

  at -= width;
  if (at <= height) {
    return { edge: 'right', t: fraction(at, 0, height) };
  }

  at -= height;
  if (at <= width) {
    return { edge: 'bottom', t: 1 - fraction(at, 0, width) };
  }

  at -= width;
  return { edge: 'left', t: 1 - fraction(at, 0, height) };
}
