import type { Point } from '../../kit/createSketchCanvas';
import type { VariantProps } from '../../kit/variant';

/**
 * The HUD's geometry: eight directions around the summon point and what each one opens for either hand, the press
 * zones of the ring, and the rectangle helpers that keep strips inside the window and, in tap mode, off the ring.
 */

/** A function the HUD opens, one per direction. */
export type FunctionId = 'size' | 'opacity' | 'color' | 'tools' | 'layers' | 'presets' | 'history' | 'zoom';

/** One of eight directions, clockwise from east in screen space: 0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE. */
export type Direction = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** The hand that holds the pen. */
export type Hand = VariantProps['hand'];

/** All directions, clockwise from east. */
export const directions: readonly Direction[] = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The function in a direction. The horizontal axis is Size to the right (Photoshop's horizontal drag) and History to
 * the left (back in time); the vertical one is Opacity up and Zoom down. The diagonals mirror with the hand, so that
 * Tools and Layers sit on the pen hand's side and Color and Presets on the open side.
 */
export function functionAt(direction: Direction, hand: Hand): FunctionId {
  const mirrored = hand === 'right' && direction % 4 !== 0 ? (12 - direction) % 8 : direction;
  return leftHandedLayout[mirrored]!;
}

/** The direction that opens `fn` for this hand. */
export function directionOf(fn: FunctionId, hand: Hand): Direction {
  return directions.find((direction) => functionAt(direction, hand) === fn)!;
}

/** The direction nearest to a vector's angle. */
export function directionToward(vector: Point): Direction {
  const turn = Math.round(Math.atan2(vector.y, vector.x) / (Math.PI / 4));
  return (((turn % 8) + 8) % 8) as Direction;
}

/** A direction's unit vector. */
export function unitOf(direction: Direction): Point {
  const angle = (direction * Math.PI) / 4;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** The x sign of the side away from the pen hand, where strips put what the hand would cover. */
export function openSide(hand: Hand) {
  return hand === 'left' ? 1 : -1;
}

/**
 * Radii of the ring around the center, in CSS pixels: the hub (pan), the rim (rotate), the spokes, the labels and
 * the two-step chips, and how far the held press travels before it picks a direction.
 */
export const radii = { hub: 19, rim: 34, spokeFrom: 37, spokeTo: 48, label: 56, chip: 64, flick: 26 } as const;

/** What a press on the ring hits: the hub, the rim around it, or a direction beyond. */
export type Zone = 'hub' | 'rim' | Direction;

/** The zone under `point` for a ring centered at `center`. */
export function zoneAt(point: Point, center: Point): Zone {
  const offset = { x: point.x - center.x, y: point.y - center.y };
  const reach = Math.hypot(offset.x, offset.y);
  if (reach <= radii.hub) {
    return 'hub';
  }

  if (reach <= radii.rim) {
    return 'rim';
  }

  return directionToward(offset);
}

/** The distance between two points. */
export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Clamps `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** A rectangle in client pixels. */
export type Rect = { left: number; top: number; width: number; height: number };

/** Whether `point` lies in `rect` grown by `inflate` on every side. */
export function insideRect(rect: Rect, point: Point, inflate = 0) {
  return (
    point.x >= rect.left - inflate &&
    point.x <= rect.left + rect.width + inflate &&
    point.y >= rect.top - inflate &&
    point.y <= rect.top + rect.height + inflate
  );
}

/** `rect` moved by `delta`. */
export function shiftRect(rect: Rect, delta: Point): Rect {
  return { ...rect, left: rect.left + delta.x, top: rect.top + delta.y };
}

/** The smallest rectangle around all of `rects`. */
export function unionRect(...rects: Rect[]): Rect {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** How far `rect` must move to lie inside the window, below the gallery's bar. */
export function fitDelta(rect: Rect): Point {
  const fit = (start: number, size: number, min: number, max: number) =>
    size > max - min ? min - start : start < min ? min - start : start + size > max ? max - size - start : 0;
  return {
    x: fit(rect.left, rect.width, windowEdges.margin, innerWidth - windowEdges.margin),
    y: fit(rect.top, rect.height, windowEdges.top, innerHeight - windowEdges.margin)
  };
}

/**
 * How far `rect` must move along `along` (a unit vector) so that it no longer overlaps the circle at `center`,
 * stepping 4 px at a time up to 480 px.
 */
export function clearOfCircle(rect: Rect, center: Point, radius: number, along: Point): Point {
  for (let moved = 0; moved <= 480; moved += 4) {
    const delta = { x: along.x * moved, y: along.y * moved };
    if (!overlapsCircle(shiftRect(rect, delta), center, radius)) {
      return delta;
    }
  }

  return { x: 0, y: 0 };
}

/** Whether `rect` overlaps the circle of `radius` around `center`. */
export function overlapsCircle(rect: Rect, center: Point, radius: number) {
  const nearest = {
    x: clamp(center.x, rect.left, rect.left + rect.width),
    y: clamp(center.y, rect.top, rect.top + rect.height)
  };
  return distance(nearest, center) < radius;
}

/** `point` moved inside the window by at least `reach` on each axis, below the gallery's bar. */
export function clampToWindow(point: Point, reach: Point): Point {
  const fit = (value: number, min: number, max: number) => (min > max ? (min + max) / 2 : clamp(value, min, max));
  return {
    x: fit(point.x, windowEdges.margin + reach.x, innerWidth - windowEdges.margin - reach.x),
    y: fit(point.y, windowEdges.top + reach.y, innerHeight - windowEdges.margin - reach.y)
  };
}

/** The window's free edges: a margin all round and the gallery's bar at the top. */
export const windowEdges = { margin: 8, top: 50 } as const;

const leftHandedLayout = [
  'size',
  'presets',
  'zoom',
  'layers',
  'history',
  'tools',
  'opacity',
  'color'
] as const satisfies readonly FunctionId[];
