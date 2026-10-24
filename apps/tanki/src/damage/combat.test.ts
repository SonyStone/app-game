import { beforeAll, describe, expect, it } from 'vitest';
import type { Rapier } from '../physics/Rapier2D';
import { createCombat } from './combat';
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

/** A battle on a real Rapier world with a renderer that only hands out field slots, recording hits. */
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
    addSmokeColumn() {},
    addLight() {},
    render() {}
  };
  const hits: { target: unknown; shooter: unknown }[] = [];
  const combat = createCombat(
    rapier,
    world,
    renderer as unknown as ReturnType<typeof createRangeRenderer>,
    { halfWidth: 400, halfHeight: 300, ...layout },
    { ...options, onHit: (target, shooter) => hits.push({ target, shooter }) }
  );

  return { combat, hits };
}
