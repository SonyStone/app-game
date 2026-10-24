import { beforeAll, describe, expect, it } from 'vitest';
import { pullSpeedFor, type Tank } from '../arena/bodies';
import { createDriver } from '../koth/driver';
import { createNavGrid, findPath, pathLength, updateNavGrid } from '../koth/navigation';
import type { Rapier } from '../physics/Rapier2D';
import { TANK_CLASSES } from '../koth/classes/classes';
import { MEDIUM_TANK, type TankClass } from '../koth/tanks';
import { createCombat, type CombatLayout, type ShellSpec, type WallMaterial } from './combat';
import { carve } from './field';
import type { createRangeRenderer } from './renderer';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

const shell: ShellSpec = { speed: 900, range: 700, hole: 4.5, depth: 3, knockback: 700 };

describe('breakable walls', () => {
  it.each([
    ['wood', 14, 2],
    ['brick', 24, 4],
    ['concrete', 30, 9]
  ] as [WallMaterial, number, number][])('chip a crater per hit, and a %s wall %i px thick is shot through in %i hits', (material, thickness, hits) => {
    const { combat } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: thickness / 2, halfHeight: 120, material }] });
    const shooter = combat.spawnTank({ x: -250, y: 0, rotation: 0 }, { color: 0 });
    // Shots land within a tile, away from the seams between tiles.
    const through = () => combat.lineOfSight({ x: -150, y: 10 }, { x: 150, y: 10 });
    let shots = 0;
    // Rapier answers ray queries from the state of the last step.
    combat.step(1 / 60);

    while (!through() && shots < 20) {
      fireAt(combat, shooter, { x: 0, y: 10 });
      shots++;

      if (shots === 1) {
        // The first hit leaves a crater in the near face but not a hole.
        const tile = combat.walls.tiles.find((candidate) => candidate.rect.minY < 10 && candidate.rect.maxY > 10)!;

        expect(tile.pristine).toBe(false);
        expect(sampleArmor(tile.field, -thickness / 2 + 1, 10)).toBeGreaterThan(0);
      }
    }

    expect(shots).toBe(hits);
    expect(combat.walls.damage.hits).toBe(hits);
  });

  it('leave steel untouched', () => {
    const { combat } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: 15, halfHeight: 120, material: 'steel' }] });
    const shooter = combat.spawnTank({ x: -250, y: 0, rotation: 0 }, { color: 0 });

    for (let shot = 0; shot < 15; shot++) {
      fireAt(combat, shooter, { x: 0, y: 0 });
    }

    expect(combat.walls.tiles).toHaveLength(0);
    expect(combat.walls.damage.hits).toBe(0);
    expect(combat.lineOfSight({ x: -150, y: 0 }, { x: 150, y: 0 })).toBe(false);
  });

  it('drop a piece that lost enough, opening a way that paths take and a tank drives through', () => {
    // A fence across the field with a way round at the bottom.
    const layout = { halfWidth: 400, halfHeight: 300, walls: [{ x: 0, y: -50, halfWidth: 7, halfHeight: 250, material: 'wood' as const }] };
    const grid = createNavGrid(layout);
    const { combat } = createBattle(layout, {
      onWallsChanged: (bounds) =>
        updateNavGrid(
          grid,
          { minX: bounds.minX - 96, minY: bounds.minY - 96, maxX: bounds.maxX + 96, maxY: bounds.maxY + 96 },
          (point) => combat.obstacleDistance(point, 128)
        )
    });
    const from = { x: -200, y: -200 };
    const to = { x: 200, y: -200 };
    const around = pathLength(findPath(grid, from, to)!);
    const shooter = combat.spawnTank({ x: -150, y: -200, rotation: 0 }, { color: 0 });
    let shots = 0;

    // Once shells fly through the hole, the shooter aims beside it.
    while (combat.walls.damage.collapsed === 0 && shots < 10) {
      fireAt(combat, shooter, { x: 0, y: -200 + [0, 0, 14, -14, 28, -28][shots % 6] });
      shots++;
    }

    const fallen = combat.walls.tiles.find((tile) => tile.fallen)!;
    const through = findPath(grid, from, to)!;

    expect(shots).toBeLessThanOrEqual(4);
    expect(fallen.rect.maxY - fallen.rect.minY).toBeGreaterThan(60);
    expect(grid.revision).toBeGreaterThan(0);
    expect(around).toBeGreaterThan(800);
    expect(pathLength(through)).toBeLessThan(420);

    // A tank driven by a bot's driver takes the new way.
    const runner = combat.spawnTank({ ...from, rotation: 0 }, { color: 0, pullSpeed: pullSpeedFor(250) });
    const driver = createDriver(grid);
    let time = 0;
    let crossedAt: { x: number; y: number } | undefined;

    while (time < 6 && Math.hypot(runner.hull.translation().x - to.x, runner.hull.translation().y - to.y) > 20) {
      const before = runner.hull.translation();
      combat.drive(runner, driver.steer(time, before, to, []));
      combat.step(1 / 60);
      time += 1 / 60;
      const after = runner.hull.translation();

      if (before.x < 0 && after.x >= 0) {
        crossedAt = after;
      }
    }

    expect(time).toBeLessThan(3);
    expect(crossedAt!.y).toBeGreaterThan(fallen.rect.minY + fallen.wall.y);
    expect(crossedAt!.y).toBeLessThan(fallen.rect.maxY + fallen.wall.y);
  });

  it('leave a heap of rubble where a piece of a building fell, which tanks drive over and shots from afar meet', () => {
    // A brick building a tile thick and two tiles long.
    const { combat } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: 30, halfHeight: 60, material: 'brick' }] });
    const shooter = combat.spawnTank({ x: -250, y: -30, rotation: 0 }, { color: 0 });
    let shots = 0;

    while (combat.walls.damage.collapsed === 0 && shots < 60) {
      fireAt(combat, shooter, { x: 0, y: -30 + [0, 12, -12, 22, -22][shots % 5] });
      shots++;
    }

    const heap = combat.walls.tiles.find((tile) => tile.fallen)!;
    const lines = [-48, -39, -30, -21, -12];

    expect(heap.rubble).toBe(true);
    expect(combat.obstacleDistance({ x: 0, y: -30 }, 100)).toBeGreaterThan(24);
    expect(lines.filter((y) => !combat.lineOfSight({ x: -250, y }, { x: 250, y })).length).toBeGreaterThanOrEqual(3);
    // A tank right behind the rubble sees and shoots over it.
    expect(lines.every((y) => combat.lineOfSight({ x: -55, y }, { x: 250, y }))).toBe(true);
  });

  it('give way to rams by material: a fence to one at full speed, a brick wall to a few that dent the rammer, concrete and steel to none', () => {
    const fence = ram('wood', 14, 3);
    const brick = ram('brick', 24, 6);
    const concrete = ram('concrete', 30, 4);
    const steel = ram('steel', 30, 4);

    expect(fence.rams).toBe(1);
    expect(fence.armor).toBeGreaterThan(0.99);
    expect(brick.rams).toBeGreaterThanOrEqual(2);
    expect(brick.rams).toBeLessThanOrEqual(4);
    // Ramming brick is not free: the nose caves in a little with every ram.
    expect(brick.armor).toBeLessThan(0.98);
    expect(concrete.rams).toBe(Infinity);
    expect(concrete.bitten).toBeGreaterThan(0);
    expect(steel.rams).toBe(Infinity);
    expect(steel.bitten).toBe(0);
    expect(steel.armor).toBeLessThan(fence.armor);
  });

  it('give way to rams by the mass of the class: a Heavy breaks brick in fewer runs than a Soldier, a Scout in more, and dents its nose more', () => {
    const heavy = ram('brick', 24, 6, TANK_CLASSES.heavy);
    const soldier = ram('brick', 24, 6, TANK_CLASSES.soldier);
    const scout = ram('brick', 24, 6, TANK_CLASSES.scout);

    expect(heavy.rams).toBe(1);
    expect(soldier.rams).toBeGreaterThan(heavy.rams);
    expect(scout.rams).toBeGreaterThan(soldier.rams);
    // A thicker wall the Heavy still rams open; the Scout's light blows never get through it.
    expect(ram('brick', 40, 4, TANK_CLASSES.heavy).rams).toBeLessThanOrEqual(2);
    expect(ram('brick', 40, 6, TANK_CLASSES.scout).rams).toBe(Infinity);
    // The harder blow caves in the rammer's own nose more, ram for ram.
    expect(heavy.lost / heavy.bitten).toBeGreaterThan((scout.lost / scout.bitten) * 2);
  });

  it('take no ram from a tank thrown into them by a blast, whatever its tracks do, and the next ram once it drives again', () => {
    const { combat } = createBattle({ walls: [{ x: 70, y: 0, halfWidth: 12, halfHeight: 150, material: 'brick' }] });
    const tank = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0, pullSpeed: pullSpeedFor(250) });
    combat.drive(tank, { x: 1, y: 0 });
    combat.step(1 / 60);
    combat.blast({ x: -26, y: 0 }, { radius: 95, hole: 0, depth: 0, knockback: 1500 });

    expect(combat.isAirborne(tank)).toBe(true);

    let closest = Infinity;
    let dented = 1;

    for (let step = 0; step < 60 && combat.isAirborne(tank); step++) {
      combat.drive(tank, { x: 1, y: 0 });
      combat.step(1 / 60);
      closest = Math.min(closest, combat.obstacleDistance(tank.hull.translation(), 100));
      dented = combat.armorLeft(tank);
    }

    // It slammed nose first into the wall, whose face is at x = 58, bounced off and landed, and
    // only dented: no bite. Its pull rode along on its anchor, so the joint never dragged the hull
    // into the wall.
    expect(combat.isAirborne(tank)).toBe(false);
    expect(dented).toBeLessThan(0.999);
    expect(combat.walls.damage.rams).toBe(0);
    expect(closest).toBeGreaterThan(10);

    // On the ground again, from a run-up, its tracks drive it into the wall: a ram.
    tank.hull.setTranslation({ x: -100, y: 0 }, true);
    tank.hull.setRotation(0, true);
    tank.hull.setLinvel({ x: 0, y: 0 }, true);
    tank.pull.setTranslation({ x: -85, y: 0 }, true);

    for (let step = 0; step < 60; step++) {
      combat.drive(tank, { x: 1, y: 0 });
      combat.step(1 / 60);
    }

    expect(combat.walls.damage.rams).toBe(1);
  });

  it('drop the pieces blasts knock off them as scrap of their material, as tanks drop theirs', () => {
    const { combat } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: 7, halfHeight: 120, material: 'wood' }] });
    const tank = combat.spawnTank({ x: -200, y: 150, rotation: 0 }, { color: 0 });
    const grenade = TANK_CLASSES.demoman.shell.blast!;

    for (let blast = 0; blast < 3; blast++) {
      combat.blast({ x: -30, y: 10 + blast * 6 }, grenade);
      settle(combat);
    }

    expect(combat.walls.damage.collapsed).toBeGreaterThan(0);
    expect(combat.scrap.pieces.filter((piece) => piece.material === 'wood').length).toBeGreaterThanOrEqual(2);
    expect(combat.scrap.pieces.some((piece) => piece.material === 'metal')).toBe(false);

    // A groove across the tank's front corner leaves it hanging by a bridge, which a blast there cuts.
    for (let along = 0; along <= 1; along += 0.04) {
      carve(combat.armorOf(tank)!, { x: 2 + 15 * along, y: 13.5 - 15 * along }, 1.4, 0, 1);
    }

    combat.repair(tank, 1e-9);
    settle(combat);

    expect(combat.scrap.pieces.some((piece) => piece.material === 'metal')).toBe(false);

    combat.blast({ x: -174, y: 147 }, grenade);
    settle(combat);

    expect(combat.scrap.pieces.some((piece) => piece.material === 'metal' && Math.hypot(piece.x + 200, piece.y - 150) < 120)).toBe(true);
  });

  it('stand again, whole, after a reset', () => {
    const { combat } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: 7, halfHeight: 120, material: 'wood' }] });
    const shooter = combat.spawnTank({ x: -250, y: 0, rotation: 0 }, { color: 0 });

    for (let shot = 0; shot < 4; shot++) {
      fireAt(combat, shooter, { x: 0, y: 10 });
    }

    expect(combat.lineOfSight({ x: -150, y: 10 }, { x: 150, y: 10 })).toBe(true);

    combat.reset();
    combat.step(1 / 60);

    expect(combat.walls.tiles.every((tile) => tile.pristine && !tile.fallen)).toBe(true);
    expect(combat.lineOfSight({ x: -150, y: 10 }, { x: 150, y: 10 })).toBe(false);
  });
});

