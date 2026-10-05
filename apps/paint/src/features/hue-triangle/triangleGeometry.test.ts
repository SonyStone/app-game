import { expect, it } from 'vitest';
import { hueAt, pointFromSv, svFromPoint, triangleCorners, triangleWeights } from './triangleGeometry';

it('turns the triangle with the hue and maps its corners to the hue, white and black', () => {
  const corners = triangleCorners(90, 100);
  expect(corners.hue.x).toBeCloseTo(100);
  expect(corners.hue.y).toBeCloseTo(0);
  expect(hueAt(corners.hue)).toBeCloseTo(90);
  expect(hueAt({ x: 0, y: -1 })).toBeCloseTo(0);
  expect(hueAt({ x: -1, y: 0 })).toBeCloseTo(270);

  expect(svFromPoint(corners.hue, 90, 100)).toEqual({ s: 1, v: 1 });
  expect(svFromPoint(corners.white, 90, 100)).toMatchObject({ s: 0, v: 1 });
  expect(svFromPoint(corners.black, 90, 100).v).toBeCloseTo(0);
});

it('round-trips saturation and value, and clamps points outside to the nearest edge', () => {
  for (const [s, v] of [
    [0.3, 0.7],
    [1, 0.5],
    [0.8, 0.2]
  ] as const) {
    const point = pointFromSv(s, v, 200, 80);
    const back = svFromPoint(point, 200, 80);
    expect(back.s).toBeCloseTo(s);
    expect(back.v).toBeCloseTo(v);
    expect(triangleWeights(point, 200, 80).every((weight) => weight >= -1e-9)).toBe(true);
  }

  // Far beyond the hue corner: the hue at full value.
  const outside = svFromPoint({ x: 0, y: -500 }, 0, 80);
  expect(outside.s).toBeCloseTo(1);
  expect(outside.v).toBeCloseTo(1);
});
