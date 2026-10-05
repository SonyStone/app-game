import { expect, it } from 'vitest';
import { mixerDose } from './mixer';

it('doses a dab at adaptive spacing like the dabs it replaces', () => {
  // Ten dabs a fiftieth of a diameter apart, against one dab standing in for them a fifth of a diameter on.
  let remaining = 1;
  for (let dab = 0; dab < 10; dab++) {
    remaining = mixerDose(remaining, 0.6, 0.02).remaining;
  }

  const wide = mixerDose(1, 0.6, 0.2, { ratio: 10, step: 0.2, travelled: 0.2 });
  expect(wide.remaining).toBeCloseTo(remaining, 10);
  expect(wide.exchange).toBeCloseTo(1 - 0.98 ** 10, 10);
  expect(wide.available).toBe(1);
});

it('shares travel between replaced dabs but counts scatter whole', () => {
  const detailed = mixerDose(1, 1, 0.5);
  // Scatter moves the dab half a diameter whatever the spacing: every replaced dab would have moved that far.
  const scattered = mixerDose(1, 1, Math.hypot(0.5, 0.1), { ratio: 5, step: 0.1, travelled: 0.1 });
  expect(1 - scattered.remaining).toBeCloseTo(5 * (1 - mixerDose(1, 1, Math.hypot(0.5, 0.02)).remaining), 10);
  expect(1 - scattered.remaining).toBeGreaterThan(4.9 * (1 - detailed.remaining));
  // A dab the sampler placed short of its step, after a wide one, did not scatter.
  const short = mixerDose(1, 1, 0.065, { ratio: 1, step: 0.006, travelled: 0.11 });
  expect(1 - short.remaining).toBeCloseTo(0.065 * 0.05, 10);
});

it('keeps its dose without adaptive spacing', () => {
  expect(mixerDose(0.5, 0.8, 0.3)).toEqual({ exchange: 0.3, available: 1, remaining: 0.5 - 0.8 * 0.3 * 0.05 });
  expect(mixerDose(0.001, 1, 2).available).toBeCloseTo(0.02, 10);
});
