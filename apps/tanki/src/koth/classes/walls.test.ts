import { beforeAll, describe, expect, it } from 'vitest';
import { pullSpeedFor, type Tank } from '../../arena/bodies';
import { createCombat, type CombatLayout, type ShellSpec } from '../../damage/combat';
import type { createRangeRenderer } from '../../damage/renderer';
import type { Rapier } from '../../physics/Rapier2D';
import type { TankClassId } from '../tanks';
import { TANK_CLASSES } from './classes';
import { chargedShell } from './weapon';

type Point = { x: number; y: number };

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

describe('blasts against breakable walls', () => {
  it("chip a rocket's crater into the brick facing them within the radius, not beyond it or behind cover", () => {
    const blast = TANK_CLASSES.soldier.shell.blast!;
    const { combat } = createBattle({
      walls: [
        // In reach, 28 px off.
        { x: 0, y: 0, halfWidth: 12, halfHeight: 150, material: 'brick' },
        // Out of reach, 98 px off.
        { x: -150, y: 0, halfWidth: 12, halfHeight: 150, material: 'brick' },
        // In reach, 44 px off, but behind a slab of steel.
        { x: -40, y: 50, halfWidth: 20, halfHeight: 6, material: 'brick' },
        { x: -40, y: 22, halfWidth: 30, halfHeight: 3 }
      ]
    });
    const facing = tileAt(combat, { x: -11, y: 0 });
    combat.step(1 / 60);

    combat.blast({ x: -40, y: 0 }, blast);
    combat.step(1 / 60);

    expect(facing.pristine).toBe(false);
    expect(armorAt(facing, { x: -11, y: 0 })).toBeGreaterThan(0);
    expect(tileAt(combat, { x: -139, y: 0 }).pristine).toBe(true);
    expect(tileAt(combat, { x: -40, y: 45 }).pristine).toBe(true);
    // The blast meets a wall on its face toward it: the rest of the wall is spared.
    expect(combat.walls.tiles.filter((tile) => !tile.pristine)).toEqual([facing]);
  });

  it("break brick three times as hard from a Demoman's grenade as from a rocket's blast", () => {
    const blastsToFell = (id: TankClassId) => {
      const { combat } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: 12, halfHeight: 150, material: 'brick' }] });
      let blasts = 0;
      combat.step(1 / 60);

      while (combat.walls.damage.collapsed === 0 && blasts < 40) {
        combat.blast({ x: -14, y: 10 + [0, 12, -12][blasts % 3] }, TANK_CLASSES[id].shell.blast!);
        combat.step(1 / 60);
        blasts++;
      }

      return blasts;
    };
    const rocket = blastsToFell('soldier');
    const grenade = blastsToFell('demoman');

    expect(grenade).toBeLessThanOrEqual(3);
    expect(rocket).toBeGreaterThanOrEqual(grenade * 2.5);
  });

  it("let a Soldier's rockets shoot through brick in as many hits as the shell walls were made for", () => {
    const { combat } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: 12, halfHeight: 150, material: 'brick' }] });
    const soldier = spawn(combat, 'soldier', { x: -250, y: 0, rotation: 0 });
    let shots = 0;
    combat.step(1 / 60);

    while (combat.lineOfSight({ x: -150, y: 10 }, { x: 150, y: 10 }) === false && shots < 12) {
      fireAt(combat, soldier, { x: 0, y: 10 }, { shell: TANK_CLASSES.soldier.shell });
      shots++;
    }

    expect(shots).toBeGreaterThanOrEqual(3);
    expect(shots).toBeLessThanOrEqual(5);
  });

  it('leave small craters from gatling rounds and pellets, many of which bring a fence down', () => {
    const { combat } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: 7, halfHeight: 150, material: 'wood' }] });
    const heavy = spawn(combat, 'heavy', { x: -200, y: 10, rotation: 0 });
    const fence = tileAt(combat, { x: -6, y: 10 });
    combat.step(1 / 60);
    fireAt(combat, heavy, { x: 0, y: 10 }, { shell: TANK_CLASSES.heavy.shell });
    const left = armorAt(fence, { x: -6, y: 10 });

    expect(fence.pristine).toBe(false);
    // A small crater: the near face is chipped, the fence stands.
    expect(left).toBeGreaterThan(0);
    expect(armorAt(fence, { x: 0, y: 10 })).toBeLessThan(0);

    let rounds = 1;

    while (combat.walls.damage.collapsed === 0 && rounds < 60) {
      fireAt(combat, heavy, { x: 0, y: 10 + ((rounds * 7) % 30) - 15 }, { shell: TANK_CLASSES.heavy.shell }, 4);
      rounds++;
    }

    expect(rounds).toBeGreaterThan(6);
    expect(rounds).toBeLessThan(60);
  });
});

