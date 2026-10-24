import { describe, expect, it } from 'vitest';
import { createNavGrid } from '../navigation';
import { findBankShot } from './bank';

describe('a bank shot', () => {
  // A wall between the thrower and the target, and a long wall to the north to bank off.
  const layout = {
    halfWidth: 400,
    halfHeight: 300,
    walls: [
      { x: 0, y: 40, halfWidth: 12, halfHeight: 140 },
      { x: 0, y: -200, halfWidth: 300, halfHeight: 12 }
    ]
  };
  const grid = createNavGrid(layout);

  it('throws at the far wall so that the bounce comes down on a target behind cover', () => {
    const from = { x: -200, y: 40 };
    const to = { x: 200, y: 40 };
    const bank = findBankShot(grid, layout.walls, from, to, 800, 0.7);

    expect(bank).toBeDefined();
    // It meets the north wall's face halfway, where the angles in and out are equal.
    expect(bank!.at.y).toBeCloseTo(-188, 0);
    expect(bank!.at.x).toBeCloseTo(0, 0);
    expect(Math.sin(bank!.angle)).toBeLessThan(0);
    // The leg after the bounce counts more, since the grenade comes off the wall slower.
    expect(bank!.reach).toBeGreaterThan(Math.hypot(200, 228) * 2);
  });

  it('finds none beyond its reach', () => {
    expect(findBankShot(grid, layout.walls, { x: -200, y: 40 }, { x: 200, y: 40 }, 400, 0.7)).toBeUndefined();
  });
});
