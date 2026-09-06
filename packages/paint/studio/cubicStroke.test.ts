import { expect, it } from 'vitest';
import type { Sample } from './brush';
import { createCubicStroke } from './cubicStroke';

it('passes through interior controls and matches the recovered cubic at the segment midpoint', () => {
  const curve = createCubicStroke(4);
  const samples = [point(0, 0), point(10, 20), point(40, 10), point(60, 50)];
  curve.add(samples.slice(0, 3));
  const interior = curve.add(samples.slice(3));
  // C(0.5) = (-p0 + 9*p1 + 9*p2 - p3) / 16, independently of the Bezier implementation.
  const expected = { x: 24.375, y: 13.75 };
  expect(interior.some((sample) => Math.hypot(sample.x - expected.x, sample.y - expected.y) < 1e-10)).toBe(true);
  expect(interior.at(-1)).toEqual(samples[2]);
  expect(curve.finish().at(-1)).toEqual(samples[3]);
  expect(curve.finish()).toEqual([]);
});

it('subdivides pressure curvature on a straight line and clamps interpolated pressure', () => {
  const curve = createCubicStroke(32);
  const output = [...curve.add([point(0, 0, 0), point(10, 0, 1), point(20, 0, 1), point(30, 0, 0)]), ...curve.finish()];
  expect(output.some((sample) => sample.x > 0 && sample.x < 10)).toBe(true);
  expect(output.every((sample) => sample.pressure >= 0 && sample.pressure <= 1)).toBe(true);
});

it('keeps flattening consistent in screen coordinates at different zoom levels', () => {
  const render = (zoom: number) => {
    const curve = createCubicStroke(10 / zoom, zoom);
    return [...curve.add([point(0, 0), point(20 / zoom, 15 / zoom), point(40 / zoom, 0)]), ...curve.finish()].map(
      (sample) => ({ x: sample.x * zoom, y: sample.y * zoom })
    );
  };
  const near = render(1),
    far = render(0.05);
  expect(far).toHaveLength(near.length);
  far.forEach((sample, index) => {
    expect(sample.x).toBeCloseTo(near[index]!.x, 10);
    expect(sample.y).toBeCloseTo(near[index]!.y, 10);
  });
});

function point(x: number, y: number, pressure = 1): Sample {
  return { x, y, pressure, time: 0 };
}
