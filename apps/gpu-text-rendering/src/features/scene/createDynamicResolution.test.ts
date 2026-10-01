import { expect, it } from 'vitest';
import { createDynamicResolution } from './createDynamicResolution';

it('steps down after consecutive slow frames and back up once the larger scale would fit', () => {
  const resolution = createDynamicResolution({ budgetMs: 16, scales: [1, 0.5] });

  resolution.observe(30);
  expect(resolution.scale).toBe(1);
  resolution.observe(30);
  expect(resolution.scale).toBe(0.5);

  // At half scale, 5 ms predicts 20 ms at full scale: over budget, so no step up.
  for (let i = 0; i < 40; i++) {
    resolution.observe(5);
  }
  expect(resolution.scale).toBe(0.5);

  for (let i = 0; i < 30; i++) {
    resolution.observe(3);
  }
  expect(resolution.scale).toBe(1);
});

it('jumps straight to the largest scale predicted to fit', () => {
  const resolution = createDynamicResolution({ budgetMs: 16, scales: [1, 0.85, 0.7, 0.55] });

  // 30 ms at full scale predicts 21.7, 14.7 and 9.1 ms: 0.7 is the largest that fits.
  resolution.observe(30);
  resolution.observe(32);
  expect(resolution.scale).toBe(0.7);

  // Far too slow for any scale: the smallest.
  resolution.observe(200);
  resolution.observe(200);
  expect(resolution.scale).toBe(0.55);
  expect(resolution.strained).toBe(false);

  // Still slow at the smallest scale: strained until a frame fits again.
  resolution.observe(40);
  resolution.observe(40);
  expect(resolution.strained).toBe(true);
  resolution.observe(8);
  expect(resolution.strained).toBe(false);
});

it('ignores isolated slow frames', () => {
  const resolution = createDynamicResolution({ budgetMs: 16 });

  for (let i = 0; i < 10; i++) {
    resolution.observe(i % 3 === 0 ? 40 : 8);
  }

  expect(resolution.scale).toBe(1);
});
