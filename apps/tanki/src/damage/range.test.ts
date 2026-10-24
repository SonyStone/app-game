import { beforeAll, describe, expect, it } from 'vitest';
import type { Rapier } from '../physics/Rapier2D';
import { createDamageRange } from './range';
import { HULL_CORE } from './shapes';
import type { createRangeRenderer } from './renderer';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

describe('damage range', () => {
  it('dents the player when it drives into a wall at full speed', () => {
    const { range } = createRange();
    const before = solidCells(range.armorOf(range.player)!.data);

    for (let step = 0; step < 180; step++) {
      range.step(1 / 60, { x: 1, y: 0 });
    }

    expect(solidCells(range.armorOf(range.player)!.data)).toBeLessThan(before);
  });

  it('destroys a target whose core it keeps shooting and leaves its wreck burning', () => {
    const { range, smoke } = createRange();
    const player = range.player;
    let destroyed = false;

    const target = range.tanks.find((tank) => {
      const position = tank.hull.translation();
      return Math.hypot(position.x - 60, position.y + 150) < 1;
    })!;

    let wreck = target.hull.translation();

    for (let shot = 0; shot < 60 && !destroyed; shot++) {
      wreck = target.hull.translation();
      const center = player.hull.translation();
      const core = toWorld(target.hull, HULL_CORE);
      player.turretAngle = Math.atan2(core.y - center.y, core.x - center.x);
      range.fire(player);

      for (let step = 0; step < 6; step++) {
        range.step(1 / 60, { x: 0, y: 0 });
      }

      destroyed = !range.tanks.includes(target);
    }

    expect(destroyed).toBe(true);

    smoke.length = 0;
    range.update(1);
    range.draw(wreck);

    // Seen from right above the wreck, its youngest smoke rises from the flames.
    expect(smoke.some((ball) => Math.hypot(ball.x - wreck.x, ball.y - wreck.y) < 12)).toBe(true);
  });
});

/** Builds a range on a real Rapier world with a renderer that only records where balls of smoke are seen. */
function createRange() {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const slots: number[] = Array.from({ length: 64 }, (_, index) => 63 - index);
  const smoke: { x: number; y: number }[] = [];
  const renderer = {
    allocateField: () => slots.pop(),
    releaseField: (slot: number) => slots.push(slot),
    uploadField() {},
    beginBodies() {},
    addBody() {},
    spawn() {},
    addSmokeBall(ball: { seen: { x: number; y: number } }) {
      smoke.push(ball.seen);
    },
    addLight() {},
    render() {}
  };
  const range = createDamageRange(rapier, world, renderer as unknown as ReturnType<typeof createRangeRenderer>);

  return { range, smoke };
}

/** Counts armor cells in a field's raw data. */
function solidCells(data: Float32Array) {
  let count = 0;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index] < 0) {
      count++;
    }
  }

  return count;
}

function toWorld(body: { translation(): { x: number; y: number }; rotation(): number }, local: { x: number; y: number }) {
  const center = body.translation();
  const cos = Math.cos(body.rotation());
  const sin = Math.sin(body.rotation());
  return { x: center.x + local.x * cos - local.y * sin, y: center.y + local.x * sin + local.y * cos };
}
