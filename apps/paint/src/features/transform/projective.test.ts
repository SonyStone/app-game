import { expect, it } from 'vitest';
import { boxAffine } from './affine';
import { applyProjective, fromAffine, invertProjective, isConvex, multiplyProjective, rectToQuad } from './projective';

const bounds = { left: 10, top: 20, right: 110, bottom: 70 };

it('maps the corners of the bounds onto a quad, and its center in perspective', () => {
  const quad = [
    { x: 0, y: 0 },
    { x: 200, y: 20 },
    { x: 180, y: 120 },
    { x: 30, y: 100 }
  ] as const;
  const matrix = rectToQuad(bounds, quad);
  const corners = [
    { x: 10, y: 20 },
    { x: 110, y: 20 },
    { x: 110, y: 70 },
    { x: 10, y: 70 }
  ].map((corner) => applyProjective(matrix, corner));
  corners.forEach((corner, index) => {
    expect(corner.x).toBeCloseTo(quad[index]!.x);
    expect(corner.y).toBeCloseTo(quad[index]!.y);
  });

  // The center goes to where the quad's diagonals cross, not to the average of its corners.
  const center = applyProjective(matrix, { x: 60, y: 45 });
  const average = { x: (0 + 200 + 180 + 30) / 4, y: (0 + 20 + 120 + 100) / 4 };
  expect(Math.hypot(center.x - average.x, center.y - average.y)).toBeGreaterThan(1);

  const back = multiplyProjective(invertProjective(matrix)!, matrix);
  back.forEach((value, index) => expect(value / back[8]!).toBeCloseTo([1, 0, 0, 0, 1, 0, 0, 0, 1][index]!));
});

it('agrees with affine transforms and their parallelograms', () => {
  const affine = boxAffine({ pivot: { x: 60, y: 45 }, scale: { x: 2, y: -1 }, angle: 0.4, offset: { x: 5, y: 7 } });
  const quad = [
    { x: 10, y: 20 },
    { x: 110, y: 20 },
    { x: 110, y: 70 },
    { x: 10, y: 70 }
  ].map((corner) => applyProjective(fromAffine(affine), corner)) as [any, any, any, any];
  const matrix = rectToQuad(bounds, quad);
  const point = applyProjective(matrix, { x: 33, y: 41 });
  const expected = applyProjective(fromAffine(affine), { x: 33, y: 41 });
  expect(point.x).toBeCloseTo(expected.x);
  expect(point.y).toBeCloseTo(expected.y);
  expect(invertProjective([1, 2, 3, 2, 4, 6, 0, 0, 0])).toBeUndefined();
});

it('accepts convex quads only', () => {
  expect(
    isConvex([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 }
    ])
  ).toBe(true);
  // A corner pulled inside folds the quad.
  expect(
    isConvex([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 3, y: 3 },
      { x: 0, y: 10 }
    ])
  ).toBe(false);
  // Crossing edges, like a bow tie.
  expect(
    isConvex([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 }
    ])
  ).toBe(false);
});
