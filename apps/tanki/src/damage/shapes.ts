import { createField, FAR } from './field';

/**
 * Destructible fields of the arena objects, matching their drawings in `../arena/draw.ts`:
 * front along +x, sizes in pixels.
 */

/**
 * The shape of a tank hull: a rounded box around the hull's center with its core under the
 * armor, at the rear where the engine is, and the lines painted on it. The armor between the core
 * and the surface is what shots have to chip through, so the core's place sets how thick the
 * armor is on every side.
 */
export type HullSpec = {
  /** Half the hull's length along +x and half its width, in pixels. */
  halfLength: number;
  halfWidth: number;
  /** Radius of the rounded corners. */
  corner: number;
  /** Core in hull coordinates. */
  core: { x: number; y: number; radius: number };
  /**
   * Field cell size in pixels: 0.5 for hulls up to 44 x 29 px with their margin; a larger hull
   * needs coarser cells to fit a renderer slot of `SLOT_CELLS`.
   */
  cell: number;
  /**
   * Lines painted on the armor: the medium tank's `chevron`; the light tank's narrow `dart`; the
   * heavy tank's `plated` double chevron between track skirts; the `deck` of a casemate gun,
   * whose engine grille lies behind the casemate.
   */
  pattern: 'chevron' | 'dart' | 'plated' | 'deck';
};

/**
 * The medium tank's hull: the 40 x 25 rounded box with the chevron, its core 4.5 px under the
 * rear armor, 8 px under the sides and 26.5 px behind the front.
 */
export const MEDIUM_HULL: HullSpec = { halfLength: 20, halfWidth: 12.5, corner: 1, core: { x: -11, y: 0, radius: 4.5 }, cell: 0.5, pattern: 'chevron' };

/**
 * A tank hull of `spec`, by default the medium tank's: the armor covers the core, so shots have
 * to chip their way in, and the rear armor is the thinnest.
 */
export function createHullField(spec: HullSpec = MEDIUM_HULL) {
  const { halfLength, halfWidth, core } = spec;
  const margin = 2;
  const bounds = { minX: -halfLength - margin, minY: -halfWidth - margin, maxX: halfLength + margin, maxY: halfWidth + margin };

  return createField(bounds, spec.cell, (x, y) => {
    const armor = roundedBox(x, y, halfLength, halfWidth, spec.corner);
    const pattern = hullPattern(spec, x, y) - LINE_HALF_WIDTH;
    const coreDistance = Math.hypot(x - core.x, y - core.y) - core.radius;

    return [armor, pattern, coreDistance, 0];
  });
}

/** Core of the medium tank's hull in hull coordinates; other hulls have theirs in their `HullSpec`. */
export const HULL_CORE = MEDIUM_HULL.core;

/** Distance to the painted lines of a hull. */
function hullPattern(spec: HullSpec, x: number, y: number) {
  const back = -spec.halfLength + 0.5;
  const side = spec.halfWidth - 0.25;
  const nose = spec.halfLength;

  switch (spec.pattern) {
    case 'chevron':
      return chevron(x, y, back, side, nose);

    case 'dart':
      return chevron(x, y, -spec.halfLength * 0.35, side * 0.7, nose);

    case 'plated': {
      // Track skirts along both sides, and a second chevron inside the first.
      const skirt = spec.halfWidth - 3.5;
      const skirts = Math.min(segment(x, y, back + 1, skirt, nose - 1, skirt), segment(x, y, back + 1, -skirt, nose - 1, -skirt));
      return Math.min(chevron(x, y, back + 2, skirt, nose - 1), chevron(x, y, back + 9, skirt - 2, nose - 9), skirts);
    }

    case 'deck': {
      // Three slats of the engine grille across the rear deck.
      const left = -spec.halfLength + 3;
      const across = spec.halfWidth - 3.5;
      return Math.min(segment(x, y, left, -across, left, across), segment(x, y, left + 3, -across, left + 3, across), segment(x, y, left + 6, -across, left + 6, across));
    }
  }
}

/** Distance to a chevron from the rear corners at `back`, `side` to the nose at `nose`, 0. */
function chevron(x: number, y: number, back: number, side: number, nose: number) {
  return Math.min(segment(x, y, back, side, nose, 0), segment(x, y, nose, 0, back, -side));
}

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

/** A grenade in flight: a ball 9 px across with a band painted around it. */
export function createGrenadeField() {
  return createField({ minX: -6.5, minY: -6.5, maxX: 6.5, maxY: 6.5 }, 0.5, (x, y) => [Math.hypot(x, y) - 4.5, Math.abs(x) - 0.5, FAR, 0]);
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
