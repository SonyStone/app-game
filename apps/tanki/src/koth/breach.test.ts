import { beforeAll, describe, expect, it } from 'vitest';
import { pullSpeedFor } from '../arena/bodies';
import { createCombat, type CombatLayout, type WallPlacement } from '../damage/combat';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { createBreacher } from './breach';
import { clampGun, inArc, turnInPlace } from './classes/casemate';
import { TANK_CLASSES } from './classes/classes';
import { createWeapon, type Trigger } from './classes/weapon';
import { createDriver } from './driver';
import { KOTH_MAP } from './map';
import { createNavGrid, updateNavGrid } from './navigation';
import { CAPTURE_RULES, createCaptureState } from './rules';
import { MEDIUM_TANK, type TankClass } from './tanks';
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

  it('breaks its way out through brick when there is no other way, as its class does best, and never through steel', () => {
    // A room of steel with one brick wall, on the side the bot wants to go.
    const room = (material: 'brick' | 'steel') => [
      { x: -200, y: -110, halfWidth: 100, halfHeight: 10, material: 'steel' as const },
      { x: -200, y: 110, halfWidth: 100, halfHeight: 10, material: 'steel' as const },
      { x: -310, y: 0, halfWidth: 10, halfHeight: 120, material: 'steel' as const },
      { x: -88, y: 0, halfWidth: 12, halfHeight: 100, material }
    ];
    const rammed = drive({ walls: room('brick') }, { x: -200, y: 0 }, { x: 200, y: 0 }, 40);
    const shot = drive({ walls: room('brick') }, { x: -200, y: 0 }, { x: 200, y: 0 }, 40, undefined, TANK_CLASSES.demoman);
    const steel = drive({ walls: room('steel') }, { x: -200, y: 0 }, { x: 200, y: 0 }, 8);

    // A Soldier rams brick open in a couple of runs; a Demoman blows it apart with a few grenades.
    expect(rammed.stats.chosen).toBe(1);
    expect(rammed.stats.rams).toBeGreaterThanOrEqual(1);
    expect(rammed.stats.shots).toBe(0);
    expect(rammed.stats.passed).toBe(1);
    expect(rammed.arrivedAt).toBeLessThan(20);
    expect(shot.stats.chosen).toBe(1);
    expect(shot.stats.shots).toBeGreaterThanOrEqual(3);
    expect(shot.stats.rams).toBe(0);
    expect(shot.stats.passed).toBe(1);
    expect(shot.arrivedAt).toBeLessThan(20);
    expect(steel.stats.considered).toBe(0);
    expect(steel.stats.shots).toBe(0);
  }, 30_000);

  it('breaks through brick by its class: a Heavy rams it, a Demoman blows it apart, a Scout drives round', () => {
    // A brick wall across a tall field, with a way round at the bottom.
    const layout = { halfHeight: 1500, walls: [{ x: 0, y: -50, halfWidth: 12, halfHeight: 1450, material: 'brick' as const }] };
    const heavy = drive(layout, { x: -200, y: -300 }, { x: 200, y: -300 }, 30, undefined, TANK_CLASSES.heavy);
    const demoman = drive(layout, { x: -200, y: -300 }, { x: 200, y: -300 }, 30, undefined, TANK_CLASSES.demoman);
    const scout = drive(layout, { x: -200, y: -300 }, { x: 200, y: -300 }, 30, undefined, TANK_CLASSES.scout);

    expect(heavy.stats.chosen).toBe(1);
    expect(heavy.stats.rams).toBeGreaterThanOrEqual(1);
    expect(heavy.stats.shots).toBe(0);
    expect(heavy.stats.passed).toBe(1);
    expect(demoman.stats.chosen).toBe(1);
    expect(demoman.stats.shots).toBeGreaterThanOrEqual(3);
    expect(demoman.stats.rams).toBe(0);
    expect(demoman.stats.passed).toBe(1);
    // Both got through straight, well before driving round would have brought them there.
    expect(Math.max(heavy.lowest, demoman.lowest)).toBeLessThan(-150);
    expect(Math.max(heavy.arrivedAt, demoman.arrivedAt)).toBeLessThan(15);
    // Shooting its way through with a scattergun takes longer than the drive round.
    expect(scout.stats.chosen).toBe(0);
    expect(scout.walls.hits).toBe(0);
    expect(scout.lowest).toBeGreaterThan(1300);
  }, 60_000);

  it('does not stand and break a wall with an enemy near', () => {
    const run = drive({ walls: [fence(400)] }, { x: -200, y: -300 }, { x: 200, y: -300 }, 6, { x: 150, y: 50 });

    expect(run.stats.chosen).toBe(0);
    expect(run.walls.rams).toBe(0);
  });
});

