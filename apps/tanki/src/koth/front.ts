import type { KothMap } from './map';
import { cellCenter, findBreachPath, findPath, isOpenCell, pathLength, searchNearest, sightClear, type NavGrid } from './navigation';
import type { Lane } from './radio';
import { rivalOf, type TeamId } from './rules';

type Point = { x: number; y: number };

/**
 * A spot a team holds in front of the point it owns, on one of the ways the enemy comes back by:
 * where to stand, close beside cover, and the stretch of that way it watches.
 */
export type Post = { lane: Lane; at: Point; watch: Point };

/**
 * The posts a team holding the point takes, one on each way from the enemy's staging spots to
 * the point, in the order of `LANES`: about `FORWARD` px of driving out from the point toward the
 * enemy, where the ways leave the plaza, so the enemy is met before it reaches the point and the
 * defenders are not all standing in the open on it. A post stands beside a wall within
 * `POST_SEARCH` px of that spot, from where a straight line reaches the way `WATCH` px farther
 * out. Posts follow the walls as they stand, so a team finds them again when walls fall.
 */
export function findPosts(grid: NavGrid, map: KothMap, team: TeamId): Post[] {
  const lanes = map.lanes[rivalOf(team)];
  const posts: Post[] = [];

  for (const lane of LANES) {
    const path = findPath(grid, map.point, lanes[lane]);

    if (!path) {
      continue;
    }

    const door = pointAlong(path, FORWARD);
    const watch = pointAlong(path, FORWARD + WATCH);
    const cell = searchNearest(grid, door, POST_SEARCH, (candidate) => isOpenCell(grid, candidate) && grid.distance[candidate] < POST_HUG && sightClear(grid, cellCenter(grid, candidate), watch));
    posts.push({ lane, at: cell === undefined ? door : cellCenter(grid, cell), watch });
  }

  return posts;
}

/**
 * A wall on the team's own side worth breaking open: it shuts a short way between the team's
 * staging spot in the hall and one in a side street, so opening it lets the team switch lanes
 * quickly. `cells` are the grid cells it closes, `wall` the middle of them, and `sides` the open
 * spots just before and just beyond it, from where a tank breaks through.
 */
export type Shortcut = { lane: Exclude<Lane, 'center'>; from: Point; to: Point; wall: Point; cells: number[]; sides: [Point, Point] };

/**
 * The shortcuts of `team` (see `Shortcut`): for each side street, the way from the hall's staging
 * spot to the street's through walls `breakable` allows, if it is shorter than `SHORTCUT_SHARE`
 * of the way around, or there is no way around. On the king of the hill map these are the wooden
 * fence and the brick wall across the alleys between the buildings beside the hall. A shortcut
 * already open is left out.
 *
 * @param breakable - Whether a bot should break through the wall closing `cell`.
 */
export function findShortcuts(grid: NavGrid, map: KothMap, team: TeamId, breakable: (cell: number) => boolean): Shortcut[] {
  const lanes = map.lanes[team];
  const shortcuts: Shortcut[] = [];

  for (const lane of ['north', 'south'] as const) {
    const around = findPath(grid, lanes.center, lanes[lane]);
    const way = findBreachPath(grid, lanes.center, lanes[lane], { through: (cell) => (breakable(cell) ? THROUGH_PRICE : Infinity) });

    if (!way?.crossing || (around && pathLength(way.path) > pathLength(around) * SHORTCUT_SHARE)) {
      continue;
    }

    const cells = way.crossing.cells;
    const wall = { x: (way.crossing.entry.x + way.crossing.exit.x) / 2, y: (way.crossing.entry.y + way.crossing.exit.y) / 2 };
    shortcuts.push({ lane, from: lanes.center, to: lanes[lane], wall, cells, sides: [way.crossing.entry, way.crossing.exit] });
  }

  return shortcuts;
}

/**
 * Whether a shortcut's wall has been broken through: a tank can drive from one side of it to the
 * other along a way at most `OPENED_DETOUR` times as long as the straight line, plus a little.
 */
export function isOpened(grid: NavGrid, shortcut: Shortcut) {
  // The answer changes only when walls do, so it is kept until the grid's next revision.
  const known = openedCache.get(shortcut);

  if (known && known.revision === grid.revision) {
    return known.opened;
  }

  const [one, other] = shortcut.sides;
  const way = findPath(grid, one, other);
  const opened = way !== undefined && pathLength(way) < Math.hypot(other.x - one.x, other.y - one.y) * OPENED_DETOUR + OPENED_SLACK;
  openedCache.set(shortcut, { revision: grid.revision, opened });
  return opened;
}

const openedCache = new WeakMap<Shortcut, { revision: number; opened: boolean }>();

/** The ways to the point, the hall first: the most used, so the first post filled. */
export const LANES: readonly Lane[] = ['center', 'north', 'south'];

/** The point `distance` px along `path`, or its end. */
function pointAlong(path: readonly Point[], distance: number): Point {
  let left = distance;

  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);

    if (length >= left) {
      const share = left / length;
      return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
    }

    left -= length;
  }

  return path[path.length - 1];
}

/** A shortcut's wall counts as broken through when the way across is at most this much longer than straight. */
const OPENED_DETOUR = 1.5;
const OPENED_SLACK = 40;
/** A way through a wall is a shortcut when it is shorter than this share of the way around. */
const SHORTCUT_SHARE = 0.8;
/** Extra cost of a step through a breakable wall, as a multiple of the step, for finding shortcuts. */
const THROUGH_PRICE = 0.5;
/** Driving distance from the point's center to a post, and how far beyond it a post watches its way. */
const FORWARD = 330;
const WATCH = 260;
/** How far from its spot on the way a post may stand, in path pixels, and how close to a wall. */
const POST_SEARCH = 110;
const POST_HUG = 48;
