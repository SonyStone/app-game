import { canDrive, findBreachPath, findPath, obstacleDistance, sampleDistance, type NavGrid } from './navigation';

type Point = { x: number; y: number };

/** A moving body to keep away from: a tank, or one of the circles that make up a crate. */
export type Obstacle = { x: number; y: number; radius: number };

/**
 * Drives a bot's tank to a destination through the tow mechanic: it plans a path on the grid,
 * turns the next waypoint into a drive direction for `driveTank`, which moves the pull point
 * the hull trails behind, and bends that direction away from tanks and crates nearby. The path is
 * planned again when the destination moves, when walls opened or closed a way, every couple of
 * seconds and after the tank got stuck.
 *
 * A tank that wants to move but has not for a while is stuck, for example against a crate it
 * cannot shove, another tank, or in a crater shot into a building: it backs out for a moment the
 * way with the most room, never the way that just failed nor one it tried already since it last
 * moved, and then plans again (see `wayOut`).
 *
 * The hull trails its tow point and cuts corners, so a tank given its heading eases off when its
 * nose is about to meet a wall at speed: it touches walls gently instead of ramming them. Pressed
 * against a wall already, it keeps full throttle to slide along it or turn away.
 */
export function createDriver(grid: NavGrid) {
  let path: Point[] = [];
  let next = 1;
  let goal: Point | undefined;
  let plannedAt = -Infinity;
  let plannedRevision = grid.revision;
  let skipCheckAt = 0;
  let check: { at: number; position: Point } | undefined;
  let stuckSince: number | undefined;
  let unstick: { until: number; direction: Point } | undefined;
  const tried: Point[] = [];
  let longestStall = 0;
  let stalls = 0;
  let last: { at: number; position: Point } | undefined;

  return {
    /** The path being followed, from the tank's position when it was planned. */
    get path(): readonly Point[] {
      return path;
    },

    /** The destination being driven to, if any. */
    get destination() {
      return goal;
    },

    /** Times the tank got stuck and had to back off. */
    get stalls() {
      return stalls;
    },

    /** Longest time in seconds the tank wanted to move but could not. */
    get longestStall() {
      return longestStall;
    },

    /**
     * The drive direction for this step, length up to 1.
     *
     * @param destination - Where to go; `undefined` stops the tank.
     * @param obstacles - Moving bodies nearby other than this tank.
     * @param options.arrive - Distance from the destination at which the tank stops; defaults to 14 px.
     * @param options.cost - Extra cell costs for planning, as for `findPath`.
     * @param options.heading - The hull's heading in radians, for easing off before a wall ahead.
     * @param options.nose - How far the hull's nose is ahead of its center, in pixels; defaults to
     *   the medium tank's, `NOSE`.
     */
    steer(
      now: number,
      position: Point,
      destination: Point | undefined,
      obstacles: readonly Obstacle[],
      options: { arrive?: number; cost?: (cell: number) => number; heading?: number; nose?: number } = {}
    ): Point {
      const arrive = options.arrive ?? 14;

      if (!destination || distance(position, destination) <= arrive) {
        goal = destination;
        check = undefined;
        stuckSince = undefined;
        return STOP;
      }

      trackStall(now, position);

      if (unstick && now < unstick.until) {
        return unstick.direction;
      }

      unstick = undefined;

      const stale = now - plannedAt > REPLAN_INTERVAL || grid.revision !== plannedRevision;

      if (!goal || distance(goal, destination) > REPLAN_SHIFT || stale || path.length === 0) {
        plan(now, position, destination, options.cost);
      }

      const waypoint = advance(now, position);
      const toward = normalize({ x: waypoint.x - position.x, y: waypoint.y - position.y });
      const remaining = next >= path.length - 1 ? distance(position, destination) : Infinity;
      const throttle = Math.min(Math.max(remaining / SLOWDOWN, MIN_THROTTLE), 1);
      const steered = avoid(position, toward, obstacles);

      if (stuckSince !== undefined && now - stuckSince >= STUCK_TIME) {
        stalls++;
        // Back out the way with the most room, then think again: of eight directions, the one that
        // stays farthest from walls for a hull length, but not the way that just failed or one tried
        // already since the tank last moved, so each try is a new way out of a pocket.
        const direction = wayOut(grid, position, toward, tried);
        unstick = { until: now + UNSTICK_TIME, direction };
        tried.push(direction);
        plannedAt = -Infinity;
        return unstick.direction;
      }

      const speed = last && now > last.at ? distance(position, last.position) / (now - last.at) : 0;
      last = { at: now, position: { x: position.x, y: position.y } };
      const ease = options.heading === undefined || speed < BRAKE_SPEED ? 1 : easeBeforeWall(position, options.heading, options.nose ?? NOSE, steered);
      return { x: steered.x * throttle * ease, y: steered.y * throttle * ease };
    },

    /**
     * Backs the tank out for a moment the way with the most room, as from being stuck, for a hull
     * that is not driving but cannot do what it does instead, as a casemate wedged in a crater
     * that cannot turn on the spot: never the way the hull's nose, at `heading`, points nor one
     * tried already since the tank last moved. `backingOut` gives the direction meanwhile.
     */
    backOut(now: number, position: Point, heading: number) {
      stalls++;
      const direction = wayOut(grid, position, { x: Math.cos(heading), y: Math.sin(heading) }, tried);
      unstick = { until: now + UNSTICK_TIME, direction };
      tried.push(direction);
      plannedAt = -Infinity;
    },

    /** The drive direction while the tank backs out of where it got stuck, else `undefined`. */
    backingOut(now: number) {
      return unstick && now < unstick.until ? unstick.direction : undefined;
    },

    /** Forgets the path and the stall history, for a new tank; the clock may have started over. */
    reset() {
      last = undefined;
      path = [];
      next = 1;
      goal = undefined;
      plannedAt = -Infinity;
      skipCheckAt = 0;
      check = undefined;
      stuckSince = undefined;
      unstick = undefined;
      tried.length = 0;
    }
  };

  /** Throttle for driving along `toward`: eased off when the hull's nose, heading that way, is about to meet an obstacle. */
  function easeBeforeWall(position: Point, heading: number, reach: number, toward: Point) {
    const ahead = { x: Math.cos(heading), y: Math.sin(heading) };

    if (ahead.x * toward.x + ahead.y * toward.y < 0.5) {
      return 1;
    }

    const nose = { x: position.x + ahead.x * reach, y: position.y + ahead.y * reach };
    return obstacleDistance(grid, nose) < BRAKE_GAP ? BRAKE_THROTTLE : 1;
  }

  function plan(now: number, position: Point, destination: Point, cost: ((cell: number) => number) | undefined) {
    goal = { x: destination.x, y: destination.y };
    plannedAt = now;
    plannedRevision = grid.revision;
    // With every way closed, as wrecks may close the ways of a small map, head for what breaks on
    // the shortest way through, where a breach opens it; without even that, straight for it.
    path = findPath(grid, position, destination, { cost }) ?? findBreachPath(grid, position, destination, { cost, through: () => THROUGH_COST })?.path ?? [position, destination];
    next = 1;
  }

  /** Moves on to later waypoints once the tank is near the current one or can drive straight past it. */
  function advance(now: number, position: Point) {
    while (next < path.length - 1 && distance(position, path[next]) < WAYPOINT_RADIUS) {
      next++;
    }

    if (next < path.length - 1 && now >= skipCheckAt) {
      skipCheckAt = now + SKIP_CHECK_INTERVAL;

      if (canDrive(grid, position, path[next + 1])) {
        next++;
      }
    }

    return path[Math.min(next, path.length - 1)];
  }

  function trackStall(now: number, position: Point) {
    if (!check) {
      check = { at: now, position };
      return;
    }

    if (now - check.at < STALL_CHECK) {
      return;
    }

    if (distance(position, check.position) < STALL_DISTANCE) {
      stuckSince ??= check.at;
      longestStall = Math.max(longestStall, now - stuckSince);
    } else {
      stuckSince = undefined;
      tried.length = 0;
    }

    check = { at: now, position };
  }
}

