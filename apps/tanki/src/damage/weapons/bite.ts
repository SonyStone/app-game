type Point = { x: number; y: number };

/**
 * How hard a shell bites into armor where it hits: the hole and depth of its crater, as factors on
 * its own, from how far it flew and, for a gatling's stream, from where the stream hit before.
 * The battle core applies them to each hit; this module only works them out, so they can be
 * tested and weighed without physics.
 */

/**
 * Factors on the hole and depth of a shell's crater after it flew `travelled` px of its `range`:
 *
 * - With `fade`, it loses up to that share of both by the end of its range, as damage falls off
 *   with distance in Team Fortress 2.
 * - With `pointBlank`, it bites harder close to the muzzle: up to `depth` times as deep and `hole`
 *   times as wide right at it, falling off evenly to its own bite at `range` px, as a scattergun
 *   tears at point blank and Team Fortress 2's damage ramps up close.
 *
 * Both together multiply.
 */
export function biteAt(spec: { range: number; fade?: number; pointBlank?: PointBlank }, travelled: number) {
  const fade = 1 - (spec.fade ?? 0) * Math.min(Math.max(travelled / spec.range, 0), 1);
  const close = spec.pointBlank ? Math.max(1 - travelled / spec.pointBlank.range, 0) : 0;

  return {
    hole: fade * (1 + ((spec.pointBlank?.hole ?? 1) - 1) * close),
    depth: fade * (1 + ((spec.pointBlank?.depth ?? 1) - 1) * close)
  };
}

/** How a shell bites harder close to the muzzle; see `biteAt`. */
export type PointBlank = { range: number; depth: number; hole?: number };

/**
 * How a gatling's stream drills: every round landing within `radius` px of another round of the
 * same stream that hit the same body less than `memory` seconds before digs `gain` px deeper, up
 * to `most` px deeper, so a stream held on one spot bores in where scattered rounds only scratch.
 */
export type DrillSpec = { radius: number; gain: number; most: number; memory: number };

/** Where a round of a stream hit a body, in the body's own coordinates so the mark moves with it, by whom and when. */
export type DrillMark = Point & { shooter: unknown; at: number };

/**
 * Pixels deeper than its own depth a round of `shooter`'s stream digs where it hits a body at
 * `point`, in the body's coordinates, at time `now`, from `marks`, the rounds that hit that body
 * before (see `DrillSpec`). Rounds of other shooters do not count: two streams scatter apart.
 */
export function drillDepth(marks: readonly DrillMark[], point: Point, shooter: unknown, now: number, spec: DrillSpec) {
  let near = 0;

  for (const mark of marks) {
    if (mark.shooter === shooter && now - mark.at < spec.memory && Math.hypot(mark.x - point.x, mark.y - point.y) < spec.radius) {
      near++;
    }
  }

  return Math.min(near * spec.gain, spec.most);
}

/**
 * Adds the round of `shooter` that hit at `point` at `now` to `marks`, forgetting marks older than
 * `memory` seconds, so a body's list stays as short as the streams on it are fast.
 */
export function addDrillMark(marks: DrillMark[], point: Point, shooter: unknown, now: number, memory: number) {
  const kept = marks.filter((mark) => now - mark.at < memory);
  kept.push({ x: point.x, y: point.y, shooter, at: now });
  marks.splice(0, marks.length, ...kept);
}
