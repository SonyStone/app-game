import { canDrive, findPath, type NavGrid } from './navigation';

type Point = { x: number; y: number };

/** A moving body to keep away from: a tank, or one of the circles that make up a crate. */
export type Obstacle = { x: number; y: number; radius: number };

/**
 * Drives a bot's tank to a destination through the tow mechanic: it plans a path on the grid,
 * turns the next waypoint into a drive direction for `driveTank`, which moves the pull point
 * the hull trails behind, and bends that direction away from tanks and crates nearby. The path is
 * planned again when the destination moves, every couple of seconds and after the tank got stuck.
 *
 * A tank that wants to move but has not for a while is stuck, for example against a crate it
 * cannot shove or another tank: it backs off to one side for a moment, alternating sides, and
 * then plans again.
 */
export function createDriver(grid: NavGrid) {
  let path: Point[] = [];
  let next = 1;
  let goal: Point | undefined;
  let plannedAt = -Infinity;
  let skipCheckAt = 0;
  let check: { at: number; position: Point } | undefined;
  let stuckSince: number | undefined;
  let unstick: { until: number; direction: Point } | undefined;
  let side = 1;
  let longestStall = 0;
  let stalls = 0;

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
     */
    steer(
      now: number,
      position: Point,
      destination: Point | undefined,
      obstacles: readonly Obstacle[],
      options: { arrive?: number; cost?: (cell: number) => number } = {}
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

      if (!goal || distance(goal, destination) > REPLAN_SHIFT || now - plannedAt > REPLAN_INTERVAL || path.length === 0) {
        plan(now, position, destination, options.cost);
      }

      const waypoint = advance(now, position);
      const toward = normalize({ x: waypoint.x - position.x, y: waypoint.y - position.y });
      const remaining = next >= path.length - 1 ? distance(position, destination) : Infinity;
      const throttle = Math.min(Math.max(remaining / SLOWDOWN, MIN_THROTTLE), 1);
      const steered = avoid(position, toward, obstacles);

      if (stuckSince !== undefined && now - stuckSince >= STUCK_TIME) {
        stalls++;
        // Back away from whatever blocks the way, to one side, then think again.
        unstick = { until: now + UNSTICK_TIME, direction: rotate({ x: -toward.x, y: -toward.y }, side * UNSTICK_ANGLE) };
        side = -side;
        plannedAt = -Infinity;
        return unstick.direction;
      }

      return { x: steered.x * throttle, y: steered.y * throttle };
    },

    /** Forgets the path and the stall history, for a new tank. */
    reset() {
      path = [];
      next = 1;
      goal = undefined;
      plannedAt = -Infinity;
      check = undefined;
      stuckSince = undefined;
      unstick = undefined;
    }
  };

  function plan(now: number, position: Point, destination: Point, cost: ((cell: number) => number) | undefined) {
    goal = { x: destination.x, y: destination.y };
    plannedAt = now;
    // Without a way there, head straight for it and let steering and unsticking cope.
    path = findPath(grid, position, destination, { cost }) ?? [position, destination];
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
const STUCK_TIME = 1.2;
const UNSTICK_TIME = 0.7;
const UNSTICK_ANGLE = 0.9;
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

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(vector: Point) {
  const length = Math.hypot(vector.x, vector.y);
  return length > 1e-9 ? { x: vector.x / length, y: vector.y / length } : { x: 0, y: 0 };
}

function rotate(vector: Point, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}
