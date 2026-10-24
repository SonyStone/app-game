import { createField, FAR } from './field';

/**
 * Destructible fields of the arena objects, matching their drawings in `../arena/draw.ts`:
 * front along +x, sizes in pixels.
 */

/**
 * A tank hull: the 40 x 25 rounded box with the chevron, and the core at the rear, where the
 * engine is. The armor covers the core, so shots have to chip their way in; the rear armor is
 * the thinnest.
 */
export function createHullField() {
  return createField({ minX: -22, minY: -14.5, maxX: 22, maxY: 14.5 }, 0.5, (x, y) => {
    const core = Math.hypot(x - HULL_CORE.x, y - HULL_CORE.y) - HULL_CORE.radius;
    const armor = roundedBox(x, y, 20, 12.5, 1);
    const pattern = Math.min(segment(x, y, -19.5, 12.25, 20, 0), segment(x, y, 20, 0, -19.5, -12.25)) - LINE_HALF_WIDTH;

    return [armor, pattern, core, 0];
  });
}

/** Core of a hull in hull coordinates. */
export const HULL_CORE = { x: -11, y: 0, radius: 4.5 };

/** A crate: the long box crossed by its diagonals. It has no core and only crumbles. */
export function createCrateField() {
  return createField({ minX: -23.5, minY: -48.5, maxX: 23.5, maxY: 48.5 }, 1, (x, y) => {
    const armor = roundedBox(x, y, 21.25, 46.25, 2);
    const pattern = Math.min(segment(x, y, -20.75, -45, 20.75, 45), segment(x, y, 20.75, -45, -20.75, 45)) - LINE_HALF_WIDTH;

    return [armor, pattern, FAR, 0];
  });
}

/** A shell in flight: a slim capsule 9 px long pointing along +x, with no core. */
export function createShellField() {
  return createField({ minX: -6.5, minY: -3, maxX: 6.5, maxY: 3 }, 0.5, (x, y) => [segment(x, y, -3, 0, 3, 0) - 1.5, FAR, FAR, 0]);
}

const LINE_HALF_WIDTH = 0.5;

/** Signed distance to a box of half size `halfX` x `halfY` with rounded corners. */
function roundedBox(x: number, y: number, halfX: number, halfY: number, radius: number) {
  const qx = Math.abs(x) - halfX + radius;
  const qy = Math.abs(y) - halfY + radius;

  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Distance to the segment from (ax, ay) to (bx, by). */
function segment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.min(Math.max(((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby), 0), 1);

  return Math.hypot(x - ax - abx * t, y - ay - aby * t);
}
