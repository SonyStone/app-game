import { expect, it } from 'vitest';
import { fromAffine } from './projective';
import { boxPoints, moveWarpPoint } from './transformDrag';
import {
  bendWarp,
  flipWarp,
  locateOnWarp,
  regridWarp,
  warpDocumentPoint,
  warpFromMatrix,
  warpFromQuad,
  warpOutline,
  warpPoint,
  warpTriangles
} from './warp';

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

it('stretches a distorted box bilinearly without perspective: evenly between its corners', () => {
  const corners = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 140, y: 60 },
    { x: -20, y: 60 }
  ] as const;
  const warp = warpFromQuad(corners);
  // Halfway down, halfway across: the average of the four corners, which a perspective would push towards the far edge.
  const middle = warpPoint(warp, 0.5, 0.5);
  expect(middle.x).toBeCloseTo(55);
  expect(middle.y).toBeCloseTo(30);
  const bounds = { left: 0, top: 0, right: 100, bottom: 60 };
  const box = { offset: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, angle: 0, corners };
  expect(boxPoints(bounds, box, { perspective: false }).center.y).toBeCloseTo(30);
  expect(boxPoints(bounds, box, { perspective: true }).center.y).not.toBeCloseTo(30);
});

it('splits a warp into a finer grid without changing its shape, and bends it where it is grabbed', () => {
  const flat = warpFromMatrix(bounds, fromAffine([1, 0, 0, 1, 0, 0]));
  const bulged = flat.map((point, index) => (index === 5 ? { x: point.x + 12, y: point.y - 9 } : point));
  const split = regridWarp(bulged, 2);
  expect(split).toHaveLength(49);
  for (const [u, v] of [
    [0.1, 0.2],
    [0.5, 0.5],
    [0.8, 0.35]
  ] as const) {
    const before = warpPoint(bulged, u, v),
      after = warpPoint(split, u, v);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  }

  // Grabbing the surface at a point and dragging it moves exactly that point; the corners stay.
  const at = locateOnWarp(split, warpPoint(split, 0.3, 0.6))!;
  expect(at.x).toBeCloseTo(0.3, 4);
  expect(at.y).toBeCloseTo(0.6, 4);
  const bent = bendWarp(split, at, { x: 5, y: -7 });
  const moved = warpPoint(bent, at.x, at.y),
    original = warpPoint(split, at.x, at.y);
  expect(moved.x - original.x).toBeCloseTo(5);
  expect(moved.y - original.y).toBeCloseTo(-7);
  expect(warpPoint(bent, 1, 1)).toEqual(warpPoint(split, 1, 1));
  expect(locateOnWarp(split, { x: 500, y: 500 })).toBeUndefined();

  // An anchor where patches meet takes its four handle points along.
  const anchor = 3 * 7 + 3;
  const dragged = moveWarpPoint({ ...box, warp: split }, anchor, split[anchor]!, {
    x: split[anchor]!.x + 4,
    y: split[anchor]!.y
  });
  expect(
    [anchor - 1, anchor + 1, anchor - 7, anchor + 7, anchor].map((index) => dragged.warp[index]!.x - split[index]!.x)
  ).toEqual([4, 4, 4, 4, 4]);
  expect(dragged.warp[anchor + 2]).toEqual(split[anchor + 2]);
});
