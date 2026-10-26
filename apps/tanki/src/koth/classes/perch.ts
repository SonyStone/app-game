import type { KothMap } from '../map';
import { cellCenter, findPath, isOpenCell, sightClear, type NavGrid } from '../navigation';
import { rivalOf, type TeamId } from '../rules';

type Point = { x: number; y: number };

/**
 * A spot a casemate gun watches from, with where it looks while nothing is in sight, the middle
 * of the stretch of the enemy's ways it sees, and how much it sees (see `findPerches`).
 */
export type Perch = Point & { watch: Point; score: number };

/**
 * Spots a Sniper watches from, best first: open ground on the team's own side, about `distance`
 * px from the point (see `perchBand`), close to a wall that covers a flank, from where straight
 * lines past every wall reach at least `MIN_SEEN` of seven spots on the point, its middle and six
 * round its rim, and as much as can be of the ways the enemy comes by: from its base and its
 * three staging spots to the point, sampled every `SAMPLE` px, within `SIGHT` px. A Sniper there
 * covers its team on the point and shoots enemies as they come out of the streets and the hall,
 * before they reach the point. A team finds its perches at the start of each match, from the
 * walls as built: walls shot apart only open more lines. On the king of the hill map, at the
 * Sniper's 420 px (see `ClassTactics.perch`), they lie in the hall and at the doorways from the
 * streets, 300-500 px from the point.
 */
export function findPerches(grid: NavGrid, map: KothMap, team: TeamId, distance: number): Perch[] {
  const band = perchBand(distance);
  const side = team === 'red' ? -1 : 1;
  const point = [
    map.point,
    ...Array.from({ length: 6 }, (_, index) => {
      const angle = (index / 6) * Math.PI * 2;
      return { x: map.point.x + Math.cos(angle) * map.point.radius * 0.8, y: map.point.y + Math.sin(angle) * map.point.radius * 0.8 };
    })
  ];
  const ways = enemyWays(grid, map, team);
  const spots: Perch[] = [];

  for (let cell = 0; cell < grid.cols * grid.rows; cell++) {
    const at = cellCenter(grid, cell);
    const range = Math.hypot(at.x - map.point.x, at.y - map.point.y);

    if (!isOpenCell(grid, cell) || Math.sign(at.x - map.point.x) !== side || range < band.min || range > band.max) {
      continue;
    }

    const visible = (sample: Point) => Math.hypot(sample.x - at.x, sample.y - at.y) < SIGHT && sightClear(grid, at, sample);
    const seenPoint = point.filter(visible).length;

    if (seenPoint < MIN_SEEN) {
      continue;
    }

    const seenWays = ways.filter(visible);
    const hug = grid.distance[cell];
    const score = seenWays.length + seenPoint * POINT_WEIGHT - Math.abs(range - distance) / 50 - Math.max(hug - PERCH_HUG, 0) / 15;
    const watch = seenWays.length > 0 ? centroid(seenWays) : map.point;
    spots.push({ x: at.x, y: at.y, watch, score });
  }

  const perches: Perch[] = [];

  for (const spot of spots.sort((a, b) => b.score - a.score)) {
    if (perches.length < MAX_PERCHES && perches.every((perch) => Math.hypot(perch.x - spot.x, perch.y - spot.y) > PERCH_SPACING)) {
      perches.push(spot);
    }
  }

  return perches;
}

/**
 * Points every `SAMPLE` px along the ways the enemy of `team` comes to the point by: from the
 * middle of its base and from each of its staging spots.
 */
function enemyWays(grid: NavGrid, map: KothMap, team: TeamId) {
  const rival = rivalOf(team);
  const starts = [map.bases[rival].zone, map.lanes[rival].north, map.lanes[rival].center, map.lanes[rival].south];
  const samples: Point[] = [];

  for (const start of starts) {
    const path = findPath(grid, start, map.point);

    for (let index = 1; path && index < path.length; index++) {
      const from = path[index - 1];
      const to = path[index];
      const steps = Math.floor(Math.hypot(to.x - from.x, to.y - from.y) / SAMPLE);

      for (let step = 0; step < steps; step++) {
        samples.push({ x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps });
      }
    }
  }

  return samples;
}

function centroid(points: readonly Point[]): Point {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

/**
 * Distances from the point a perch may lie at when it should lie `distance` px away: from 120 px
 * nearer to 80 px farther. At the Sniper's 420 px that is 300-500 px, within the 470-480 px a
 * Soldier and a Demoman open fire at, so the point can fight back. Perches beyond it, 550 px out
 * on the compact map, let a Sniper kill four times as often as it died.
 */
function perchBand(distance: number) {
  return { min: distance - 120, max: distance + 80 };
}
/** Spots on the point a perch must see. */
const MIN_SEEN = 2;
/** How far a Sniper sees along its gun, as through its scope, and the spacing of the samples of the enemy's ways. */
const SIGHT = 900;
const SAMPLE = 40;
/** How many samples of the enemy's ways a spot on the point weighs. */
const POINT_WEIGHT = 3;
/** A perch this close to a wall, or closer, has it covering a flank. */
const PERCH_HUG = 50;
/** Perches lie at least this far apart, so a team has different ones to choose from. */
const PERCH_SPACING = 120;
const MAX_PERCHES = 6;
