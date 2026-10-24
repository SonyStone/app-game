import { beforeAll, describe, expect, it } from 'vitest';
import type { Rapier } from '../physics/Rapier2D';
import { createCombat, type ShellSpec } from './combat';
import type { createRangeRenderer } from './renderer';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

describe('battle core', () => {
  it('lets shots pass through teammates without friendly fire and credits the shooter', () => {
    const { combat, hits } = createBattle({ friendlyFire: false });
    const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0xff0000, team: 'red' });
    const teammate = combat.spawnTank({ x: -100, y: 0, rotation: 0 }, { color: 0xff0000, team: 'red' });
    const enemy = combat.spawnTank({ x: 50, y: 0, rotation: 0 }, { color: 0x0000ff, team: 'blue' });

    combat.fire(shooter);

    expect(combat.armorLeft(teammate)).toBe(1);
    expect(hits).toEqual([{ target: enemy, shooter }]);
    expect(combat.teamOf(enemy)).toBe('blue');
  });

  it('sees past tanks but not through walls or crates', () => {
    const { combat } = createBattle({}, { walls: [{ x: 0, y: -150, halfWidth: 12, halfHeight: 60 }], crates: [{ x: 0, y: 150, rotation: 0 }] });
    combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0 });
    // Rapier answers ray queries from the state of the last step.
    combat.step(1 / 60);

    expect(combat.lineOfSight({ x: -200, y: 0 }, { x: 200, y: 0 })).toBe(true);
    expect(combat.lineOfSight({ x: -200, y: -150 }, { x: 200, y: -150 })).toBe(false);
    expect(combat.lineOfSight({ x: -200, y: 150 }, { x: 200, y: 150 })).toBe(false);
  });

  it('mends chipped armor back toward new', () => {
    const { combat } = createBattle();
    const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0 });

    for (let shot = 0; shot < 10; shot++) {
      shooter.turretAngle = (shot - 5) * 0.01;
      combat.fire(shooter);
      combat.step(1 / 60);
    }

    const chipped = combat.armorLeft(target);
    combat.repair(target, 1);
    combat.step(1 / 60);

    expect(chipped).toBeLessThan(0.97);
    expect(combat.armorLeft(target)).toBeCloseTo(1, 2);
    expect(combat.isCoreOpen(target)).toBe(false);
  });
});

describe('shells', () => {
  const shell: ShellSpec = { speed: 900, range: 700, hole: 4.5, depth: 3, knockback: 700 };

  it('fly for a while before they hit', () => {
    const { combat, hits } = createBattle({ shell });
    const shooter = combat.spawnTank({ x: -300, y: 0, rotation: 0 }, { color: 0 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0 });

    combat.fire(shooter);
    run(combat, 0.15);

    expect(hits).toHaveLength(0);
    expect(combat.shells).toHaveLength(1);

    run(combat, 0.2);

    expect(hits).toEqual([{ target, shooter }]);
    expect(combat.shells).toHaveLength(0);
    expect(combat.armorLeft(target)).toBeLessThan(0.97);
  });

  it('fall once they have flown their range', () => {
    const { combat, shots } = createBattle({ shell }, { halfWidth: 1500 });
    const shooter = combat.spawnTank({ x: -1200, y: 0, rotation: 0 }, { color: 0 });

    combat.fire(shooter);
    run(combat, 0.7);

    expect(combat.shells).toHaveLength(1);

    run(combat, 0.2);

    expect(combat.shells).toHaveLength(0);
    expect(shots).toHaveLength(1);
    expect(pathLength(shots[0])).toBeCloseTo(shell.range, 0);
  });

  it('glance off armor and fly on with the range they have left', () => {
    const { combat, hits, shots } = createBattle({ shell }, { halfWidth: 1500 });
    const shooter = combat.spawnTank({ x: -300, y: -40, rotation: 0 }, { color: 0 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0 });
    shooter.turretAngle = Math.atan2(27.5, 300);

    combat.fire(shooter);
    run(combat, 1);

    expect(hits).toEqual([{ target, shooter }]);
    expect(shots[0]).toHaveLength(3);
    expect(pathLength(shots[0])).toBeLessThanOrEqual(shell.range + 1e-6);
    expect(combat.armorLeft(target)).toBeGreaterThan(0.99);
  });
});

/** Steps the battle for `seconds`. */
function run(combat: ReturnType<typeof createCombat>, seconds: number) {
  for (let time = 0; time < seconds - 1e-9; time += 1 / 60) {
    combat.step(1 / 60);
  }
}

function pathLength(path: readonly { x: number; y: number }[]) {
  return path.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - path[index].x, point.y - path[index].y), 0);
}

/** A battle on a real Rapier world with a renderer that only hands out field slots, recording hits and shot paths. */
function createBattle(options: Parameters<typeof createCombat>[4] = {}, layout: Partial<Parameters<typeof createCombat>[3]> = {}) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const slots = Array.from({ length: 64 }, (_, index) => 63 - index);
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
  const hits: { target: unknown; shooter: unknown }[] = [];
  const shots: (readonly { x: number; y: number }[])[] = [];
  const combat = createCombat(
    rapier,
    world,
    renderer as unknown as ReturnType<typeof createRangeRenderer>,
    { halfWidth: 400, halfHeight: 300, ...layout },
    {
      random: seeded(1),
      ...options,
      onHit: (target, shooter) => hits.push({ target, shooter }),
      onShot: (_shooter, path) => shots.push(path)
    }
  );

  return { combat, hits, shots };
}

/** A repeatable source of numbers in [0, 1), so rough craters and debris come out the same every run. */
function seeded(seed: number) {
  let state = seed;

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}