describe('grenades and breakable walls', () => {
  const demoman = TANK_CLASSES.demoman.shell;

  it('bounce off a brick tile, and fly through the gap once the tile fell', () => {
    const { combat } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: 12, halfHeight: 150, material: 'brick' }] });
    const thrower = spawn(combat, 'demoman', { x: -200, y: 0, rotation: 0 });
    combat.step(1 / 60);

    const blocked = throwAt(combat, thrower, 400);

    expect(blocked.farthest).toBeLessThan(-12);
    // It came back off the wall.
    expect(blocked.end.x).toBeLessThan(blocked.farthest - 10);

    while (combat.walls.damage.collapsed === 0) {
      combat.blast({ x: -14, y: 0 }, demoman.blast!);
      combat.step(1 / 60);
    }

    const gap = combat.walls.tiles.find((tile) => tile.fallen)!;
    expect(gap.rubble).toBe(false);

    const through = throwAt(combat, thrower, 400);

    expect(through.farthest).toBeGreaterThan(100);
  });

  it('fly over the rubble of a fallen piece of a building, as over a crate', () => {
    const { combat } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: 30, halfHeight: 36, material: 'brick' }] });
    const thrower = spawn(combat, 'demoman', { x: -250, y: 0, rotation: 0 });
    combat.step(1 / 60);

    while (combat.walls.damage.collapsed === 0) {
      combat.blast({ x: -32, y: 0 }, demoman.blast!);
      combat.step(1 / 60);
    }

    // Rapier answers ray queries from the state of the last step.
    combat.step(1 / 60);

    expect(combat.walls.tiles[0].rubble).toBe(true);
    // Rubble stops most shots from afar.
    expect([-20, -10, 0, 10, 20].filter((y) => !combat.lineOfSight({ x: -250, y }, { x: 250, y })).length).toBeGreaterThanOrEqual(3);

    const over = throwAt(combat, thrower, 450);

    expect(over.farthest).toBeGreaterThan(120);
  });
});

describe("a Sniper's rail", () => {
  const full = TANK_CLASSES.sniper.weapon.kind === 'charge' ? TANK_CLASSES.sniper.weapon.full : undefined!;

  it('bores through a wooden fence into the tank behind it at full charge', () => {
    const { combat, hits } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: 7, halfHeight: 150, material: 'wood' }] });
    const sniper = spawn(combat, 'sniper', { x: -250, y: 0, rotation: 0 });
    const target = spawn(combat, 'soldier', { x: 120, y: 0, rotation: Math.PI });
    combat.step(1 / 60);
    fireAt(combat, sniper, { x: 120, y: 0 }, { shell: full });

    expect(hits.some((hit) => hit.target === target)).toBe(true);
    expect(combat.walls.damage.hits).toBeGreaterThan(0);
  });

  it.each([
    ['brick', 12, 'a full', 1],
    ['wood', 45, 'a full', 1],
    ['wood', 7, 'no', 0]
  ] as const)('stops in %s %i px thick at %s charge and only chips it', (material, halfWidth, _, charge) => {
    const { combat, hits } = createBattle({ walls: [{ x: 0, y: 0, halfWidth, halfHeight: 150, material }] });
    const sniper = spawn(combat, 'sniper', { x: -250, y: 0, rotation: 0 });
    const target = spawn(combat, 'soldier', { x: 120, y: 0, rotation: Math.PI });
    combat.step(1 / 60);
    fireAt(combat, sniper, { x: 120, y: 0 }, { shell: chargedShell(TANK_CLASSES.sniper.shell, full, charge) });

    expect(hits.some((hit) => hit.target === target)).toBe(false);
    expect(combat.armorLeft(target)).toBe(1);
    expect(combat.walls.damage.hits).toBe(1);
  });
});

