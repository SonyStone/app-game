import { expect, it } from 'vitest';
import { createStrokeSampler, defaultBrush, type Sample } from './brush';

it.each([32, 128, 512])('keeps low-pressure stamps overlapping for a %i px stylus brush', (size) => {
  const brush = { ...defaultBrush(), size };
  const points = createStrokeSampler(brush).add([
    { x: 0, y: 0, pressure: 0.04, time: 0 },
    { x: 100, y: 0, pressure: 0.04, time: 100 }
  ]);
  for (let i = 1; i < points.length; i++)
    expect(points[i]!.x - points[i - 1]!.x).toBeCloseTo(points[i]!.radius * 2 * brush.spacing, 8);
});

it.each([
  [0, 1],
  [1, 0],
  [0.01, 0.1],
  [0.8, 0.02]
])('preserves variable-pressure spacing when a straight ramp %f → %f is subdivided', (start, end) => {
  const point = (t: number): Sample => ({ x: 100 * t, y: 0, pressure: start + (end - start) * t, time: t });
  const whole = createStrokeSampler(defaultBrush()).add([point(0), point(1)]);
  const sampler = createStrokeSampler(defaultBrush());
  const split = Array.from({ length: 101 }, (_, i) => sampler.add([point(i / 100)])).flat();
  expect(split.length).toBe(whole.length);
  split.forEach((stamp, i) => {
    expect(stamp.x).toBeCloseTo(whole[i]!.x, 8);
    expect(stamp.radius).toBeCloseTo(whole[i]!.radius, 8);
  });
});

it('keeps tiny pressure tips continuous and does not repeat stationary stamps', () => {
  const sampler = createStrokeSampler({ ...defaultBrush(), size: 1 });
  const point = { x: 0, y: 0, pressure: 0, time: 0 };
  expect(sampler.add([point, { ...point, pressure: 1 }])).toHaveLength(1);
  const points = sampler.add([{ ...point, x: 2 }]);
  expect(points.length).toBeGreaterThan(10);
  expect(points.every((p, i) => i === 0 || p.x - points[i - 1]!.x < p.radius)).toBe(true);
});

it('leaves mouse and size-pressure-disabled spacing unchanged', () => {
  const brush = { ...defaultBrush(), pressureSize: false, pressureFlow: true };
  const points = createStrokeSampler(brush).add([
    { x: 0, y: 0, pressure: 0, time: 0 },
    { x: 100, y: 0, pressure: 1, time: 1 }
  ]);
  expect(points[1]!.x).toBe(brush.size * brush.spacing);
  expect(points.at(-1)!.flow).toBeGreaterThan(points[1]!.flow);
});
