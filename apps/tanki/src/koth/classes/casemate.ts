import type { Tank } from '../../arena/bodies';

type Point = { x: number; y: number };

/**
 * Keeps a casemate gun inside its arc: `tank.turretAngle`, the gun's world heading, is cut to
 * `arc` radians either side of the hull's heading.
 */
export function clampGun(tank: Tank, arc: number) {
  const heading = tank.hull.rotation();
  const offset = angleBetween(heading, tank.turretAngle);
  tank.turretAngle = heading + Math.min(Math.max(offset, -arc), arc);
}

/** Whether a casemate gun with `arc` can point along `angle` without the hull turning. */
export function inArc(tank: Tank, angle: number, arc: number) {
  return Math.abs(angleBetween(tank.hull.rotation(), angle)) <= arc;
}

/**
 * Drive input that turns a tank on the spot toward `heading` through its tow: the pull, pinned
 * in front of the hull, is driven sideways round the hull's center at the speed that turns the
 * hull at up to `traverse` radians per second, slower as the hull nears the heading, and drawn
 * back toward `pivot`, where the hull's center stood when the turn began, so the hull swings
 * round after it without driving off.
 *
 * @param pullSpeed - The tank's pull speed at full input, which the returned input is a share of.
 * @returns A drive direction of length up to 1 in world axes, as for `driveTank`.
 */
export function turnInPlace(tank: Tank, pivot: Point, heading: number, traverse: number, pullSpeed: number): Point {
  const current = tank.hull.rotation();
  const center = tank.hull.translation();
  const spin = Math.min(Math.max(angleBetween(current, heading) * TURN_GAIN, -traverse), traverse);
  const sideways = spin * ANCHOR * SPIN_BOOST;
  const velocity = {
    x: -Math.sin(current) * sideways + (pivot.x - center.x) * RECENTER,
    y: Math.cos(current) * sideways + (pivot.y - center.y) * RECENTER
  };
  const share = Math.hypot(velocity.x, velocity.y) / pullSpeed;

  return share > 1 ? { x: velocity.x / pullSpeed / share, y: velocity.y / pullSpeed / share } : { x: velocity.x / pullSpeed, y: velocity.y / pullSpeed };
}

/** Distance of the pull's pin in front of the hull's center, as in `../../arena/bodies`. */
const ANCHOR = 15;
/** Turn rate wanted per radian still to turn, per second, so the hull slows as it comes round. */
const TURN_GAIN = 5;
/**
 * How much faster than the pin should move the pull is driven: the tow passes only part of the
 * pull's speed on, and a push at the nose turns the hull only partly, shoving it aside as well.
 */
const SPIN_BOOST = 2.4;
/** How fast the pull draws the hull's center back to the pivot, per second. */
const RECENTER = 1.5;

/** Signed angle from `from` to `to`, in (-π, π]. */
export function angleBetween(from: number, to: number) {
  let delta = (to - from) % (Math.PI * 2);

  if (delta > Math.PI) {
    delta -= Math.PI * 2;
  } else if (delta <= -Math.PI) {
    delta += Math.PI * 2;
  }

  return delta;
}
