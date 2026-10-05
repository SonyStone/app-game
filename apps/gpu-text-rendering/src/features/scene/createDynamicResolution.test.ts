import { expect, it } from 'vitest';
import { createDynamicResolution } from './createDynamicResolution';

it('steps down after consecutive slow frames and back up once the larger scale would fit', () => {
  const resolution = createDynamicResolution({ budgetMs: 16, scales: [1, 0.5] });

  resolution.observe({ ms: 30 });
  expect(resolution.scale).toBe(1);
  resolution.observe({ ms: 30 });
  expect(resolution.scale).toBe(0.5);

  // At half scale, 5 ms predicts 20 ms at full scale: over budget, so no step up.
  for (let i = 0; i < 40; i++) {
    resolution.observe({ ms: 5 });
  }
  expect(resolution.scale).toBe(0.5);

  for (let i = 0; i < 30; i++) {
    resolution.observe({ ms: 3 });
  }
  expect(resolution.scale).toBe(1);
});

it('jumps straight to the largest scale predicted to fit', () => {
  const resolution = createDynamicResolution({ budgetMs: 16, scales: [1, 0.85, 0.7, 0.55] });

  // 30 ms at full scale predicts 21.7, 14.7 and 9.1 ms: 0.7 is the largest that fits.
  resolution.observe({ ms: 30 });
  resolution.observe({ ms: 32 });
  expect(resolution.scale).toBe(0.7);

  // Far too slow for any scale: the smallest.
  resolution.observe({ ms: 200 });
  resolution.observe({ ms: 200 });
  expect(resolution.scale).toBe(0.55);
  expect(resolution.strained).toBe(false);

  // Still slow at the smallest scale: strained until a frame fits again.
  resolution.observe({ ms: 40 });
  resolution.observe({ ms: 40 });
  expect(resolution.strained).toBe(true);
  resolution.observe({ ms: 8 });
  expect(resolution.strained).toBe(false);
});

it('ignores isolated slow frames', () => {
  const resolution = createDynamicResolution({ budgetMs: 16 });

  for (let i = 0; i < 10; i++) {
    resolution.observe({ ms: i % 3 === 0 ? 40 : 8 });
  }

  expect(resolution.scale).toBe(1);
});

/** One gesture after idle on a GPU that runs its first four frames `slowdown` times slower. */
function gesture(resolution: ReturnType<typeof createDynamicResolution>, steadyMs: number, slowdown = 3) {
  const drawn: number[] = [];

  for (let sequence = 0; sequence < 40; sequence++) {
    const scale = resolution.scaleFor(sequence);
    drawn.push(scale);
    resolution.observe({ ms: steadyMs * scale * scale * (sequence < 4 ? slowdown : 1), scale, sequence });
  }

  return drawn;
}

it('keeps the steady scale when only the first frames after idle are slow', () => {
  const resolution = createDynamicResolution({ budgetMs: 16 });

  gesture(resolution, 10);
  gesture(resolution, 10);

  expect(resolution.scale).toBe(1);
  expect(resolution.strained).toBe(false);
});

it('draws the first frames after idle at a smaller scale once they are known to be slow', () => {
  const resolution = createDynamicResolution({ budgetMs: 16 });

  // Nothing is known during the first gesture.
  expect(gesture(resolution, 10).every((scale) => scale === 1)).toBe(true);

  const scales = gesture(resolution, 10);

  // 30 ms at full scale: the slow frames shrink to fit 85% of the budget, the others stay full.
  expect(scales[0]).toBeCloseTo(Math.sqrt((16 * 0.85) / 30), 5);
  expect(scales.slice(0, 4).every((scale) => scale === scales[0])).toBe(true);
  expect(scales.slice(4).every((scale) => scale === 1)).toBe(true);
});

it('leaves the first frames after idle at the steady scale when they fit anyway', () => {
  const resolution = createDynamicResolution({ budgetMs: 16 });

  gesture(resolution, 3);

  expect(gesture(resolution, 3).every((scale) => scale === 1)).toBe(true);
});

it('reserves the fixed cost when scaling the first frames after idle, never below the smallest scale', () => {
  const resolution = createDynamicResolution({ budgetMs: 16, scales: [1, 0.5] });
  const run = (fixedMs: number) => {
    for (let sequence = 0; sequence < 20; sequence++) {
      const scale = resolution.scaleFor(sequence);
      const slowdown = sequence < 4 ? 3 : 1;
      resolution.observe({
        ms: 10 * scale * scale * slowdown + (scale < 1 ? fixedMs : 0),
        fixedMs: scale < 1 ? fixedMs : undefined,
        scale,
        sequence
      });
    }
  };

  run(2);
  run(2);
  // The second run's scaled frames reported 2 ms of fixed cost: (13.6 - 2) of the budget remain for scaled work.
  expect(resolution.scaleFor(0)).toBeCloseTo(Math.sqrt((16 * 0.85 - 2) / 30), 5);

  const heavy = createDynamicResolution({ budgetMs: 16, scales: [1, 0.5] });
  // 15 ms steady, four times slower after idle: 60 ms fits no scale, so the smallest.
  gesture(heavy, 15, 4);
  expect(heavy.scaleFor(0)).toBe(0.5);
});

it('steps up from a lightly loaded GPU whose lowered clock inflates its frames', () => {
  const resolution = createDynamicResolution({ budgetMs: 16, scales: [1, 0.5] });

  resolution.observe({ ms: 40 });
  resolution.observe({ ms: 40 });
  expect(resolution.scale).toBe(0.5);

  // The stretch over the canvas took 1 ms under load. At half scale the GPU halves its clock: the frame's 2.5 ms of
  // scaled work reads 5 ms, predicting 20 ms at full scale, but the 2 ms stretch reveals the clock.
  resolution.observe({ ms: 3.5, fixedMs: 1, scale: 0.5 });
  for (let i = 0; i < 30; i++) {
    resolution.observe({ ms: 7, fixedMs: 2, scale: 0.5 });
  }

  expect(resolution.scale).toBe(1);
});
