/**
 * Pure geometry of the Two hands variant: the free hand's zone along one edge, the ring of pen modes fanned around a
 * finger, and the two-finger size and opacity drag. Points are CSS pixels; the zone uses the stage's own pixels, the
 * ring the client's.
 */

/** A point in CSS pixels. */
export type Point = { x: number; y: number };

/** The screen edge the free hand works at: the side opposite the pen hand. */
export type Side = 'left' | 'right';

/**
 * The free hand's zone: half an ellipse standing on the `side` edge, about a thumb's and fingers' reach wide (22% of
 * the view, 180–300 px) and up to 960 px tall, a little below the middle where a hand holding the tablet rests, and
 * tapering toward the corners, which it does not reach.
 */
export function zoneShape(view: { width: number; height: number }, side: Side) {
  const width = Math.round(Math.min(300, Math.max(180, view.width * 0.22)));
  return {
    side,
    /** Width of the zone's box, from the edge to the arc's farthest point. */
    width,
    height: view.height,
    /** The ellipse's center on the edge and its radii. */
    cx: side === 'right' ? view.width : 0,
    cy: view.height * 0.55,
    rx: width,
    ry: Math.min(480, view.height * 0.62)
  };
}

/** A free-hand zone; see `zoneShape`. */
export type Zone = ReturnType<typeof zoneShape>;

/** Whether a stage point lies inside the zone. */
export function inZone(zone: Zone, point: Point) {
  const dx = (point.x - zone.cx) / zone.rx;
  const dy = (point.y - zone.cy) / zone.ry;
  return dx * dx + dy * dy <= 1;
}

/**
 * SVG paths of the zone in the coordinates of its box (`width` × `height`, placed against the edge): `area` is the
 * filled half ellipse, `arc` only its curved edge.
 */
export function zonePaths(zone: Zone) {
  const cx = zone.side === 'right' ? zone.width : 0;
  const top = zone.cy - zone.ry;
  const bottom = zone.cy + zone.ry;
  // From the top to the bottom through the side away from the edge: counterclockwise on screen for the right edge.
  const sweep = zone.side === 'right' ? 0 : 1;
  const arc = `M ${cx} ${top} A ${zone.rx} ${zone.ry} 0 0 ${sweep} ${cx} ${bottom}`;
  return { arc, area: `${arc} Z` };
}

/**
 * Positions `ids` on an arc around a finger at `origin`, fanned away from the screen edge toward the middle of `view`
 * (client pixels) and starting at the top, with `gap` pixels between neighbouring centers. A ring that would leave
 * the view moves as a whole, so `center` may differ from `origin`; choosing goes by direction from `origin`, see
 * `ringItemAt`.
 */
export function ringLayout<Id extends string>(
  origin: Point,
  ids: readonly Id[],
  view: { left: number; top: number; width: number; height: number },
  gap = 60
) {
  const towardMiddle = Math.atan2(view.top + view.height / 2 - origin.y, view.left + view.width / 2 - origin.x);
  const span = Math.min(ringSpan, (ids.length - 1) * (Math.PI / 6));
  const step = ids.length > 1 ? span / (ids.length - 1) : 0;
  const radius = Math.max(minRadius, step > 0 ? gap / (2 * Math.sin(step / 2)) : minRadius);
  // Of the two ends of the fan, start at the one higher on screen and sweep toward the other.
  const sign = Math.sin(towardMiddle + span / 2) < Math.sin(towardMiddle - span / 2) ? 1 : -1;
  const start = towardMiddle + (sign * span) / 2;
  const placed = ids.map((id, index) => {
    const angle = start - sign * index * step;
    return { id, x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius };
  });

  const margin = itemRadius + 6;
  const shift = {
    x: overflow(
      Math.min(...placed.map(({ x }) => x)) - margin,
      Math.max(...placed.map(({ x }) => x)) + margin,
      view.left,
      view.left + view.width
    ),
    y: overflow(
      Math.min(...placed.map(({ y }) => y)) - margin,
      Math.max(...placed.map(({ y }) => y)) + margin,
      view.top,
      view.top + view.height
    )
  };

  return {
    origin,
    center: { x: origin.x + shift.x, y: origin.y + shift.y },
    radius,
    items: placed.map((item) => ({ ...item, x: item.x + shift.x, y: item.y + shift.y }))
  };
}

/** A ring of choices; see `ringLayout`. */
export type RingLayout<Id extends string = string> = ReturnType<typeof ringLayout<Id>>;

/**
 * The ring item a finger at `point` chooses: the one whose direction from the ring's origin is closest to the
 * finger's, once the finger is `deadZone` pixels away from the origin; none inside it.
 */
export function ringItemAt<Id extends string>(layout: RingLayout<Id>, point: Point, deadZone = 26): Id | undefined {
  const dx = point.x - layout.origin.x;
  const dy = point.y - layout.origin.y;
  if (Math.hypot(dx, dy) < deadZone) {
    return undefined;
  }

  const angle = Math.atan2(dy, dx);
  let best: { id: Id; difference: number } | undefined;
  for (const item of layout.items) {
    const difference = Math.abs(
      angleBetween(angle, Math.atan2(item.y - layout.origin.y, item.x - layout.origin.x))
    );
    if (!best || difference < best.difference) {
      best = { id: item.id, difference };
    }
  }

  return best?.id;
}

/** Radius of a ring item's button, in CSS pixels. */
export const itemRadius = 25;

/**
 * Which value a two-finger drag adjusts: vertical drags change the size and horizontal ones the opacity, decided by
 * the dominant direction once the fingers have moved `threshold` pixels; undefined before that.
 */
export function adjustAxis(delta: Point, threshold = 12): 'size' | 'opacity' | undefined {
  if (Math.hypot(delta.x, delta.y) < threshold) {
    return undefined;
  }

  return Math.abs(delta.y) >= Math.abs(delta.x) ? 'size' : 'opacity';
}

/** The brush size after dragging `dy` pixels: up doubles it every 110 px, down halves it; 1 to `max` px. */
export function adjustedSize(start: number, dy: number, max: number) {
  const size = start * 2 ** (-dy / 110);
  return Math.min(max, Math.max(1, size < 10 ? Math.round(size * 10) / 10 : Math.round(size)));
}

/** The opacity after dragging `dx` pixels: right raises it by 1% every 3 px; 1–100%. */
export function adjustedOpacity(start: number, dx: number) {
  return Math.min(1, Math.max(0.01, Math.round((start + dx / 300) * 100) / 100));
}

/** Points from `from` to `to`, both included, about `spacing` pixels apart; only `from` when they coincide. */
export function linePoints(from: Point, to: Point, spacing: number): Point[] {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / spacing);
  return Array.from({ length: steps + 1 }, (_, index) => ({
    x: from.x + ((to.x - from.x) * index) / Math.max(1, steps),
    y: from.y + ((to.y - from.y) * index) / Math.max(1, steps)
  }));
}

/** The widest fan of a ring, in radians. */
const ringSpan = (200 / 180) * Math.PI;

/** The smallest ring radius, so that a few items still leave room for the finger. */
const minRadius = 92;

/** How far `[low, high]` must move to fit `[min, max]`; zero when it fits. */
function overflow(low: number, high: number, min: number, max: number) {
  if (low < min) {
    return min - low;
  }

  if (high > max) {
    return max - high;
  }

  return 0;
}

/** The signed difference `a − b` of two angles, in `(−π, π]`. */
function angleBetween(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
