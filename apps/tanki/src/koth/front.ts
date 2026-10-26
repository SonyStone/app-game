import type { KothMap } from './map';
import { cellCenter, findPath, isOpenCell, searchNearest, sightClear, type NavGrid } from './navigation';
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

/** Driving distance from the point's center to a post, and how far beyond it a post watches its way. */
const FORWARD = 330;
const WATCH = 260;
/** How far from its spot on the way a post may stand, in path pixels, and how close to a wall. */
const POST_SEARCH = 110;
const POST_HUG = 48;
