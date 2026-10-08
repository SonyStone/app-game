import type { Point } from '../../kit/createSketchCanvas';

/**
 * The eight directions of a pie menu, clockwise from the right as screen angles go: 0 is east, 2 south, 4 west,
 * 6 north. Blender and Maya marking menus both use these eight, the most a flick can tell apart reliably.
 */
export type Direction = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const directions: readonly Direction[] = [0, 1, 2, 3, 4, 5, 6, 7];

/** The direction a vector from the pie's center points at; every angle belongs to one, so the reach is unlimited. */
export function directionAt(dx: number, dy: number): Direction {
  const angle = Math.atan2(dy, dx);
  return ((Math.round(angle / (Math.PI / 4)) + 8) % 8) as Direction;
}

/** The point at `radius` from `center` in direction `direction`. */
export function directionPoint(center: Point, direction: Direction, radius: number): Point {
  const angle = (direction * Math.PI) / 4;
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

/**
 * How an item's box hangs from its point on the circle, as a CSS `translate`: boxes on the right start at the point
 * and grow outward, boxes on the left end there, and the top and bottom ones are centered, so labels never cover the
 * middle.
 */
export function anchorTranslate(direction: Direction) {
  const angle = (direction * Math.PI) / 4;
  const x = Math.cos(angle) > 0.3 ? '0%' : Math.cos(angle) < -0.3 ? '-100%' : '-50%';
  const y = Math.sin(angle) > 0.3 ? '0%' : Math.sin(angle) < -0.3 ? '-100%' : '-50%';
  return `${x} ${y}`;
}

/** The direction mirrored left to right, for a right-handed layout. */
export function mirrored(direction: Direction): Direction {
  return ((12 - direction) % 8) as Direction;
}

/**
 * Number keys laid out as a numeric keypad around 5, as Blender's pie menus take them: 8 is up, 4 left, 9 up-right.
 * Both the top-row digits and the keypad work.
 */
export const keypadDirections: Readonly<Record<string, Direction>> = {
  6: 0,
  3: 1,
  2: 2,
  1: 3,
  4: 4,
  7: 5,
  8: 6,
  9: 7
};

/** The key that picks a direction, for hints on the items. */
export const directionKeys: Readonly<Record<Direction, string>> = {
  0: '6',
  1: '3',
  2: '2',
  3: '1',
  4: '4',
  5: '7',
  6: '8',
  7: '9'
};

/** The direction the held arrow keys point at, or `undefined` when they cancel out. */
export function arrowDirection(held: ReadonlySet<string>): Direction | undefined {
  const dx = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
  const dy = (held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0);
  return dx === 0 && dy === 0 ? undefined : directionAt(dx, dy);
}