/**
 * Rams a wall of `material` and `thickness` across the field with a tank of `tankClass`, by default
 * the medium tank, at full speed, from a run-up of 120 px, up to `most` times, until the tank breaks
 * through.
 *
 * @returns The ram that broke through, `Infinity` if none did; the rammer's armor left, and the
 *   square pixels of it lost; and how many rams bit into the wall.
 */
function ram(material: WallMaterial, thickness: number, most: number, tankClass: TankClass = MEDIUM_TANK) {
  const { combat } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: thickness / 2, halfHeight: 120, material }] });
  const tank = combat.spawnTank(
    { x: -150, y: 10, rotation: 0 },
    { color: 0, pullSpeed: pullSpeedFor(tankClass.speed), hull: tankClass.hull, mass: tankClass.mass, look: tankClass.look }
  );
  const solid = () => armorArea(combat.armorOf(tank)!);
  const whole = solid();
  let rams = Infinity;

  for (let attempt = 1; attempt <= most && rams === Infinity; attempt++) {
    tank.hull.setTranslation({ x: -150, y: 10 }, true);
    tank.hull.setRotation(0, true);
    tank.hull.setLinvel({ x: 0, y: 0 }, true);
    tank.hull.setAngvel(0, true);
    tank.pull.setTranslation({ x: -135, y: 10 }, true);

    for (let step = 0; step < 72 && rams === Infinity; step++) {
      combat.drive(tank, { x: 1, y: 0 });
      combat.step(1 / 60);

      if (tank.hull.translation().x > thickness / 2 + 25) {
        rams = attempt;
      }
    }
  }

  return { rams, armor: combat.armorLeft(tank), lost: whole - solid(), bitten: combat.walls.damage.rams };
}

