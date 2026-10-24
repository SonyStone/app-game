import { carve, CHANNELS, clipToGrid, crack, sampleField, surfaceNormal, type DamageField } from './field';

type Point = { x: number; y: number };

/**
 * A rail, the Sniper's instant shot, inside one body: `traceRail` follows its line through the
 * body's armor field and tells what the line meets there, and `cutRail` cuts the slit it leaves.
 * Both work in the field's local coordinates, so the battle turns world points into a body's frame
 * first, and both are pure functions of the field, which the battle then rebuilds and uploads.
 */

/**
 * Follows a rail's line through `field` from `origin` along the unit `direction`: where it first
 * meets armor, how much armor lies along it, whether it crosses the core, and where it ends, out
 * the far side or where its power runs out inside.
 *
 * Armor counts only where the line runs in it, holes and slits it crosses being free, at `cost`
 * power per pixel: 1 for a tank's or a wreck's armor, less for wood. The core counts as crossed
 * where the line comes within `graze` px of it before the power runs out, whether armor still
 * covers it there or a hole has opened it: a slit that touches the core blows it, from any side.
 *
 * @param options.power - Pixels of armor, at `cost`, the line still goes through.
 * @param options.cost - Power the line spends per pixel of armor; defaults to 1.
 * @param options.graze - How close to the core the line must come to cross it, usually half the
 *   slit's width; defaults to 0.
 * @returns `undefined` when the line meets no armor. Otherwise distances along the line from
 *   `origin`: `entry` where it first meets armor and `end` where it comes out, or where it stops
 *   when `through` is false; `armor`, the pixels of armor it went through; and `core`, where it
 *   crosses the core, if it does.
 */
export function traceRail(field: DamageField, origin: Point, direction: Point, options: { power: number; cost?: number; graze?: number }): RailTrace | undefined {
  const cost = options.cost ?? 1;
  const graze = options.graze ?? 0;
  const span = clipToGrid(field, origin, direction, Infinity);

  if (!span) {
    return undefined;
  }

  const sample = new Float32Array(CHANNELS);
  const step = field.cell / 2;
  let entry: number | undefined;
  let last = 0;
  let armor = 0;
  let core: number | undefined;

  for (let distance = span.enter; distance <= span.exit; distance += step) {
    sampleField(field, origin.x + direction.x * distance, origin.y + direction.y * distance, sample);

    // An open core is crossed through the hole over it as much as a buried one through the armor.
    if (core === undefined && sample[2] < graze) {
      entry ??= distance;
      core = distance;
    }

    if (sample[0] >= 0) {
      continue;
    }

    entry ??= distance;

    if ((armor + step) * cost > options.power) {
      return { entry, end: distance, through: false, armor, core };
    }

    armor += step;
    last = distance;
  }

  return entry === undefined ? undefined : { entry, end: Math.max(last + step, entry), through: true, armor, core };
}

/** What `traceRail` found along a rail's line through one body. */
export type RailTrace = { entry: number; end: number; through: boolean; armor: number; core: number | undefined };

/**
 * Cuts the slit a rail leaves along `trace` through `field`: a channel `slit` px wide from where
 * the line went in to where it came out or stopped, a hole of `hole` px radius where it went in,
 * and where it came out a larger, ragged hole with a petal or two of armor torn off the rim, which
 * the next `detachLoosePieces` throws off as scrap. A line that stopped inside ends in a small pit.
 *
 * The channel is cut in dashes with a bridge of armor between them every `RAIL_DASH` px, so a slit
 * across the whole hull leaves it in one piece instead of cutting it in two: it reads as one dark
 * line, stitched across.
 *
 * @param cut.seed - Varies the holes' outlines and the torn petals.
 */
export function cutRail(field: DamageField, origin: Point, direction: Point, trace: RailTrace, cut: { slit: number; hole: number; seed: number }) {
  const at = (along: number) => ({ x: origin.x + direction.x * along, y: origin.y + direction.y * along });
  // The slope of the armor where the line comes out, which the petals peel back along, read before the slit opens it.
  const normal = surfaceNormal(field, at(trace.end - 0.5)) ?? direction;
  cutSlit(field, at(trace.entry), at(trace.end), cut.slit);
  carve(field, at(trace.entry + cut.hole * 0.3), cut.hole, 0.25, cut.seed);

  if (!trace.through) {
    carve(field, at(trace.end), cut.hole * 0.7, 0.3, cut.seed + 1);
    return;
  }

  const surface = at(trace.end);
  const radius = cut.hole * EXIT_HOLE;
  carve(field, { x: surface.x - normal.x * radius * 0.4, y: surface.y - normal.y * radius * 0.4 }, radius, 0.45, cut.seed + 2);
  tearPetals(field, surface, normal, radius, cut.seed);
}

/**
 * Cuts a rail's slit `width` px wide into `field` along the segment from `from` to `to`, in dashes
 * of `RAIL_DASH` px with a bridge of material left whole between two, so a slit clean across a
 * body leaves it in one piece.
 */
export function cutSlit(field: DamageField, from: Point, to: Point, width: number) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const direction = length > 0 ? { x: (to.x - from.x) / length, y: (to.y - from.y) / length } : { x: 1, y: 0 };
  const at = (along: number) => ({ x: from.x + direction.x * along, y: from.y + direction.y * along });

  for (let along = 0; along < length || along === 0; along += RAIL_DASH + width + RAIL_BRIDGE) {
    crack(field, at(along), at(Math.min(along + RAIL_DASH, length)), width);
  }
}

/** Pixels of each dash of a rail's slit, and of material left whole between two dashes. */
export const RAIL_DASH = 8;
const RAIL_BRIDGE = 1.4;
/** The exit hole against the entry hole. */
const EXIT_HOLE = 1.3;

/**
 * Tears one or two petals of armor off beside an exit hole of `radius` at `surface`, where the
 * armor's outward normal is `normal`: a crack from the hole's rim a little way under the surface
 * and back out through it, which leaves a sliver of armor between the crack and the surface
 * hanging free.
 */
function tearPetals(field: DamageField, surface: Point, normal: Point, radius: number, seed: number) {
  const tangent = { x: -normal.y, y: normal.x };
  const sides = fract(seed * 0.618) < 0.5 ? [1] : [1, -1];
  const along = (side: number, distance: number, height: number) => ({
    x: surface.x + tangent.x * side * distance + normal.x * height,
    y: surface.y + tangent.y * side * distance + normal.y * height
  });

  for (const [index, side] of sides.entries()) {
    const length = PETAL_LENGTH * (0.8 + fract(seed * (1.37 + index)) * 0.6);
    crack(field, along(side, radius * 0.7, -radius * 0.5), along(side, radius + length * 0.55, -PETAL_DEPTH), PETAL_CRACK);
    crack(field, along(side, radius + length * 0.55, -PETAL_DEPTH), along(side, radius + length, 1), PETAL_CRACK);
  }
}

/** A petal's length along the surface and how deep under it it is torn, in pixels, and the width of the tear. */
const PETAL_LENGTH = 4.5;
const PETAL_DEPTH = 1.8;
const PETAL_CRACK = 1;

function fract(value: number) {
  return value - Math.floor(value);
}
