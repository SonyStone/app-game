import { describe, expect, it } from 'vitest';
import { atan, atan2, cos, exp, hypot, log, sin } from './math';

describe('deterministic math', () => {
  const random = park(12345);
  const cases: [string, (a: number, b: number) => number, (a: number, b: number) => number, () => [number, number]][] = [
    ['sin', sin, Math.sin, () => [(random() * 2 - 1) * 40, 0]],
    ['cos', cos, Math.cos, () => [(random() * 2 - 1) * 40, 0]],
    ['atan', atan, Math.atan, () => [(random() * 2 - 1) * 10 ** (random() * 6 - 3), 0]],
    ['atan2', atan2, Math.atan2, () => [(random() * 2 - 1) * 900, (random() * 2 - 1) * 900]],
    ['exp', exp, Math.exp, () => [(random() * 2 - 1) * 30, 0]],
    ['log', log, Math.log, () => [random() * 10 ** (random() * 8 - 4), 0]],
    ['hypot', hypot, Math.hypot, () => [(random() * 2 - 1) * 2000, (random() * 2 - 1) * 2000]]
  ];

  for (const [name, own, engine, draw] of cases) {
    it(`${name} is within one unit in the last place of the engine's`, () => {
      for (let index = 0; index < 100_000; index++) {
        const [a, b] = draw();
        const ours = own(a, b);
        const theirs = engine(a, b);
        expect(Math.abs(ours - theirs), `${name}(${a}, ${b})`).toBeLessThanOrEqual(2 * ulp(theirs));
      }
    });
  }

  it('meets the edge cases as Math does', () => {
    const same = (ours: number, theirs: number) => Object.is(ours, theirs) || Math.abs(ours - theirs) <= 2 * ulp(theirs);

    for (const value of [0, -0, 1, -1, Math.PI, -Math.PI / 2, 1e-30, 1e6, 700, -740, 800, -800, Infinity, -Infinity, NaN]) {
      expect(same(sin(value), Math.sin(value)), `sin(${value})`).toBe(true);
      expect(same(cos(value), Math.cos(value)), `cos(${value})`).toBe(true);
      expect(same(atan(value), Math.atan(value)), `atan(${value})`).toBe(true);
      expect(same(exp(value), Math.exp(value)), `exp(${value})`).toBe(true);
      expect(same(log(value), Math.log(value)), `log(${value})`).toBe(true);

      for (const other of [0, -0, 1, -1, 3, -3, Infinity, -Infinity, NaN]) {
        expect(same(atan2(value, other), Math.atan2(value, other)), `atan2(${value}, ${other})`).toBe(true);
      }
    }

    expect(log(5e-324)).toBe(Math.log(5e-324));
  });
});

/** The gap between `x` and the next representable number away from zero. */
function ulp(x: number) {
  if (x === 0 || !Number.isFinite(x)) {
    return Number.MIN_VALUE;
  }

  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  view.setBigUint64(0, view.getBigUint64(0) + 1n);
  return view.getFloat64(0) - Math.abs(x);
}

function park(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}
