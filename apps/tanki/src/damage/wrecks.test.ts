import { beforeAll, describe, expect, it } from 'vitest';
import { pullSpeedFor, type Tank } from '../arena/bodies';
import { createNavGrid, isOpenAt, updateNavGrid } from '../koth/navigation';
import type { Rapier } from '../physics/Rapier2D';
import { createCombat, type CombatLayout, type ShellSpec } from './combat';
import { carve } from './field';
import type { createRangeRenderer } from './renderer';
import { HULL_CORE } from './shapes';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

const shell: ShellSpec = { speed: 900, range: 700, hole: 4.5, depth: 3, knockback: 700 };

describe('wrecks', () => {
  it('stand where a tank blew up, charred, and stop shells and sight until shot apart into scrap', () => {
    const { combat } = createBattle();
    const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0xff0000 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0x0000ff, team: 'blue' });

    blowUp(combat, shooter, target);

    const [wreck] = combat.wrecks.list;

    expect(combat.armorOf(target)).toBeUndefined();
    expect(combat.wrecks.list).toHaveLength(1);
    expect(Math.hypot(wreck.x, wreck.y)).toBeLessThan(15);
    expect(wreck.team).toBe('blue');
    // The blast tore the core out and threw a piece or two off, but most of the hull stands.
    expect(wreck.area).toBeGreaterThan(450);
    expect(combat.lineOfSight({ x: -100, y: 0 }, { x: 100, y: 0 })).toBe(false);
    expect(combat.obstacleDistance({ x: wreck.x, y: wreck.y }, 100)).toBeLessThan(0);

    // A tank behind the wreck is safe from a shell fired straight at it.
    const hidden = combat.spawnTank({ x: 150, y: 0, rotation: 0 }, { color: 0x0000ff, team: 'blue' });
    fireAt(combat, shooter, hidden.hull.translation());

    expect(combat.armorLeft(hidden)).toBe(1);
    expect(combat.wrecks.list[0].area).toBeLessThan(wreck.area);

    for (let shot = 0; shot < 40 && combat.wrecks.list.length > 0; shot++) {
      fireAt(combat, shooter, { x: wreck.x, y: wreck.y + [0, 6, -6, 10, -10][shot % 5] });
    }

    settle(combat);

    expect(combat.wrecks.list).toHaveLength(0);
    expect(combat.wrecks.made).toBe(1);
    expect(combat.scrap.near({ x: wreck.x, y: wreck.y }, 120).length).toBeGreaterThanOrEqual(3);
  });

  it('stand at most as many as the limit, the oldest falling apart into a heap of scrap', () => {
    const { combat } = createBattle({ wrecks: 2 });
    const shooter = combat.spawnTank({ x: -300, y: 0, rotation: 0 }, { color: 0xff0000 });
    const spots = [-120, 0, 120];

    for (const y of spots) {
      const target = combat.spawnTank({ x: 0, y, rotation: 0 }, { color: 0x0000ff });
      shooter.hull.setTranslation({ x: -300, y }, true);
      shooter.pull.setTranslation({ x: -285, y }, true);
      blowUp(combat, shooter, target);
    }

    settle(combat);

    expect(combat.wrecks.made).toBe(3);
    expect(combat.wrecks.list.map((wreck) => Math.round(wreck.y / 120))).toEqual([0, 1]);
    // Where the first stood lies a heap of its pieces.
    expect(combat.scrap.near({ x: 0, y: -120 }, 60).length).toBeGreaterThanOrEqual(3);
  });

  it('do not budge for a push, and slide a few pixels from a ram at full speed', () => {
    const { combat } = createBattle({}, { halfWidth: 600 });
    const shooter = combat.spawnTank({ x: -300, y: 0, rotation: 0 }, { color: 0xff0000 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0x0000ff });
    blowUp(combat, shooter, target);
    shooter.hull.setTranslation({ x: -300, y: 200 }, true);
    shooter.pull.setTranslation({ x: -285, y: 200 }, true);
    const before = combat.wrecks.list[0];

    // A tank creeps up to the wreck and keeps pushing.
    const pusher = combat.spawnTank({ x: -70, y: 0, rotation: 0 }, { color: 0, pullSpeed: pullSpeedFor(250) });

    for (let step = 0; step < 120; step++) {
      combat.drive(pusher, { x: 0.3, y: 0 });
      combat.step(1 / 60);
    }

    const pushed = combat.wrecks.list[0];

    // It backs off and rams the wreck at full speed.
    pusher.hull.setTranslation({ x: -180, y: 0 }, true);
    pusher.hull.setRotation(0, true);
    pusher.pull.setTranslation({ x: -165, y: 0 }, true);

    for (let step = 0; step < 60; step++) {
      combat.drive(pusher, { x: 1, y: 0 });
      combat.step(1 / 60);
    }

    const rammed = combat.wrecks.list[0];

    expect(Math.hypot(pushed.x - before.x, pushed.y - before.y)).toBeLessThan(0.5);
    expect(rammed.x - pushed.x).toBeGreaterThan(3);
    expect(rammed.x - pushed.x).toBeLessThan(30);
  });

  it('are not left of a hull with hardly any armor left, which falls apart into scrap instead', () => {
    const { combat } = createBattle();
    const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0xff0000 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0x0000ff });

    // Everything ahead of the core is shot away.
    carve(combat.armorOf(target)!, { x: 8, y: 0 }, 17, 0, 1);
    blowUp(combat, shooter, target);
    settle(combat);

    expect(combat.armorOf(target)).toBeUndefined();
    expect(combat.wrecks.made).toBe(1);
    expect(combat.wrecks.list).toHaveLength(0);
  });

  it('block the ways of navigation where they stand, until they are gone', () => {
    const layout = { halfWidth: 400, halfHeight: 300 };
    const grid = createNavGrid(layout);
    const { combat } = createBattle({
      onWallsChanged: (bounds) =>
        updateNavGrid(grid, { minX: bounds.minX - 96, minY: bounds.minY - 96, maxX: bounds.maxX + 96, maxY: bounds.maxY + 96 }, (point) =>
          combat.obstacleDistance(point, 128)
        )
    });
    const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0xff0000 });
    const target = combat.spawnTank({ x: 40, y: 20, rotation: 0 }, { color: 0x0000ff });

    expect(isOpenAt(grid, { x: 40, y: 20 })).toBe(true);

    blowUp(combat, shooter, target);
    const [wreck] = combat.wrecks.list;

    expect(isOpenAt(grid, wreck)).toBe(false);
    expect(grid.revision).toBeGreaterThan(0);

    combat.wrecks.take(wreck.id);

    expect(isOpenAt(grid, wreck)).toBe(true);
  });
});

