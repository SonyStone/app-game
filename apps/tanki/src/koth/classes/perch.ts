import type { WallPlacement } from '../../damage/combat';
import type { Shortcut } from '../front';
import type { KothMap } from '../map';
import { cellCenter, createNavGrid, findPath, isOpenAt, isOpenCell, sightClear, type NavGrid } from '../navigation';
import { rivalOf, type TeamId } from '../rules';

type Point = { x: number; y: number };

/**
 * A spot a casemate gun watches from, with where it looks while nothing is in sight, the middle
 * of the stretch of the enemy's ways it sees, how much it sees (see `findPerches`), and the thin
 * wall its team should break open to clear its view, if one stands across it.
 */
export type Perch = Point & { watch: Point; score: number; opening?: Shortcut };

/**
 * Spots a Sniper watches from, best first: open ground on the team's own side, about `distance`
 * px from the point (see `perchBand`), close to a wall that covers a flank, from where straight
 * lines reach at least `MIN_SEEN` of seven spots on the point, its middle and six round its rim,
 * and as much as can be of the ways the enemy comes by: from its base and its three staging spots
 * to the point, sampled every `SAMPLE` px, within `SIGHT` px.
 *
 * Lines count through thin walls of wood or brick (see `isThinWall`) as well, as a team can break
 * those open: a perch whose line to the point or to what it watches such a wall closes gets the
 * wall as its `opening`, the way through it along that line, and scores `OPENING_PRICE` less than
 * it would with the wall gone. A Sniper there covers its team on the point and shoots enemies as
 * they come out of the streets and the hall, out of reach of the guns of those on the point. A
 * team finds its perches at the start of each match. On the king of the hill map, at the
 * Sniper's 600 px (see `ClassTactics.perch`), they lie in the hall on either side of its pillar,
 * one behind the brick tooth that a team breaks to see down the hall.
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
  const thin = (map.walls ?? []).filter(isThinWall);
  const open = createNavGrid({ ...map, walls: (map.walls ?? []).filter((wall) => !isThinWall(wall)) }, { cell: grid.cell, clearance: grid.clearance });
  const ways = enemyWays(grid, map, team);
  const spots: Perch[] = [];

  for (let cell = 0; cell < grid.cols * grid.rows; cell++) {
    const at = cellCenter(grid, cell);
    const range = Math.hypot(at.x - map.point.x, at.y - map.point.y);

    if (!isOpenCell(grid, cell) || Math.sign(at.x - map.point.x) !== side || range < band.min || range > band.max) {
      continue;
    }

    const visible = (sample: Point) => Math.hypot(sample.x - at.x, sample.y - at.y) < SIGHT && (sightClear(grid, at, sample) || sightClear(open, at, sample));
    const seenPoint = point.filter(visible).length;

    if (seenPoint < MIN_SEEN) {
      continue;
    }

    const seenWays = ways.filter(visible);
    const hug = grid.distance[cell];
    const watch = seenWays.length > 0 ? centroid(seenWays) : map.point;
    const opening = [map.point, watch].filter((target) => !sightClear(grid, at, target)).map((target) => openingOn(grid, thin, at, target)).find((found) => found);
    const score =
      seenWays.length + seenPoint * POINT_WEIGHT - Math.abs(range - distance) / 50 - Math.max(hug - PERCH_HUG, 0) / 15 - (opening ? OPENING_PRICE : 0);
    spots.push({ x: at.x, y: at.y, watch, score, ...(opening ? { opening } : {}) });
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

/**
 * Whether a team breaks through `wall` to see or drive past it: a fence or an alley wall of wood
 * or brick at most `THIN_WALL` px thick, not a building.
 */
export function isThinWall(wall: WallPlacement) {
  return (wall.material === 'wood' || wall.material === 'brick') && Math.min(wall.halfWidth, wall.halfHeight) * 2 <= THIN_WALL;
}

/**
 * The way through the first of the `thin` walls that the line from `from` to `to` crosses, as a
 * shortcut in the hall: its sides are on the line `OPENING_SIDE` px before and beyond the wall,
 * moved on along the line until open, so a tank that drives from one to the other breaks a hole
 * where the line runs. `undefined` when no thin wall crosses the line.
 */
function openingOn(grid: NavGrid, thin: readonly WallPlacement[], from: Point, to: Point): Shortcut | undefined {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const direction = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const crossings = thin
    .map((wall) => crossing(from, direction, length, wall))
    .filter((found) => found !== undefined)
    .sort((a, b) => a.enter - b.enter);
  const first = crossings[0];

  if (!first) {
    return undefined;
  }

  const along = (distance: number) => ({ x: from.x + direction.x * distance, y: from.y + direction.y * distance });
  let before = first.enter - OPENING_SIDE;
  let beyond = first.exit + OPENING_SIDE;

  while (before > 0 && !isOpenAt(grid, along(before))) {
    before -= SAMPLE / 2;
  }

  while (beyond < length && !isOpenAt(grid, along(beyond))) {
    beyond += SAMPLE / 2;
  }

  const sides: [Point, Point] = [along(Math.max(before, 0)), along(Math.min(beyond, length))];
  const wall = along((first.enter + first.exit) / 2);
  return { lane: 'center', from: sides[0], to: sides[1], wall, cells: [], sides };
}

/** Where along a line, from `from` along `direction` for `length` px, it enters and leaves an unturned `wall`. */
function crossing(from: Point, direction: Point, length: number, wall: WallPlacement) {
  let enter = 0;
  let exit = length;

  for (const [start, step, middle, half] of [
    [from.x, direction.x, wall.x, wall.halfWidth],
    [from.y, direction.y, wall.y, wall.halfHeight]
  ]) {
    if (Math.abs(step) < 1e-9) {
      if (Math.abs(start - middle) > half) {
        return undefined;
      }

      continue;
    }

    const one = (middle - half - start) / step;
    const other = (middle + half - start) / step;
    enter = Math.max(enter, Math.min(one, other));
    exit = Math.min(exit, Math.max(one, other));
  }

  return enter < exit ? { enter, exit } : undefined;
}

function centroid(points: readonly Point[]): Point {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

/**
 * Distances from the point a perch may lie at when it should lie `distance` px away: from 60 px
 * nearer to 80 px farther. At the Sniper's 600 px that is 540-680 px, beyond the 470-480 px a
 * Soldier and a Demoman open fire at, so those on the point cannot fight back and have to come
 * for the Sniper, or hide from it.
 */
function perchBand(distance: number) {
  return { min: distance - 60, max: distance + 80 };
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
/** Score a perch loses for a thin wall its team must break open first. */
const OPENING_PRICE = 1;
/** How far before and beyond a wall to break open a tank starts and ends its drive through it. */
const OPENING_SIDE = 45;
/** Thickest wall of wood or brick a team breaks open, in pixels. */
const THIN_WALL = 40;
