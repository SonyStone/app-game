import type { Tank } from '../arena/bodies';
import type { MovingBox, NavGrid } from './navgrid';
import { sternOf } from './spider';
import { angleBetween } from './visibility';

type Point = { x: number; y: number };

/**
 * How the bot spider drives a tank it hijacked. It heads for the nearest tank of the hijacked
 * tank's old team over `grid`, a grid planned for tanks, and comes up behind it, where the armor
 * over the core is thinnest; once that tank is in sight and in range it turns the turret on its
 * stern and fires whenever the turret is on target. Its old team takes it for a friend until
 * then, so it can drive right up.
 */
export function createHijacker(grid: NavGrid) {
  let path: Point[] = [];
  let replanAt = 0;

  return {
    /** The way it plans to drive, for display. */
    get path(): readonly Point[] {
      return path;
    },

    /**
     * This step's drive for `tank`.
     *
     * @param victims - Tanks of the hijacked tank's old team in play.
     * @param boxes - Crates and tanks in the way.
     * @returns Drive direction in world axes, the turret heading to turn to and whether to fire
     *   now; `undefined` when there is no one to go after.
     */
    drive(clock: number, tank: Tank, victims: readonly Tank[], boxes: readonly MovingBox[], lineOfSight: (from: Point, to: Point) => boolean) {
      const position = tank.hull.translation();
      const nearest = victims
        .map((victim) => ({ victim, at: victim.hull.translation() }))
        .sort((a, b) => Math.hypot(a.at.x - position.x, a.at.y - position.y) - Math.hypot(b.at.x - position.x, b.at.y - position.y))[0];

      if (!nearest) {
        return undefined;
      }

      const stern = sternOf(nearest.victim);
      const heading = nearest.victim.hull.rotation();
      const behind = { x: stern.x - Math.cos(heading) * BEHIND, y: stern.y - Math.sin(heading) * BEHIND };
      const distance = Math.hypot(stern.x - position.x, stern.y - position.y);
      const inSight = distance < FIRE_RANGE && lineOfSight(position, stern);

      if (clock >= replanAt) {
        replanAt = clock + REPLAN_TIME;
        grid.plan(position, boxes, () => 0);
        path = grid.pathTo(grid.nearestOpen(behind));
      }

      while (path.length > 0 && Math.hypot(path[0].x - position.x, path[0].y - position.y) < ARRIVE_RADIUS) {
        path.shift();
      }

      const close = Math.hypot(behind.x - position.x, behind.y - position.y) < ARRIVE_RADIUS * 2;
      const goal = close ? undefined : (path[0] ?? behind);
      const move = goal ? towards(position, goal) : { x: 0, y: 0 };
      const aim = inSight ? Math.atan2(stern.y - position.y, stern.x - position.x) : Math.atan2(nearest.at.y - position.y, nearest.at.x - position.x);

      return { move, aim, fire: inSight && Math.abs(angleBetween(tank.turretAngle, aim)) < AIM_TOLERANCE };
    }
  };
}

/** How far behind its victim's stern a hijacked tank parks to fire, in pixels. */
const BEHIND = 110;
/** Farthest it fires from. */
const FIRE_RANGE = 380;
const AIM_TOLERANCE = 0.05;
const REPLAN_TIME = 0.5;
const ARRIVE_RADIUS = 24;
/** Share of the pull's speed it drives at. */
const THROTTLE = 0.8;

function towards(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: (dx / length) * THROTTLE, y: (dy / length) * THROTTLE };
}
