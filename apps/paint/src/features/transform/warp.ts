import type { Point } from '@app-game/paint-core/camera';
import { applyProjective, type Projective } from './projective';
import type { TransformBounds } from './transformEdit';

/**
 * A warp: the 16 control points of a bicubic Bézier patch, row by row from the top-left, in document pixels, as
 * Photoshop's Warp. The corners are where the corners of the bounds go; the points in between pull the edges and the
 * inside into curves. Evenly spaced points leave the pixels in place.
 */
export type Warp = readonly Point[];

/** Control points per side of a warp. */
export const warpSide = 4;

/**
 * The warp that places the pixels of `bounds` as `matrix` does: the points at thirds of the bounds, transformed. Exact
 * for moves, scales and turns; a perspective becomes the nearest warp.
 */
export function warpFromMatrix(bounds: TransformBounds, matrix: Projective): Point[] {
  const width = bounds.right - bounds.left,
    height = bounds.bottom - bounds.top;
  return Array.from({ length: warpSide * warpSide }, (_, index) =>
    applyProjective(matrix, {
      x: bounds.left + (width * (index % warpSide)) / (warpSide - 1),
      y: bounds.top + (height * Math.floor(index / warpSide)) / (warpSide - 1)
    })
  );
}

/** The point of the patch at `u`, `v` from 0 to 1 across and down the bounds. */
export function warpPoint(warp: Warp, u: number, v: number): Point {
  const bu = bernstein(u),
    bv = bernstein(v);
  let x = 0,
    y = 0;
  for (let row = 0; row < warpSide; row++) {
    for (let column = 0; column < warpSide; column++) {
      const weight = bu[column]! * bv[row]!;
      const point = warp[row * warpSide + column]!;
      x += point.x * weight;
      y += point.y * weight;
    }
  }

  return { x, y };
}

/** Where a document point of `bounds` goes through the warp. */
export function warpDocumentPoint(bounds: TransformBounds, warp: Warp, point: Point): Point {
  return warpPoint(
    warp,
    (point.x - bounds.left) / (bounds.right - bounds.left),
    (point.y - bounds.top) / (bounds.bottom - bounds.top)
  );
}

/** The warp's control points as `[x0, y0, x1, y1, …]`, as `FloatingPixels.warp` takes them. */
export function warpNumbers(warp: Warp): number[] {
  return warp.flatMap(({ x, y }) => [x, y]);
}

/**
 * The warp mirrored within its grid of control points, along `axis`: the pixels flip, the shape stays. Flipping across
 * x swaps the columns of each row, across y the rows.
 */
export function flipWarp(warp: Warp, axis: 'x' | 'y'): Point[] {
  return warp.map((_, index) => {
    const column = index % warpSide,
      row = Math.floor(index / warpSide);
    return axis === 'x'
      ? warp[row * warpSide + warpSide - 1 - column]!
      : warp[(warpSide - 1 - row) * warpSide + column]!;
  });
}

/** The warp moved by `delta`, or turned by `angle` radians clockwise about `center`. */
export function moveWarp(warp: Warp, delta: Point, angle = 0, center: Point = { x: 0, y: 0 }): Point[] {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  return warp.map(({ x, y }) => ({
    x: center.x + (x - center.x) * cos - (y - center.y) * sin + delta.x,
    y: center.y + (x - center.x) * sin + (y - center.y) * cos + delta.y
  }));
}

/** The center of the patch, the point of the middle of the bounds. */
export function warpCenter(warp: Warp): Point {
  return warpPoint(warp, 0.5, 0.5);
}

/**
 * Document points along the patch's outline and its grid lines at thirds, for drawing it: `outline` closes around the
 * patch, `lines` are the inner curves across and down. Each curve has `steps` segments.
 */
export function warpOutline(warp: Warp, steps = 24) {
  const curve = (at: (t: number) => Point) => Array.from({ length: steps + 1 }, (_, index) => at(index / steps));
  const outline = [
    ...curve((t) => warpPoint(warp, t, 0)),
    ...curve((t) => warpPoint(warp, 1, t)),
    ...curve((t) => warpPoint(warp, 1 - t, 1)),
    ...curve((t) => warpPoint(warp, 0, 1 - t))
  ];
  const lines = [1 / 3, 2 / 3].flatMap((at) => [
    curve((t) => warpPoint(warp, t, at)),
    curve((t) => warpPoint(warp, at, t))
  ]);
  return { outline, lines };
}

/**
 * Triangles that approximate the patch, for drawing its pixels: `cells` × `cells` cells of two triangles each, in mesh
 * order, each vertex as document `x`, `y` then source `u`, `v` from 0 to 1. Holds 12 numbers per triangle.
 */
export function warpTriangles(warp: Warp, cells: number): Float64Array {
  const grid: Point[] = [];
  for (let row = 0; row <= cells; row++) {
    for (let column = 0; column <= cells; column++) {
      grid.push(warpPoint(warp, column / cells, row / cells));
    }
  }

  const triangles = new Float64Array(cells * cells * 2 * 12);
  let write = 0;
  const vertex = (column: number, row: number) => {
    const point = grid[row * (cells + 1) + column]!;
    triangles.set([point.x, point.y, column / cells, row / cells], write);
    write += 4;
  };
  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      // As the GPU mesh: (0, 0), (1, 0), (0, 1), then (0, 1), (1, 0), (1, 1).
      vertex(column, row);
      vertex(column + 1, row);
      vertex(column, row + 1);
      vertex(column, row + 1);
      vertex(column + 1, row);
      vertex(column + 1, row + 1);
    }
  }

  return triangles;
}

/** The four cubic Bernstein weights at `t`. */
function bernstein(t: number): [number, number, number, number] {
  const s = 1 - t;
  return [s * s * s, 3 * t * s * s, 3 * t * t * s, t * t * t];
}
