import type { KothMap } from '../map';
import { cellCenter, isOpenCell, sightClear, type NavGrid } from '../navigation';
import type { TeamId } from '../rules';

type Point = { x: number; y: number };

/**
 * Spots a casemate gun can watch the point from, best first: open ground on the team's own side,
 * `PERCH_RANGE` from the point, from where straight lines past every wall reach at least
 * `MIN_SEEN` of seven spots on the point, its middle and six round its rim, close to a wall that
 * covers a flank. A team finds its perches once, from the walls as built: walls shot apart only
 * open more lines, so the perches stay good. On the king of the hill map they lie in the hall and
 * at the doorways from the streets, 300-500 px from the point, with lines of fire across it of
 * 1100-1400 px.
 */
export function findPerches(grid: NavGrid, map: KothMap, team: TeamId): Point[] {
  const side = team === 'red' ? -1 : 1;
  const targets = [
    map.point,
    ...Array.from({ length: 6 }, (_, index) => {
      const angle = (index / 6) * Math.PI * 2;
      return { x: map.point.x + Math.cos(angle) * map.point.radius * 0.8, y: map.point.y + Math.sin(angle) * map.point.radius * 0.8 };
    })
  ];
  const spots: { at: Point; score: number }[] = [];

  for (let cell = 0; cell < grid.cols * grid.rows; cell++) {
    const at = cellCenter(grid, cell);
    const range = Math.hypot(at.x - map.point.x, at.y - map.point.y);

    if (!isOpenCell(grid, cell) || Math.sign(at.x - map.point.x) !== side || range < PERCH_RANGE.min || range > PERCH_RANGE.max) {
      continue;
    }

    const seen = targets.filter((point) => sightClear(grid, at, point)).length;

    if (seen < MIN_SEEN) {
      continue;
    }

    const hug = grid.distance[cell];
    const score = seen - Math.abs(range - PERCH_RANGE.best) / 150 - Math.max(hug - PERCH_HUG, 0) / 40;
    spots.push({ at, score });
  }

  const perches: Point[] = [];

  for (const spot of spots.sort((a, b) => b.score - a.score)) {
    if (perches.length < MAX_PERCHES && perches.every((perch) => Math.hypot(perch.x - spot.at.x, perch.y - spot.at.y) > PERCH_SPACING)) {
      perches.push(spot.at);
    }
  }

  return perches;
}

/**
 * Distances from the point a perch may lie at, and the one it should, in pixels: within the
 * 470-480 px a Soldier and a Demoman open fire at, so the point can fight back. Perches beyond it,
 * 550 px out on the compact map, let a Sniper kill four times as often as it died.
 */
const PERCH_RANGE = { min: 300, best: 420, max: 500 };
/** Spots on the point a perch must see. */
const MIN_SEEN = 2;
/** A perch this close to a wall, or closer, has it covering a flank. */
const PERCH_HUG = 50;
/** Perches lie at least this far apart, so a team has different ones to choose from. */
const PERCH_SPACING = 120;
const MAX_PERCHES = 6;