describe('scrap', () => {
  it('lands where pieces of armor and turrets fell and stays, listed with its material and area, until taken', () => {
    const { combat } = createBattle();
    const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0xff0000 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0x0000ff });

    blowUp(combat, shooter, target);
    settle(combat);
    const pieces = [...combat.scrap.pieces];

    // The turret and a wedge or two of the hull, thrown off by the blast.
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expect(pieces.every((piece) => piece.material === 'metal' && piece.area > 0)).toBe(true);
    expect(pieces.some((piece) => piece.area > 400)).toBe(true);
    expect(combat.scrap.flying).toBe(0);
    expect(combat.scrap.chunks).toBeGreaterThan(0);

    // Pieces stay put for as long as nobody takes them.
    for (let step = 0; step < 600; step++) {
      combat.update(1 / 60);
    }

    expect(combat.scrap.pieces.map((piece) => piece.id)).toEqual(pieces.map((piece) => piece.id));

    const nearest = combat.scrap.near({ x: 0, y: 0 }, 400)[0];
    const taken = combat.scrap.take(nearest.id);

    expect(taken?.area).toBe(nearest.area);
    expect(combat.scrap.take(nearest.id)).toBeUndefined();
    expect(combat.scrap.pieces).toHaveLength(pieces.length - 1);

    combat.reset();

    expect(combat.scrap.pieces).toHaveLength(0);
    expect(combat.scrap.chunks).toBe(0);
  });
});

/**
 * Opens a hole from `target`'s rear onto its core and shoots the core from where `shooter` stands,
 * which blows the target up.
 */
function blowUp(combat: ReturnType<typeof createCombat>, shooter: Tank, target: Tank) {
  carve(combat.armorOf(target)!, { x: HULL_CORE.x - 12, y: 0 }, 9, 0, 1);
  // Mending by a hair makes the battle refresh the tank's shape with the next step.
  combat.repair(target, 1e-9);
  combat.step(1 / 60);
  const angle = target.hull.rotation();
  const core = target.hull.translation();
  fireAt(combat, shooter, { x: core.x + HULL_CORE.x * Math.cos(angle), y: core.y + HULL_CORE.x * Math.sin(angle) });
}

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

/** Lets everything flying come to rest. */
function settle(combat: ReturnType<typeof createCombat>) {
  for (let step = 0; step < 360; step++) {
    combat.step(1 / 60);
    combat.update(1 / 60);
  }
}

/** A battle with shells on a real Rapier world, seeded, with a renderer that only hands out field slots. */
function createBattle(options: Parameters<typeof createCombat>[4] = {}, layout: Partial<CombatLayout> = {}) {
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
  let state = 3;
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
