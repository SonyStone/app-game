import { expect, it } from 'vitest';
import { fromAffine } from './projective';
import { moveWarpPoint } from './transformDrag';
import { flipWarp, warpDocumentPoint, warpFromMatrix, warpOutline, warpPoint, warpTriangles } from './warp';

const bounds = { left: 10, top: 20, right: 70, bottom: 50 };
const box = { offset: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, angle: 0 };

it('starts from the box placement, which the patch reproduces exactly for affine transforms', () => {
  // Twice as wide, turned a quarter turn, moved.
  const warp = warpFromMatrix(bounds, fromAffine([0, 2, -1, 0, 300, 5]));
  for (const point of [
    { x: 10, y: 20 },
    { x: 33, y: 41 },
    { x: 70, y: 50 }
  ]) {
    const placed = warpDocumentPoint(bounds, warp, point);
    expect(placed.x).toBeCloseTo(-point.y + 300);
    expect(placed.y).toBeCloseTo(2 * point.x + 5);
  }
});

it('bends between its corners, flips within its grid and draws as a mesh', () => {
  const flat = warpFromMatrix(bounds, fromAffine([1, 0, 0, 1, 0, 0]));
  // Moving a corner takes its two edge neighbors along; an inner point moves alone.
  const corner = moveWarpPoint({ ...box, warp: flat }, 0, { x: 10, y: 20 }, { x: 0, y: 0 });
  expect([0, 1, 4].map((index) => corner.warp[index])).toEqual([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 0, y: 10 }
  ]);
  expect(corner.warp[5]).toEqual(flat[5]);
  const bulged = moveWarpPoint({ ...box, warp: flat }, 5, flat[5]!, { x: flat[5]!.x, y: flat[5]!.y - 9 });
  expect(warpPoint(bulged.warp, 0, 0)).toEqual(flat[0]);
  expect(warpPoint(bulged.warp, 1 / 3, 1 / 3).y).toBeLessThan(warpPoint(flat, 1 / 3, 1 / 3).y);

  const flipped = flipWarp(bulged.warp, 'x');
  expect(flipped[6]).toEqual(bulged.warp[5]);
  expect(flipWarp(flipped, 'x')).toEqual(bulged.warp);

  const { outline, lines } = warpOutline(flat, 4);
  expect(outline).toHaveLength(4 * 5);
  expect(lines).toHaveLength(4);
  // 2 × 2 cells of two triangles, 12 numbers each; the last vertex is the bottom-right corner with source (1, 1).
  const triangles = warpTriangles(flat, 2);
  expect(triangles).toHaveLength(2 * 2 * 2 * 12);
  expect([...triangles.subarray(-4)].map((value) => Math.round(value * 1000) / 1000)).toEqual([70, 50, 1, 1]);
});