/** Lets everything flying come to rest. */
function settle(combat: ReturnType<typeof createCombat>) {
  for (let step = 0; step < 240; step++) {
    combat.step(1 / 60);
    combat.update(1 / 60);
  }
}

/** Square pixels of armor in a field. */
function armorArea(field: { data: Float32Array; cell: number }) {
  let cells = 0;

  for (let index = 0; index < field.data.length; index += 4) {
    cells += field.data[index] < 0 ? 1 : 0;
  }

  return cells * field.cell * field.cell;
}

describe('a light tank thrown by a blast', () => {
  it.each([
    ['steel', 12],
    ['brick', 12],
    ['wood', 7]
  ] as const)('lands against a %s wall, not inside it', (material, halfWidth) => {
    const { combat } = createBattle({ walls: [{ x: 58 + halfWidth, y: 0, halfWidth, halfHeight: 150, material }] });
    const tank = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0, mass: 0.65 });
    combat.step(1 / 60);
    // As hard as two grenades going off together: about 1800 px/s, a wall's thickness a step.
    combat.blast({ x: -26, y: 0 }, { radius: 95, hole: 0, depth: 0, knockback: 1200 });

    expect(combat.isAirborne(tank)).toBe(true);

    let closest = Infinity;
    let farthest = -Infinity;

    for (let step = 0; step < 60; step++) {
      combat.step(1 / 60);
      closest = Math.min(closest, combat.obstacleDistance(tank.hull.translation(), 100));
      farthest = Math.max(farthest, tank.hull.translation().x);
    }

    // It flew into the wall, whose face is at x = 58, and its center stayed half a hull's width off it.
    expect(farthest).toBeGreaterThan(36);
    expect(closest).toBeGreaterThan(10.5);
  });
});

