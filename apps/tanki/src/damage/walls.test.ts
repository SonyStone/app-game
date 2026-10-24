import { beforeAll, describe, expect, it } from 'vitest';
import { pullSpeedFor, type Tank } from '../arena/bodies';
import { createDriver } from '../koth/driver';
import { createNavGrid, findPath, pathLength, updateNavGrid } from '../koth/navigation';
import type { Rapier } from '../physics/Rapier2D';
import { createCombat, type CombatLayout, type ShellSpec, type WallMaterial } from './combat';
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

describe('a light tank thrown by a blast', () => {
  it.each(['steel', 'brick'] as const)('lands against a %s wall, not inside it', (material) => {
    const { combat } = createBattle({ walls: [{ x: 70, y: 0, halfWidth: 12, halfHeight: 150, material }] });
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