/**
 * Drives a tank of `tankClass`, by default the medium tank, from `from` to `to` for up to
 * `seconds` the way a bot does: with its driver, its class's weapon, and a breacher that may take
 * over, on a field whose grid follows the walls as they break.
 *
 * @param enemy - Where a known enemy stands, if anywhere.
 * @returns The breacher's statistics, how far down the tank ever went, when it arrived and the walls' damage.
 */
function drive(
  layout: Partial<CombatLayout>,
  from: { x: number; y: number },
  to: { x: number; y: number },
  seconds = 10,
  enemy?: { x: number; y: number },
  tankClass: TankClass = MEDIUM_TANK
) {
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
  const tank = combat.spawnTank(
    { ...from, rotation: 0 },
    { color: 0, team: 'red', pullSpeed: pullSpeedFor(tankClass.speed), hull: tankClass.hull, mass: tankClass.mass, look: tankClass.look }
  );
  const rival = enemy && combat.spawnTank({ ...enemy, rotation: 0 }, { color: 0, team: 'blue' });
  const member: Member = {
    id: 0,
    team: 'red',
    index: 0,
    name: 'Red',
    human: false,
    tank,
    tankClass,
    nextClass: undefined,
    weapon: createWeapon(tankClass, random),
    trigger: { fire: false },
    pivot: undefined,
    role: 'assault',
    respawnAt: undefined,
    shotAt: -Infinity,
    attacker: undefined,
    kills: 0,
    deaths: 0
  };
  const rivals: Member[] = rival ? [{ ...member, id: 1, team: 'blue', tank: rival, weapon: undefined }] : [];
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
  const trigger = (shooter: Member, pull: Trigger) => {
    shooter.trigger = pull;
  };
  const breacher = createBreacher(member, { combat, grid, board, clock: () => time, trigger });
  const driver = createDriver(grid);
  let lowest = -Infinity;
  let arrivedAt = Infinity;

  while (time < seconds && arrivedAt === Infinity) {
    if (rival) {
      board.see(rival);
    }

    board.update();
    const position = tank.hull.translation();
    const order = breacher.step(time, tank, { destination: to, allowed: true, cost: () => 0 });
    let move =
      order?.move ?? driver.steer(time, position, order ? order.destination : to, [], { arrive: order ? order.arrive : 20, heading: tank.hull.rotation() });

    if (order?.aim !== undefined) {
      tank.turretAngle = order.aim;

      // A casemate gun turns its hull onto the wall it shoots, as a bot's does.
      if (tankClass.mount.kind === 'casemate' && !inArc(tank, order.aim, tankClass.mount.arc - 0.03)) {
        member.pivot ??= { ...position };
        move = turnInPlace(tank, member.pivot, order.aim, tankClass.mount.traverse, tank.pullSpeed);
      }
    }

    if (tankClass.mount.kind === 'casemate') {
      clampGun(tank, tankClass.mount.arc);
    }

    // The weapon fires after the bot's step, as the match's does.
    for (const shot of member.weapon!.step(1 / 60, member.trigger)) {
      combat.fire(tank, { ...shot, angle: tank.turretAngle + (shot.angle ?? 0) });
    }

    member.trigger = { fire: false };
    tank.pullSpeed = pullSpeedFor(tankClass.speed) * member.weapon!.speedShare;
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
