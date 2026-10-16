import { pebbleRadius, type Point, type ViewSize } from './placement';

/**
 * Places the fan's rings of items around the pebble at `center`, opening toward `inward` (radians, screen angles):
 * each ring at least `gap` pixels beyond the previous one, on the arc that stays on screen within 90° to either side
 * of `inward`. A ring grows until its items fit their `spacing` on that arc, so a fan in a corner, with a quarter
 * circle to use, is wider than one at an edge, with a half circle. `full` rings spread their items over the whole arc;
 * `compact` rings keep them at `spacing`, centered on the arc. Items are ordered clockwise.
 */
export function fanLayout(center: Point, inward: number, view: ViewSize, rings: readonly FanRing[]): FanRingLayout[] {
  const placed: FanRingLayout[] = [];
  let previous = 0;
  for (const ring of rings) {
    const layout = placeRing(center, inward, view, ring, Math.max(ring.minRadius, previous + ring.gap));
    placed.push(layout);
    previous = layout.radius;
  }

  return placed;
}

/** One ring of the fan: how many items, their size, and how they are spaced. */
export type FanRing = {
  count: number;
  /** The items' diameter in CSS pixels; they keep this far inside the screen. */
  item: number;
  /** Least distance between neighboring item centers along the arc. */
  spacing: number;
  spread: 'full' | 'compact';
  /** Least distance from the pebble's center. */
  minRadius: number;
  /** Least distance from the previous ring. */
  gap: number;
};

/** A placed ring: its radius and its items' centers, clockwise. */
export type FanRingLayout = { radius: number; points: Point[] };

/** The fan's nearest ring: undo, "more" and redo, a fingertip's width clear of the pebble. */
export const historyRing: FanRing = {
  count: 3,
  item: 44,
  spacing: 54,
  spread: 'full',
  minRadius: pebbleRadius + 26 + 22,
  gap: 0
};

/** The fan's middle ring: the brushes and the eraser; `count` follows the brushes. */
export const toolRing: FanRing = { count: 6, item: 52, spacing: 58, spread: 'compact', minRadius: 0, gap: 60 };

/** The fan's outer ring: the colors; `count` follows the colors offered. */
export const colorRing: FanRing = { count: 7, item: 32, spacing: 40, spread: 'compact', minRadius: 0, gap: 54 };

/** Distance from the pebble's center to the near side of a sheet beside the fan: just beyond the nearest ring. */
export const sheetOffset = historyRing.minRadius + historyRing.item / 2 + 12;

function placeRing(center: Point, inward: number, view: ViewSize, ring: FanRing, start: number): FanRingLayout {
  const margin = ring.item / 2 + 4;
  const inside = (angle: number, radius: number) => {
    const x = center.x + Math.cos(angle) * radius;
    const y = center.y + Math.sin(angle) * radius;
    return x >= margin && x <= view.width - margin && y >= margin && y <= view.height - margin;
  };
  const longest = Math.hypot(view.width, view.height);
  let radius = start;
  for (; radius < longest; radius += 4) {
    const arc = openArc(inward, radius, inside);
    const needed = ring.count > 1 ? ((ring.count - 1) * ring.spacing) / radius : 0;
    if (arc && arc.to - arc.from >= needed) {
      return { radius, points: spreadOver(arc, needed, ring, center, radius) };
    }
  }

  // No arc fits, such as on a tiny screen: overlap the items at the start radius instead.
  const needed = ring.count > 1 ? ((ring.count - 1) * ring.spacing) / start : 0;
  const arc = { from: inward - needed / 2, to: inward + needed / 2 };
  return { radius: start, points: spreadOver(arc, needed, ring, center, start) };
}

/**
 * The on-screen arc around `inward` at `radius`, within 90° to either side, scanned in small steps; none when even
 * `inward` itself is off screen.
 */
function openArc(inward: number, radius: number, inside: (angle: number, radius: number) => boolean) {
  if (!inside(inward, radius)) {
    return undefined;
  }

  const step = Math.PI / 180;
  const limit = Math.PI / 2 + step / 2;
  let from = 0;
  while (from - step >= -limit && inside(inward + from - step, radius)) {
    from -= step;
  }

  let to = 0;
  while (to + step <= limit && inside(inward + to + step, radius)) {
    to += step;
  }

  return { from: inward + from, to: inward + to };
}

/** Item centers on `arc`: spread over all of it, or `needed` wide in its middle. */
function spreadOver(
  arc: { from: number; to: number },
  needed: number,
  ring: FanRing,
  center: Point,
  radius: number
): Point[] {
  const width = ring.spread === 'full' ? arc.to - arc.from : needed;
  const from = (arc.from + arc.to) / 2 - width / 2;
  return Array.from({ length: ring.count }, (_, index) => {
    const angle = ring.count > 1 ? from + (width * index) / (ring.count - 1) : from + width / 2;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

/**
 * The top-left corner of a sheet of `size` that opens from the pebble at `center` toward `inward`: its near side
 * `offset` pixels from the pebble's center along that direction, kept `margin` pixels inside the view. When the view
 * pushes the sheet back over the pebble's `offset` circle, as for a tall sheet below a pebble in the open, it opens
 * to the side, above or below instead, whichever is nearest `inward` and stays clear of the circle; failing all, it
 * goes where it covers the circle least.
 */
export function placeSheet(
  center: Point,
  inward: number,
  size: { width: number; height: number },
  view: ViewSize,
  offset = 40,
  margin = 12
): Point {
  const turn = (angle: number) => Math.abs(Math.atan2(Math.sin(angle - inward), Math.cos(angle - inward)));
  const sides = [0, Math.PI / 2, Math.PI, -Math.PI / 2].sort((a, b) => turn(a) - turn(b));
  let best: { at: Point; clearance: number } | undefined;
  for (const direction of [inward, ...sides]) {
    const at = sheetToward(center, direction, size, view, offset, margin);
    const clearance = distanceToBox(center, at, size);
    if (clearance >= offset - 0.5) {
      return at;
    }

    if (!best || clearance > best.clearance) {
      best = { at, clearance };
    }
  }

  return best!.at;
}

/** The sheet's top-left corner with its near side `offset` from `center` toward `direction`, inside the view. */
function sheetToward(
  center: Point,
  direction: number,
  size: { width: number; height: number },
  view: ViewSize,
  offset: number,
  margin: number
): Point {
  const dx = Math.cos(direction);
  const dy = Math.sin(direction);
  // How far the sheet's center lies from its near side along the direction.
  const half = (Math.abs(dx) * size.width) / 2 + (Math.abs(dy) * size.height) / 2;
  const x = center.x + dx * (offset + half) - size.width / 2;
  const y = center.y + dy * (offset + half) - size.height / 2;
  return {
    x: clamp(x, margin, view.width - margin - size.width),
    y: clamp(y, margin, view.height - margin - size.height)
  };
}

/** Distance from `point` to the nearest point of the box at `at` of `size`; 0 inside it. */
function distanceToBox(point: Point, at: Point, size: { width: number; height: number }) {
  const x = clamp(point.x, at.x, at.x + size.width);
  const y = clamp(point.y, at.y, at.y + size.height);
  return Math.hypot(point.x - x, point.y - y);
}

/** `value` within `min`…`max`; `min` wins when the range is empty. */
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
