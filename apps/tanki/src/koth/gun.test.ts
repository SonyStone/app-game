import { describe, expect, it } from 'vitest';
import { createGun } from './gun';

const SPEC = { interval: 0.8, clip: 4, firstReload: 0.92, reload: 0.8 };

describe('a gun with a clip', () => {
  it('fires the clip one interval apart and then stays empty', () => {
    const gun = createGun(SPEC);
    const shots: number[] = [];

    for (let time = 0; time < 4; time += 1 / 60) {
      if (gun.fire()) {
        shots.push(time);
      }

      gun.step(1 / 60);
    }

    expect(shots).toHaveLength(4);
    expect(shots[1] - shots[0]).toBeCloseTo(0.8, 1);
    expect(shots[3] - shots[0]).toBeCloseTo(2.4, 1);
    expect(gun.rounds).toBe(0);
  });

  it('loads one round at a time once it has been quiet for an interval, the first a little slower', () => {
    const gun = createGun(SPEC);

    for (let shot = 0; shot < 4; shot++) {
      gun.fire();
      advance(gun, 0.8);
    }

    advance(gun, 0.9);
    expect(gun.rounds).toBe(0);
    expect(gun.loading).toBeGreaterThan(0.9);

    advance(gun, 0.03);
    expect(gun.rounds).toBe(1);

    advance(gun, 0.8 * 3 + 0.03);
    expect(gun.rounds).toBe(4);
    expect(gun.loading).toBe(0);
  });

  it('breaks off the round being loaded when it fires', () => {
    const gun = createGun(SPEC);
    gun.fire();
    advance(gun, 0.8 + 0.5);
    gun.fire();

    expect(gun.rounds).toBe(2);
    expect(gun.loading).toBe(0);
  });
});

/** Steps the gun through `seconds` in physics steps. */
function advance(gun: ReturnType<typeof createGun>, seconds: number) {
  for (let time = 0; time < seconds - 1e-9; time += 1 / 60) {
    gun.step(Math.min(1 / 60, seconds - time));
  }
}