/** Turns `shooter`'s turret onto `target`, fires a shell and lets it land. */
function fireAt(combat: ReturnType<typeof createCombat>, shooter: Tank, target: { x: number; y: number }) {
  const at = shooter.hull.translation();
  shooter.turretAngle = Math.atan2(target.y - at.y, target.x - at.x);
  combat.fire(shooter);

  for (let step = 0; step < 30; step++) {
    combat.drive(shooter, { x: 0, y: 0 });
    combat.step(1 / 60);
    combat.update(1 / 60);
  }
}

/** The armor channel of a field at a local point, from the nearest cell. */
function sampleArmor(field: { cols: number; rows: number; cell: number; originX: number; originY: number; data: Float32Array }, x: number, y: number) {
  const col = Math.round((x - field.originX) / field.cell);
  const row = Math.round((y - field.originY) / field.cell);
  return field.data[(row * field.cols + col) * 4];
}

/** A battle with shells on a real Rapier world, seeded, with a renderer that only hands out field slots. */
function createBattle(layout: Partial<CombatLayout>, options: Parameters<typeof createCombat>[4] = {}) {
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
  let state = 7;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const combat = createCombat(
    rapier,
    world,
    renderer as unknown as ReturnType<typeof createRangeRenderer>,
    { halfWidth: 400, halfHeight: 300, ...layout },
    { shell, random, ...options }
  );

  return { combat };
}
