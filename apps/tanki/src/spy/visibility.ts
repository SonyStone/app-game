import type { VisibilityRule } from './variants';

type Point = { x: number; y: number };

/**
 * Whether a tank at `watcher`, its barrel pointing along `watcher.facing` in world radians, sees
 * the spider at `target` by `rule` (see `VISIBILITY_RULES`). Nothing is seen farther than
 * `VIEW.range` or through what `clear` reports blocked.
 *
 * @param revealed - An action of the spider gives it away right now, which shows it under `hidden`.
 * @param clear - Whether the straight line between two points is free of walls and crates.
 */
export function sees(
  rule: VisibilityRule,
  watcher: Point & { facing: number },
  target: Point,
  revealed: boolean,
  clear: (from: Point, to: Point) => boolean
) {
  const distance = Math.hypot(target.x - watcher.x, target.y - watcher.y);

  if (distance > VIEW.range || (rule === 'hidden' && !revealed)) {
    return false;
  }

  if (rule !== 'hidden') {
    const offAxis = Math.abs(angleBetween(watcher.facing, Math.atan2(target.y - watcher.y, target.x - watcher.x)));

    if (offAxis > VIEW.halfAngle || (rule === 'range' && distance > VIEW.shortRange)) {
      return false;
    }
  }

  return clear(watcher, target);
}

/** How the rules of `VISIBILITY_RULES` measure sight, in pixels and radians. */
export const VIEW = {
  /** Half the opening of the cone around the barrel: 50 degrees to either side. */
  halfAngle: (50 * Math.PI) / 180,
  /** Farthest anything is seen, about a screen across at the start zoom. */
  range: 900,
  /** Farthest the spider is seen under `range`. */
  shortRange: 260,
  /** Seconds an action shows the spider under `hidden`. */
  revealTime: 2
};

/**
 * The area a tank sees by `rule`, as a fan of `rays` evenly spaced over the cone (or all around
 * for a revealed spider under `hidden`): each ray's world angle and how far it reaches before a
 * wall or crate or the rule's range stops it. `undefined` when the rule shows nothing.
 *
 * @param reach - Distance from `watcher` along a world angle to the first wall or crate, at most `limit`.
 * @param widen - Radians added to either side of the cone, for a margin of safety.
 */
export function sightFan(
  rule: VisibilityRule,
  watcher: Point & { facing: number },
  revealed: boolean,
  reach: (angle: number, limit: number) => number,
  rays = 40,
  widen = 0
) {
  if (rule === 'hidden' && !revealed) {
    return undefined;
  }

  const allAround = rule === 'hidden';
  const half = allAround ? Math.PI : Math.min(VIEW.halfAngle + widen, Math.PI);
  const limit = rule === 'range' ? VIEW.shortRange : VIEW.range;
  const angles = Array.from({ length: rays }, (_, index) => watcher.facing - half + (2 * half * index) / (rays - 1));

  return { center: { x: watcher.x, y: watcher.y }, half, limit, angles, reaches: angles.map((angle) => reach(angle, limit)) };
}

/** A tank's area of sight from `sightFan`. */
export type SightFan = NonNullable<ReturnType<typeof sightFan>>;

/**
 * Whether `point` lies in `fan`: within its angle and before the ray nearest its bearing stops.
 * Cheap enough to test a whole grid against, which `sees` with its line-of-sight query is not.
 */
export function inFan(fan: SightFan, point: Point) {
  const dx = point.x - fan.center.x;
  const dy = point.y - fan.center.y;
  const distance = Math.hypot(dx, dy);

  if (distance > fan.limit) {
    return false;
  }

  const first = fan.angles[0];
  const offset = angleBetween(first + fan.half, Math.atan2(dy, dx)) + fan.half;

  if (offset < 0 || offset > fan.half * 2) {
    return false;
  }

  const index = Math.round((offset / (fan.half * 2)) * (fan.angles.length - 1));
  return distance <= fan.reaches[index];
}

/** Signed angle from `from` to `to`, in [-π, π). */
export function angleBetween(from: number, to: number) {
  const turn = (((to - from) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2);
  return turn - Math.PI;
}