/** A bot's driver as returned by `createDriver`. */
export type Driver = ReturnType<typeof createDriver>;

const STOP = { x: 0, y: 0 };
/** Plan again when the destination moved this far, or after this many seconds. */
const REPLAN_SHIFT = 40;
const REPLAN_INTERVAL = 2;
const WAYPOINT_RADIUS = 30;
const SKIP_CHECK_INTERVAL = 0.25;
/** The tank slows down over the last pixels to its destination, to at least this throttle. */
const SLOWDOWN = 70;
const MIN_THROTTLE = 0.35;
/** A tank that moved less than `STALL_DISTANCE` px over `STALL_CHECK` s is stalling; after `STUCK_TIME` s it is stuck. */
const STALL_CHECK = 0.4;
const STALL_DISTANCE = 6;
const STUCK_TIME = 1;
const UNSTICK_TIME = 0.7;
/** Extra cost of a step into a cell only something breakable closes, on a way planned when every way is closed. */
const THROUGH_COST = 4;
/** Directions a stuck tank weighs for a way out, how far ahead it probes each, and the room a direction tried already counts as lacking. */
const WAY_OUT_DIRECTIONS = 8;
const WAY_OUT_PROBE = 45;
const WAY_OUT_TRIED = 1000;
/**
 * A tank faster than `BRAKE_SPEED` px/s whose nose, `NOSE` px ahead of a medium tank's center, is
 * closer than `BRAKE_GAP` px to an obstacle drives at `BRAKE_THROTTLE`, slow enough that touching a
 * wall is no ram.
 */
