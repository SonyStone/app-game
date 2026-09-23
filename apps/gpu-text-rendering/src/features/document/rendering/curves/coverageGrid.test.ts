import { expect, it } from 'vitest';
import { outlineGrid } from './outlineGrid';

it('retains thin boundaries instead of classifying them from a low-resolution raster', () => {
  const curves = rectangle(0.501, 0.1, 0.50101, 0.9);
  const grid = outlineGrid(curves, 0, 4, 0);

  expect(cell(grid, 16, 16)).toBe(2);
  expect(cell(grid, 15, 16)).toBe(0);
  expect(cell(grid, 17, 16)).toBe(0);
});

it('distinguishes even-odd holes from overlapping nonzero fills', () => {
  const curves = new Float32Array([...rectangle(0, 0, 1, 1), ...rectangle(0.25, 0.25, 0.75, 0.75)]);

  expect(cell(outlineGrid(curves, 0, 8, 0), 16, 16)).toBe(1);
  expect(cell(outlineGrid(curves, 0, 8, 1), 16, 16)).toBe(0);
  expect(cell(outlineGrid(curves, 0, 8, 1), 4, 16)).toBe(1);
});

it('tightens curved bounds while retaining an exact empty center in a ring', () => {
  const k = 0.5522847498307936;
  const points = [
    [1, 0.5, 1, 0.5 + k / 2, 0.5 + k / 2, 1, 0.5, 1],
    [0.5, 1, 0.5 - k / 2, 1, 0, 0.5 + k / 2, 0, 0.5],
    [0, 0.5, 0, 0.5 - k / 2, 0.5 - k / 2, 0, 0.5, 0],
    [0.5, 0, 0.5 + k / 2, 0, 1, 0.5 - k / 2, 1, 0.5]
  ].flat();
  const inner = points.map((value) => (value - 0.5) * 0.5 + 0.5);
  const grid = outlineGrid(new Float32Array([...points, ...inner]), 0, 8, 1);

  expect(cell(grid, 16, 16)).toBe(0);
  expect(cell(grid, 16, 4)).toBe(1);
  expect(cell(grid, 1, 1)).toBe(0);
  expect(cell(grid, 31, 16)).toBe(2);
});

function cell(grid: Uint32Array, x: number, y: number) {
  const index = y * 32 + x;
  return (grid[index >>> 4]! >>> ((index & 15) * 2)) & 3;
}

function rectangle(x: number, y: number, right: number, bottom: number) {
  const points = [
    [x, y],
    [right, y],
    [right, bottom],
    [x, bottom]
  ];
  return new Float32Array(
    points.flatMap((point, i) => [...point, ...point, ...points[(i + 1) % 4]!, ...points[(i + 1) % 4]!])
  );
}
