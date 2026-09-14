import { expect, it } from 'vitest';
import { dabTiles, type Dab } from '../brush';
import { planSmudgeDeposits } from './smudgeDepositBatch';
import { directStampBounds } from './stampBounds';

it('covers every eligible tile once while bounding scratch dimensions and residency', () => {
  const dab: Dab = {
    x: -713.25,
    y: -129.75,
    radius: Math.hypot(2300, 900),
    flow: 1,
    abr: { data: new Float32Array([-713.25, -129.75, 2300, 900, 0.8, 0.6, 1, 1]), secondary: false }
  };
  const keys = dabTiles(dab);
  const eligible = keys.filter((key) => {
    const [x, y] = key.split(',').map(Number) as [number, number];
    return !!directStampBounds(dab, x, y);
  });
  for (const capacity of [1, 7, 17, 32]) {
    const chunks = planSmudgeDeposits(dab, keys, capacity);
    const planned = chunks.flatMap((chunk) => chunk.tiles.map((tile) => tile.key));
    expect(planned.sort()).toEqual(eligible.slice().sort());
    expect(new Set(planned).size).toBe(planned.length);
    for (const chunk of chunks) {
      expect(chunk.tiles.length).toBeLessThanOrEqual(capacity);
      expect(chunk.width).toBeLessThanOrEqual(2048);
      expect(chunk.height).toBeLessThanOrEqual(2048);
      for (const tile of chunk.tiles) {
        expect((tile.x - chunk.x) * 256 + tile.bounds.x).toBeGreaterThanOrEqual(0);
        expect((tile.y - chunk.y) * 256 + tile.bounds.y).toBeGreaterThanOrEqual(0);
        expect((tile.x - chunk.x) * 256 + tile.bounds.x + tile.bounds.width).toBeLessThanOrEqual(chunk.width);
        expect((tile.y - chunk.y) * 256 + tile.bounds.y + tile.bounds.height).toBeLessThanOrEqual(chunk.height);
      }
    }
  }
});

it('omits empty damage and rejects capacities that cannot make progress', () => {
  const dab = { x: 0, y: 0, radius: 10, flow: 1 };
  expect(planSmudgeDeposits(dab, [], 8)).toEqual([]);
  expect(planSmudgeDeposits(dab, ['10,10'], 8)).toEqual([]);
  for (const capacity of [0, -1, 0.5, NaN, Infinity])
    expect(() => planSmudgeDeposits(dab, [], capacity)).toThrow(RangeError);
});
