import { beforeAll, describe, expect, it } from 'vitest';
import { pullSpeedFor } from '../arena/bodies';
import { createCombat } from '../damage/combat';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { createDriver } from './driver';
import { KOTH_MAP } from './map';
import { cellCenter, createNavGrid, findPath, isOpenAt, isOpenCell, pathLength, sampleDistance, type NavGrid } from './navigation';
import { MEDIUM_TANK } from './tanks';

type Point = { x: number; y: number };

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

describe('the king of the hill map', () => {
  const grid = createNavGrid(KOTH_MAP);

  it('breaks up the lines of fire: none longer than a shell flies, except across the point', () => {
    const lines = longestLines(grid);

    expect(lines.elsewhere).toBeLessThan(MEDIUM_TANK.shell.range);
    expect(lines.acrossPoint).toBeLessThan(1400);
  });

  it('hides the spawn rooms from the hall: no line out of a room reaches far toward the point', () => {
    const { zone } = KOTH_MAP.bases.red;
    let reach = 0;

    for (let x = zone.x - zone.halfWidth + 20; x < zone.x + zone.halfWidth; x += 20) {
      for (let y = zone.y - zone.halfHeight + 20; y < zone.y + zone.halfHeight; y += 20) {
        for (let ray = 0; ray < 360; ray++) {
          const angle = (ray / 360) * Math.PI * 2;
          reach = Math.max(reach, x + Math.cos(angle) * openRay(grid, { x, y }, angle) - (zone.x + zone.halfWidth));
        }
      }
    }

    expect(reach).toBeLessThan(450);
  });

  it('builds the spawn rooms of steel, which no shot breaks', () => {
    for (const team of ['red', 'blue'] as const) {
      const { zone } = KOTH_MAP.bases[team];
      const near = (KOTH_MAP.walls ?? []).filter(
        (wall) => Math.abs(wall.x - zone.x) - wall.halfWidth < zone.halfWidth + 10 && Math.abs(wall.y - zone.y) - wall.halfHeight < zone.halfHeight + 10
      );

      expect(near.length).toBeGreaterThan(3);
      expect(near.every((wall) => wall.material === 'steel')).toBe(true);
    }
  });

  it('leads from each spawn to the point by the middle and by two longer flanks', () => {
    for (const team of ['red', 'blue'] as const) {
      const spawn = KOTH_MAP.bases[team].spawns[0];
      const lanes = KOTH_MAP.lanes[team];
      const middle = pathLength(findPath(grid, spawn, KOTH_MAP.point)!);

      for (const flank of [lanes.north, lanes.south]) {
        expect(pathLength(findPath(grid, spawn, flank)!) + pathLength(findPath(grid, flank, KOTH_MAP.point)!)).toBeGreaterThan(middle * 1.15);
      }

      expect(middle).toBeGreaterThan(1300);
      expect(middle).toBeLessThan(1500);
    }
  });

  it('takes a tank driven by the bot driver about five seconds from its spawn to the point', () => {
    for (const spawn of KOTH_MAP.bases.red.spawns) {
      const time = driveTime(grid, spawn, KOTH_MAP.point);

      expect(time).toBeGreaterThan(4.5);
      expect(time).toBeLessThan(6.5);
    }
  }, 30_000);

  it('lays repair kits out on open ground, large ones on the flanks and small ones beside the point, the same for both teams', () => {
    for (const kit of KOTH_MAP.kits) {
      expect(isOpenAt(grid, kit)).toBe(true);
      expect(KOTH_MAP.kits.some((other) => other.x === -kit.x && other.y === kit.y && other.size === kit.size)).toBe(true);
    }

    const distances = (size: 'small' | 'large') =>
      KOTH_MAP.kits.filter((kit) => kit.size === size).map((kit) => pathLength(findPath(grid, kit, KOTH_MAP.point)!));

    expect(Math.max(...distances('small'))).toBeLessThan(400);
    expect(Math.min(...distances('large'))).toBeGreaterThan(600);
  });
});

/**
 * The longest straight lines over drivable ground that no wall blocks, from every other open cell
 * in 360 directions: those that pass over the point, and all others.
 */
function longestLines(grid: NavGrid) {
  const lines = { acrossPoint: 0, elsewhere: 0 };

  for (let cell = 0; cell < grid.cols * grid.rows; cell++) {
    const col = cell % grid.cols;
    const row = Math.floor(cell / grid.cols);

    if (col % 2 || row % 2 || !isOpenCell(grid, cell)) {
      continue;
    }

    const from = cellCenter(grid, cell);

    for (let ray = 0; ray < 360; ray++) {
      const angle = (ray / 360) * Math.PI * 2;
      const length = openRay(grid, from, angle);
      const to = { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
      const key = segmentDistance(KOTH_MAP.point, from, to) < KOTH_MAP.point.radius ? 'acrossPoint' : 'elsewhere';
      lines[key] = Math.max(lines[key], length);
    }
  }

  return lines;
}

/** How far a straight line from `from` at `angle` runs before a wall or the edge of the map stops it. */
function openRay(grid: NavGrid, from: Point, angle: number) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let travelled = 0;

  while (true) {
    const at = { x: from.x + dx * travelled, y: from.y + dy * travelled };

    if (Math.abs(at.x) > KOTH_MAP.halfWidth || Math.abs(at.y) > KOTH_MAP.halfHeight) {
      return travelled;
    }

    const distance = sampleDistance(grid, grid.distance, at);

    if (distance < 0) {
      return travelled;
    }

    travelled += Math.max(distance * 0.9, 3);
  }
}

/** Seconds a lone medium tank driven by the bot driver takes from `from` onto `to`. */
function driveTime(grid: NavGrid, from: Point & { rotation: number }, to: Point) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const slots = Array.from({ length: 256 }, (_, index) => 255 - index);
  const renderer = {
    allocateField: () => slots.pop(),
    releaseField: (slot: number) => slots.push(slot),
    uploadField() {},
    beginBodies() {},
    addBody() {},
    spawn() {},
    addSmokeBall() {},
    addLight() {},
    render() {}
  };
  const combat = createCombat(rapier, world, renderer as unknown as ReturnType<typeof createRangeRenderer>, { ...KOTH_MAP, crates: [] });
  const tank = combat.spawnTank(from, { color: 0, pullSpeed: pullSpeedFor(MEDIUM_TANK.speed) });
  const driver = createDriver(grid);
  let time = 0;

  while (time < 30) {
    const at = tank.hull.translation();

    if (Math.hypot(at.x - to.x, at.y - to.y) < KOTH_MAP.point.radius - 20) {
      return time;
    }

    combat.drive(tank, driver.steer(time, at, to, []));
    combat.step(1 / 60);
    time += 1 / 60;
  }

  return time;
}

function segmentDistance(point: Point, a: Point, b: Point) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const length = abx * abx + aby * aby;
  const t = length > 0 ? Math.min(Math.max(((point.x - a.x) * abx + (point.y - a.y) * aby) / length, 0), 1) : 0;
  return Math.hypot(point.x - a.x - abx * t, point.y - a.y - aby * t);
}
