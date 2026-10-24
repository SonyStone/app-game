import { beforeAll, describe, expect, it } from 'vitest';
import { pullSpeedFor } from '../arena/bodies';
import { createCombat } from '../damage/combat';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { TANK_CLASSES } from './classes/classes';
import { createKits } from './kits';
import { TANK_CLASS_IDS, type TankClassId } from './tanks';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

describe('repair kits', () => {
  it('mend every class by the same share of its damage, so a Heavy gets back more armor than a Scout', () => {
    const mended = new Map<TankClassId, number>();

    for (const id of TANK_CLASS_IDS) {
      const { combat, renderer } = createBattle();
      const tankClass = TANK_CLASSES[id];
      const { hull } = tankClass;
      const tank = combat.spawnTank(
        { x: 0, y: 0, rotation: 0 },
        { color: 0, pullSpeed: pullSpeedFor(tankClass.speed), hull, mass: tankClass.mass, look: tankClass.look }
      );

      // The same holes into the rear of every hull.
      for (let hole = 0; hole < 4; hole++) {
        combat.blast({ x: -hull.halfLength - 6, y: (hole - 1.5) * 5 }, { radius: 20, hole: 4, depth: 2, knockback: 0 });
      }

      combat.step(1 / 60);
      tank.hull.setTranslation({ x: 0, y: 0 }, true);
      const before = combat.armorLeft(tank);
      createKits(renderer, [{ x: 0, y: 0, size: 'small' }], combat).step(1, [tank]);
      combat.step(1 / 60);
      const after = combat.armorLeft(tank);

      expect(before).toBeLessThan(0.97);
      // A small kit mends about 30% of the damage, whatever the class: more of shallow chips, which fill first.
      expect((after - before) / (1 - before)).toBeGreaterThan(0.25);
      expect((after - before) / (1 - before)).toBeLessThan(0.5);
      mended.set(id, (after - before) * hull.halfLength * hull.halfWidth);

      createKits(renderer, [{ x: 0, y: 0, size: 'large' }], combat).step(1, [tank]);
      combat.step(1 / 60);

      // A large kit mends about half of what is left: only the base makes a tank whole.
      expect((combat.armorLeft(tank) - after) / (1 - after)).toBeGreaterThan(0.4);
      expect(combat.armorLeft(tank)).toBeLessThan(0.999);
    }

    expect(mended.get('heavy')!).toBeGreaterThan(mended.get('scout')!);
  });

  it("are taken by the edge of any class's hull and mend the side that touched them more", () => {
    for (const id of TANK_CLASS_IDS) {
      const { combat, renderer } = createBattle();
      const tankClass = TANK_CLASSES[id];
      const { hull } = tankClass;
      const tank = combat.spawnTank(
        { x: 0, y: 0, rotation: 0 },
        { color: 0, pullSpeed: pullSpeedFor(tankClass.speed), hull, mass: tankClass.mass, look: tankClass.look }
      );

      // The same holes into the front and the rear.
      for (const side of [-1, 1]) {
        for (let hole = 0; hole < 3; hole++) {
          combat.blast({ x: side * (hull.halfLength + 6), y: (hole - 1) * 5 }, { radius: 20, hole: 4, depth: 2, knockback: 0 });
        }
      }

      combat.step(1 / 60);
      tank.hull.setTranslation({ x: 0, y: 0 }, true);
      tank.hull.setRotation(0, true);
      const before = halves(combat.armorOf(tank)!);
      // A kit just behind the rear, within reach of the hull's edge but far from its center.
      const kits = createKits(renderer, [{ x: -hull.halfLength - 6, y: 0, size: 'small' }], combat);

      expect(kits.step(1, [tank])).toEqual([tank]);

      combat.step(1 / 60);
      const after = halves(combat.armorOf(tank)!);

      expect(after.rear - before.rear).toBeGreaterThan((after.front - before.front) * 1.5);
    }
  });
});

/** Cells of armor in the rear half of a hull's field and in its front half. */
function halves(field: { data: Float32Array; cols: number; originX: number; cell: number }) {
  const counts = { rear: 0, front: 0 };

  for (let cell = 0; cell * 4 < field.data.length; cell++) {
    if (field.data[cell * 4] < 0) {
      counts[field.originX + (cell % field.cols) * field.cell < 0 ? 'rear' : 'front']++;
    }
  }

  return counts;
}

/** A battle on a real Rapier world, seeded, with a renderer that only hands out field slots. */
function createBattle() {
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
  } as unknown as ReturnType<typeof createRangeRenderer>;
  let state = 11;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const combat = createCombat(rapier, world, renderer, { halfWidth: 400, halfHeight: 300 }, { random });

  return { combat, renderer };
}