/** The tile whose own rectangle holds a world point. */
function tileAt(combat: ReturnType<typeof createCombat>, point: Point) {
  return combat.walls.tiles.find((tile) => {
    const x = point.x - tile.wall.x;
    const y = point.y - tile.wall.y;
    return x > tile.rect.minX && x < tile.rect.maxX && y > tile.rect.minY && y < tile.rect.maxY;
  })!;
}

/** The armor channel of a tile's field at a world point, from the nearest cell. */
function armorAt(tile: ReturnType<typeof tileAt>, point: Point) {
  const { field } = tile;
  const col = Math.round((point.x - tile.wall.x - field.originX) / field.cell);
  const row = Math.round((point.y - tile.wall.y - field.originY) / field.cell);
  return field.data[(row * field.cols + col) * 4];
}

/** Puts a tank of a class on the field, standing still. */
function spawn(combat: ReturnType<typeof createCombat>, id: TankClassId, placement: Point & { rotation: number }) {
  const tankClass = TANK_CLASSES[id];
  return combat.spawnTank(placement, {
    color: 0,
    team: id === 'soldier' && placement.rotation !== 0 ? 'blue' : 'red',
    pullSpeed: pullSpeedFor(tankClass.speed),
    hull: tankClass.hull,
    mass: tankClass.mass,
    look: tankClass.look
  });
}

/** Turns `shooter`'s gun onto `target`, fires a shot and lets it land over `steps` steps. */
function fireAt(combat: ReturnType<typeof createCombat>, shooter: Tank, target: Point, shot: { shell: ShellSpec }, steps = 30) {
  const at = shooter.hull.translation();
  shooter.turretAngle = Math.atan2(target.y - at.y, target.x - at.x);
  combat.fire(shooter, shot);

  for (let step = 0; step < steps; step++) {
    combat.drive(shooter, { x: 0, y: 0 });
    combat.step(1 / 60);
    combat.update(1 / 60);
  }
}

/** Lobs a grenade along the thrower's turret for `reach` px and follows it until it goes off. */
function throwAt(combat: ReturnType<typeof createCombat>, thrower: Tank, reach: number) {
  combat.fire(thrower, { shell: TANK_CLASSES.demoman.shell, reach });
  const id = combat.shells[combat.shells.length - 1].id;
  let farthest = -Infinity;
  let end = { x: 0, y: 0 };

  for (let step = 0; step < 200; step++) {
    const grenade = combat.shells.find((shell) => shell.id === id);

    if (!grenade) {
      break;
    }

    farthest = Math.max(farthest, grenade.x);
    end = { x: grenade.x, y: grenade.y };
    combat.step(1 / 60);
  }

  // Let the blast settle before the next throw.
  for (let step = 0; step < 10; step++) {
    combat.step(1 / 60);
  }

  return { farthest, end };
}

/** A battle on a real Rapier world, seeded, with a renderer that only hands out field slots, recording hits. */
function createBattle(layout: Partial<CombatLayout>) {
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
  } as unknown as ReturnType<typeof createRangeRenderer>;
  let state = 11;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const hits: { target: Tank; part: string }[] = [];
  const combat = createCombat(rapier, world, renderer, { halfWidth: 400, halfHeight: 300, ...layout }, {
    random,
    friendlyFire: false,
    onHit: (target, _shooter, part) => hits.push({ target, part })
  });

  return { combat, hits };
}
