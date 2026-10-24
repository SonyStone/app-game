import { beforeAll, describe, expect, it } from 'vitest';
import { pullSpeedFor } from '../arena/bodies';
import { createCombat, type CombatLayout, type WallPlacement } from '../damage/combat';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { createBreacher } from './breach';
import { createDriver } from './driver';
import { createGun } from './gun';
import { KOTH_MAP } from './map';
import { createNavGrid, updateNavGrid } from './navigation';
import { CAPTURE_RULES, createCaptureState } from './rules';
import { MEDIUM_TANK } from './tanks';
import { createTeamBoard, type Member } from './team';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

/** A fence across a field 1000 px tall from the top, with a way round at the bottom below `gapFrom`. */
const fence = (gapFrom: number): WallPlacement => ({ x: 0, y: (-500 + gapFrom) / 2, halfWidth: 7, halfHeight: (gapFrom + 500) / 2, material: 'wood' });

describe('breaking through walls', () => {
  it('rams a fence open and drives through when the way round is long', () => {
    const run = drive({ walls: [fence(400)] }, { x: -200, y: -300 }, { x: 200, y: -300 });

    expect(run.stats.chosen).toBe(1);
    expect(run.stats.rams).toBeGreaterThanOrEqual(1);
    expect(run.stats.shots).toBe(0);
    expect(run.stats.opened).toBe(1);
    expect(run.stats.passed).toBe(1);
    // Straight through: it never went near the way round at the bottom.
    expect(run.lowest).toBeLessThan(-200);
    expect(run.arrivedAt).toBeLessThan(5);
    expect(run.stats.saved).toBeGreaterThan(1);
  });

  it('drives round a fence when breaking through saves little', () => {
    const run = drive({ walls: [fence(-160)] }, { x: -200, y: -300 }, { x: 200, y: -300 });

    expect(run.stats.chosen).toBe(0);
    expect(run.stats.rams).toBe(0);
    expect(run.walls.rams).toBe(0);
    expect(run.lowest).toBeGreaterThan(-160);
    expect(run.arrivedAt).toBeLessThan(6);
  });

  it('shoots its way out through brick when there is no other way, and never through steel', () => {
    // A room of steel with one brick wall, on the side the bot wants to go.
    const room = (material: 'brick' | 'steel') => [
      { x: -200, y: -110, halfWidth: 100, halfHeight: 10, material: 'steel' as const },
      { x: -200, y: 110, halfWidth: 100, halfHeight: 10, material: 'steel' as const },
      { x: -310, y: 0, halfWidth: 10, halfHeight: 120, material: 'steel' as const },
      { x: -88, y: 0, halfWidth: 12, halfHeight: 100, material }
    ];
    const brick = drive({ walls: room('brick') }, { x: -200, y: 0 }, { x: 200, y: 0 }, 40);
    const steel = drive({ walls: room('steel') }, { x: -200, y: 0 }, { x: 200, y: 0 }, 8);

    expect(brick.stats.chosen).toBe(1);
    expect(brick.stats.shots).toBeGreaterThanOrEqual(6);
    expect(brick.stats.passed).toBe(1);
    expect(brick.arrivedAt).toBeLessThan(40);
    expect(steel.stats.considered).toBe(0);
    expect(steel.stats.shots).toBe(0);
  }, 30_000);

  it('does not stand and break a wall with an enemy near', () => {
    const run = drive({ walls: [fence(400)] }, { x: -200, y: -300 }, { x: 200, y: -300 }, 6, { x: 150, y: 50 });

    expect(run.stats.chosen).toBe(0);
    expect(run.walls.rams).toBe(0);
  });
});

/**
 * Drives a medium tank from `from` to `to` for up to `seconds` the way a bot does: with its driver,
 * a gun, and a breacher that may take over, on a field whose grid follows the walls as they break.
 *
 * @param enemy - Where a known enemy stands, if anywhere.
 * @returns The breacher's statistics, how far down the tank ever went, when it arrived and the walls' damage.
 */
function drive(layout: Partial<CombatLayout>, from: { x: number; y: number }, to: { x: number; y: number }, seconds = 10, enemy?: { x: number; y: number }) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const slots = Array.from({ length: 128 }, (_, index) => 127 - index);
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
  let state = 9;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const full = { halfWidth: 600, halfHeight: 500, ...layout };
  const grid = createNavGrid(full);
  const changes: { minX: number; minY: number; maxX: number; maxY: number }[] = [];
  const combat = createCombat(rapier, world, renderer as unknown as ReturnType<typeof createRangeRenderer>, full, {
    shell: MEDIUM_TANK.shell,
    random,
    onWallsChanged: (bounds) => changes.push(bounds)
  });
  const tank = combat.spawnTank({ ...from, rotation: 0 }, { color: 0, team: 'red', pullSpeed: pullSpeedFor(MEDIUM_TANK.speed) });
  const rival = enemy && combat.spawnTank({ ...enemy, rotation: 0 }, { color: 0, team: 'blue' });
  const member: Member = { id: 0, team: 'red', index: 0, name: 'Red', human: false, tank, gun: createGun(MEDIUM_TANK.gun), role: 'assault', respawnAt: undefined, shotAt: -Infinity, attacker: undefined, kills: 0, deaths: 0 };
  const rivals: Member[] = rival ? [{ ...member, id: 1, team: 'blue', tank: rival, gun: undefined }] : [];
  let time = 0;
  const board = createTeamBoard('red', [member], {
    combat,
    grid,
    map: { ...KOTH_MAP, ...full, point: { x: 0, y: 1000, radius: 10 } },
    rivals,
    clock: () => time,
    capture: () => createCaptureState(CAPTURE_RULES),
    holdTime: CAPTURE_RULES.holdTime
  });
  const fire = (shooter: Member) => {
    if (!shooter.gun?.fire()) {
      return false;
    }

    combat.fire(shooter.tank!);
    return true;
  };
  const breacher = createBreacher(member, { combat, grid, board, clock: () => time, fire });
  const driver = createDriver(grid);
  let lowest = -Infinity;
  let arrivedAt = Infinity;

  while (time < seconds && arrivedAt === Infinity) {
    if (rival) {
      board.see(rival);
    }

    board.update();
    member.gun!.step(1 / 60);
    const position = tank.hull.translation();
    const order = breacher.step(time, tank, { destination: to, allowed: true, cost: () => 0 });
    const move =
      order?.move ?? driver.steer(time, position, order ? order.destination : to, [], { arrive: order ? order.arrive : 20, heading: tank.hull.rotation() });

    if (order?.aim !== undefined) {
      tank.turretAngle = order.aim;
    }

    combat.drive(tank, move);
    combat.step(1 / 60);
    combat.update(1 / 60);
    const change = changes.shift();

    if (change) {
      updateNavGrid(
        grid,
        { minX: change.minX - 96, minY: change.minY - 96, maxX: change.maxX + 96, maxY: change.maxY + 96 },
        (point) => combat.obstacleDistance(point, 128),
        change
      );
    }

    time += 1 / 60;
    lowest = Math.max(lowest, tank.hull.translation().y);

    if (Math.hypot(tank.hull.translation().x - to.x, tank.hull.translation().y - to.y) < 30) {
      arrivedAt = time;
    }
  }

  return { stats: breacher.stats, lowest, arrivedAt, walls: combat.walls.damage };
}
