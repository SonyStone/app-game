import type { Point } from '../../kit/createSketchCanvas';

/**
 * The Hive's geometry: hexagons on a pointy-top grid, exact point-in-polygon hit tests and the fisheye lens. All
 * coordinates are CSS pixels; y grows downward.
 */

/** √3: a pointy-top hexagon is √3 × its circumradius wide. */
export const SQRT3 = Math.sqrt(3);

/**
 * A slot of a pointy-top hex grid in doubled coordinates: `u` counts half cell widths across, `r` counts rows down,
 * and `u + r` is even. Neighbours are `(u ± 2, r)` and `(u ± 1, r ± 1)`.
 */
export function slot(u: number, r: number, width: number): Point {
  return { x: (u * width) / 2, y: (r * width * SQRT3) / 2 };
}

/** The number of steps between two slots in doubled coordinates. */
export function slotDistance(du: number, dr: number) {
  const across = Math.abs(du);
  const down = Math.abs(dr);
  return down + Math.max(0, (across - down) / 2);
}

/**
 * The slots `ring` steps around the origin, in doubled coordinates, clockwise in screen terms from the slot straight
 * above (or, for odd rings without one, the first slot right of it).
 */
export function ringSlots(ring: number): { u: number; r: number }[] {
  const found: { u: number; r: number; angle: number }[] = [];
  for (let r = -ring; r <= ring; r++) {
    for (let u = -2 * ring; u <= 2 * ring; u++) {
      if ((u + r) % 2 === 0 && slotDistance(u, r) === ring) {
        found.push({ u, r, angle: clockAngle({ x: u, y: r * SQRT3 }) });
      }
    }
  }

  return found.sort((a, b) => a.angle - b.angle).map(({ u, r }) => ({ u, r }));
}

/** The direction of `offset` in degrees clockwise from straight up, 0–360. */
export function clockAngle(offset: Point) {
  return ((Math.atan2(offset.x, -offset.y) * 180) / Math.PI + 360) % 360;
}

/**
 * The corners of a regular hexagon around `center` with circumradius `radius`: pointy-top (a corner straight up) by
 * default, flat-top (a corner to the right) with `flat`. Clockwise on screen.
 */
export function hexagon(center: Point, radius: number, flat = false): Point[] {
  const start = flat ? 0 : -90;
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((start + 60 * index) * Math.PI) / 180;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });
}

/** Whether `point` lies inside `polygon` (any simple polygon), by the even-odd rule. */
export function contains(polygon: readonly Point[], point: Point) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }

  return inside;
}

/** The distance from `point` to the outline of `polygon`; 0 inside. */
export function distanceTo(polygon: readonly Point[], point: Point) {
  if (contains(polygon, point)) {
    return 0;
  }

  let best = Infinity;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(a.x + dx * t - point.x, a.y + dy * t - point.y));
  }

  return best;
}

/** The part of a convex polygon below the horizontal line at `level` (larger y), for a cell's fill gauge. */
export function below(polygon: readonly Point[], level: number): Point[] {
  const kept: Point[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    if (a.y >= level) {
      kept.push(a);
    }

    if (a.y >= level !== b.y >= level) {
      const t = (level - a.y) / (b.y - a.y);
      kept.push({ x: a.x + (b.x - a.x) * t, y: level });
    }
  }

  return kept;
}

/**
 * The fisheye: a radial lens around `focus` that magnifies by `1 + amount` at its middle, pushes the surroundings
 * out a few pixels and squeezes a ring around that a little, leaving everything beyond about three `reach`es as it
 * was. The focus maps to itself, so whatever lies under a pointer at the focus stays under it: aiming does not
 * change, only the picture does.
 */
export function lensPoint(point: Point, focus: Point, amount: number): Point {
  if (amount <= 0) {
    return point;
  }

  const dx = point.x - focus.x;
  const dy = point.y - focus.y;
  const ratio = (dx * dx + dy * dy) / (lensReach * lensReach);
  if (ratio > lensCutoff) {
    return point;
  }

  const grow = 1 + amount * Math.exp(-ratio);
  return { x: focus.x + dx * grow, y: focus.y + dy * grow };
}

/** How much the lens magnifies at `point`, the mean of its radial and tangential stretch, for contents. */
export function lensScale(point: Point, focus: Point, amount: number) {
  if (amount <= 0) {
    return 1;
  }

  const ratio = ((point.x - focus.x) ** 2 + (point.y - focus.y) ** 2) / (lensReach * lensReach);
  if (ratio > lensCutoff) {
    return 1;
  }

  const falloff = Math.exp(-ratio);
  return Math.sqrt((1 + amount * falloff) * (1 + amount * (1 - 2 * ratio) * falloff));
}

/** The lens's radius of influence in CSS pixels: about one and a half cells. */
const lensReach = 62;

/** Beyond √12 reaches (about 215 px) the lens moves points by less than a hundredth of a pixel: none at all. */
const lensCutoff = 12;

/** The lens's strongest magnification less one, as the brief allows: at most about 1.25×. */
export const lensPower = 0.22;