const NOSE = 22;
const BRAKE_GAP = 8;
const BRAKE_THROTTLE = 0.4;
const BRAKE_SPEED = 140;
/** Radius of a hull for avoidance, and the gap within which other bodies push it aside. */
const HULL_RADIUS = 22;
const AVOID_GAP = 45;

/**
 * Bends a unit drive direction away from obstacles closer than `AVOID_GAP`, and to the right of
 * those straight ahead, so two tanks meeting head on pass each other on the same side.
 */
function avoid(position: Point, toward: Point, obstacles: readonly Obstacle[]) {
  let x = toward.x;
  let y = toward.y;

  for (const obstacle of obstacles) {
    const dx = position.x - obstacle.x;
    const dy = position.y - obstacle.y;
    const length = Math.hypot(dx, dy) || 1;
    const gap = length - obstacle.radius - HULL_RADIUS;

    if (gap >= AVOID_GAP) {
      continue;
    }

    const strength = 1 - Math.max(gap, 0) / AVOID_GAP;
    const ahead = -(dx * toward.x + dy * toward.y) / length;
    x += (dx / length) * strength * 0.8;
    y += (dy / length) * strength * 0.8;

    if (ahead > 0.6) {
      x += -toward.y * strength * 0.7;
      y += toward.x * strength * 0.7;
    }
  }

  return normalize({ x, y });
}

/**
 * The way out for a stuck tank at `point`: of `WAY_OUT_DIRECTIONS` directions, the one whose
 * nearest wall along a probe of `WAY_OUT_PROBE` px stays farthest, counting the way it was trying
 * to go and directions within 45 degrees of a way tried already as having no room.
 */
function wayOut(grid: NavGrid, point: Point, blocked: Point, tried: readonly Point[]) {
  let best: { direction: Point; room: number } | undefined;

  for (let index = 0; index < WAY_OUT_DIRECTIONS; index++) {
    const angle = (index / WAY_OUT_DIRECTIONS) * Math.PI * 2;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const near = (other: Point) => direction.x * other.x + direction.y * other.y > Math.SQRT1_2;
    let room = Infinity;

    for (let along = WAY_OUT_PROBE / 3; along <= WAY_OUT_PROBE; along += WAY_OUT_PROBE / 3) {
      room = Math.min(room, sampleDistance(grid, grid.distance, { x: point.x + direction.x * along, y: point.y + direction.y * along }));
    }

    if (near(blocked) || tried.some(near)) {
      room -= WAY_OUT_TRIED;
    }

    if (!best || room > best.room) {
      best = { direction, room };
    }
  }

  return best!.direction;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(vector: Point) {
  const length = Math.hypot(vector.x, vector.y);
  return length > 1e-9 ? { x: vector.x / length, y: vector.y / length } : { x: 0, y: 0 };
}

