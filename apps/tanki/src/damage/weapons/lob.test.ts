import { describe, expect, it } from 'vitest';
import { isRolling, launchLob, lobCarry, reachFor, stepLob, type LobSpec } from './lob';

const SPEC: LobSpec = { fuse: 1.5, gravity: 1500, bounce: 0.45, rebound: 0.7, roll: 4, minReach: 70 };
const SPEED = 900;

describe('a lobbed shell', () => {
  it('comes down where it was thrown, flying higher the farther the throw', () => {
    for (const reach of [150, 300, 500]) {
      const state = launchLob(SPEC, SPEED, reach, 520);
      let time = 0;
      let top = 0;

      while (!stepLob(SPEC, state, 1 / 600)) {
        time += 1 / 600;
        top = Math.max(top, state.height);
      }

      expect(time * SPEED).toBeCloseTo(reach, -1);
      expect(top).toBeCloseTo((SPEC.gravity * (reach / SPEED) ** 2) / 8, 0);
    }
  });

  it('bounces lower each time it lands, then rolls', () => {
    const state = launchLob(SPEC, SPEED, 400, 520);
    const bounces: number[] = [];

    for (let step = 0; step < 120; step++) {
      const climb = state.climb;

      if (stepLob(SPEC, state, 1 / 60)) {
        bounces.push(-climb);
      }
    }

    expect(bounces.length).toBeGreaterThanOrEqual(2);
    expect(bounces[1]).toBeLessThan(bounces[0]);
    expect(isRolling(state)).toBe(true);
    expect(state.landed).toBe(true);
  });

  it('is thrown at least its shortest reach and at most its range', () => {
    expect(launchLob(SPEC, SPEED, 10, 520).climb).toBeCloseTo(launchLob(SPEC, SPEED, SPEC.minReach, 520).climb);
    expect(launchLob(SPEC, SPEED, 2000, 520).climb).toBeCloseTo(launchLob(SPEC, SPEED, 520, 520).climb);
  });

  it('carries past where it lands, and the throw for a distance is found back', () => {
    const carry = lobCarry(SPEC, SPEED, 300, 520);

    expect(carry).toBeGreaterThan(300);
    expect(lobCarry(SPEC, SPEED, reachFor(SPEC, SPEED, 400, 520), 520)).toBeCloseTo(400, -1);
  });
});
