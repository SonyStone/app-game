import type { Point } from '@app-game/paint-core/camera';
import { applyProjective, type Projective } from './projective';
import type { TransformBounds } from './transformEdit';

/**
 * A warp, as Photoshop's Warp: the control points of an `n` × `n` grid of bicubic Bézier patches that share their
 * edges, `3n + 1` per side, row by row from the top-left, in document pixels; `n` is 1 to {@link maxWarpCells}. Every
 * third point is an anchor where patches meet, the corners of the bounds among them; the points between pull the edges
 * and the inside into curves. Evenly spaced points leave the pixels in place.
 */
export type Warp = readonly Point[];

/** Most patches per side of a warp; keep it in step with paint-core's `maxWarpCells`. */
export const maxWarpCells = 4;

/** Control points per side of a warp. */
export function warpSide(warp: Warp) {
  return Math.round(Math.sqrt(warp.length));
}

/** Patches per side of a warp. */
export function warpCells(warp: Warp) {
  return (warpSide(warp) - 1) / 3;
}

/**
 * The warp of `cells` × `cells` patches that places the pixels of `bounds` as `matrix` does: points evenly spaced over
 * the bounds, transformed. Exact for moves, scales and turns; a perspective becomes the nearest warp.
 */
export function warpFromMatrix(bounds: TransformBounds, matrix: Projective, cells = 1): Point[] {
  const side = 3 * cells + 1;
  const width = bounds.right - bounds.left,
    height = bounds.bottom - bounds.top;
  return Array.from({ length: side * side }, (_, index) =>
    applyProjective(matrix, {
      x: bounds.left + (width * (index % side)) / (side - 1),
      y: bounds.top + (height * Math.floor(index / side)) / (side - 1)
    })
  );
}

/**
 * The warp that stretches the bounds between four corners bilinearly, clockwise from the top-left: straight edges and
 * evenly spaced lines between them, without the foreshortening of a perspective. Exact, since a bilinear surface is a
 * Bézier patch whose control points lie on it at thirds.
 */
export function warpFromQuad(corners: readonly [Point, Point, Point, Point], cells = 1): Point[] {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const side = 3 * cells + 1;
  return Array.from({ length: side * side }, (_, index) => {
    const u = (index % side) / (side - 1),
      v = Math.floor(index / side) / (side - 1);
    return mix(mix(topLeft, topRight, u), mix(bottomLeft, bottomRight, u), v);
  });
}

/**
 * The same surface on a grid of `cells` × `cells` patches: each new patch passes through the old surface at its own
 * thirds. Exact where a new patch lies within one old patch, as when splitting one patch into several; otherwise the
 * nearest bicubic fit.
 */
export function regridWarp(warp: Warp, cells: number): Point[] {
  if (cells === warpCells(warp)) {
    return [...warp];
  }

  const side = 3 * cells + 1;
  const result: Point[] = Array.from({ length: side * side }, () => ({ x: 0, y: 0 }));
  for (let cellRow = 0; cellRow < cells; cellRow++) {
    for (let cellColumn = 0; cellColumn < cells; cellColumn++) {
      // The surface at the patch's 4 × 4 thirds, turned into control points by the inverse Bernstein matrix per axis.
      const samples = Array.from({ length: 16 }, (_, index) =>
        warpPoint(warp, (cellColumn + (index % 4) / 3) / cells, (cellRow + Math.floor(index / 4) / 3) / cells)
      );
      for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
          let x = 0,
            y = 0;
          for (let j = 0; j < 4; j++) {
            for (let i = 0; i < 4; i++) {
              const weight = thirdsInverse[row]![j]! * thirdsInverse[column]![i]!;
              x += samples[j * 4 + i]!.x * weight;
              y += samples[j * 4 + i]!.y * weight;
            }
          }

          result[(cellRow * 3 + row) * side + cellColumn * 3 + column] = { x, y };
        }
      }
    }
  }

  return result;
}

/** The point of the warp at `u`, `v` from 0 to 1 across and down the bounds. */
export function warpPoint(warp: Warp, u: number, v: number): Point {
  const { first, side, weightsU, weightsV } = patchAt(warp, u, v);
  let x = 0,
    y = 0;
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      const weight = weightsU[column]! * weightsV[row]!;
      const point = warp[first + row * side + column]!;
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

/**
 * Where on the warp, as `u`, `v` from 0 to 1, a document point lies: the nearest point of a fine sampling, refined
 * by Newton steps. `undefined` when the point is farther than `tolerance` document pixels from the surface.
 */
export function locateOnWarp(warp: Warp, point: Point, tolerance = 2): Point | undefined {
  const steps = 16 * warpCells(warp);
  let best = { u: 0, v: 0, distance: Infinity };
  for (let row = 0; row <= steps; row++) {
    for (let column = 0; column <= steps; column++) {
      const sample = warpPoint(warp, column / steps, row / steps);
      const distance = Math.hypot(sample.x - point.x, sample.y - point.y);
      if (distance < best.distance) {
        best = { u: column / steps, v: row / steps, distance };
      }
    }
  }

  let { u, v } = best;
  for (let iteration = 0; iteration < 6; iteration++) {
    const here = warpPoint(warp, u, v);
    const h = 1e-4;
    const du = warpPoint(warp, Math.min(1, u + h), v),
      dv = warpPoint(warp, u, Math.min(1, v + h));
    const a = (du.x - here.x) / h,
      b = (dv.x - here.x) / h,
      c = (du.y - here.y) / h,
      d = (dv.y - here.y) / h;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < 1e-9) {
      break;
    }

    const ex = point.x - here.x,
      ey = point.y - here.y;
    u = Math.min(1, Math.max(0, u + (d * ex - b * ey) / determinant));
    v = Math.min(1, Math.max(0, v + (a * ey - c * ex) / determinant));
  }

  const found = warpPoint(warp, u, v);
  return Math.hypot(found.x - point.x, found.y - point.y) <= tolerance ? { x: u, y: v } : undefined;
}

/**
 * The warp bent so that its point at `at` (`u`, `v` from 0 to 1) moves by `delta`, as dragging inside Photoshop's
 * Warp does: the control points of the patch under it move in proportion to their weight there, the least change that
 * moves that point exactly. Points shared with neighboring patches move with them.
 */
export function bendWarp(warp: Warp, at: Point, delta: Point): Point[] {
  const { first, side, weightsU, weightsV } = patchAt(warp, at.x, at.y);
  let sum = 0;
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      sum += (weightsU[column]! * weightsV[row]!) ** 2;
    }
  }

  const result = [...warp];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      const index = first + row * side + column;
      const share = (weightsU[column]! * weightsV[row]!) / sum;
      result[index] = { x: warp[index]!.x + delta.x * share, y: warp[index]!.y + delta.y * share };
    }
  }

  return result;
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
  const side = warpSide(warp);
  return warp.map((_, index) => {
    const column = index % side,
      row = Math.floor(index / side);
    return axis === 'x' ? warp[row * side + side - 1 - column]! : warp[(side - 1 - row) * side + column]!;
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

/** The center of the warp, the point of the middle of the bounds. */
export function warpCenter(warp: Warp): Point {
  return warpPoint(warp, 0.5, 0.5);
}

/**
 * Document points along the warp's outline and grid lines, for drawing it: `outline` closes around the warp, `lines`
 * are the inner curves across and down, at thirds for one patch and along the patch edges for more. Each curve has
 * `steps` segments per patch.
 */
export function warpOutline(warp: Warp, steps = 24) {
  const cells = warpCells(warp);
  const segments = steps * cells;
  const curve = (at: (t: number) => Point) => Array.from({ length: segments + 1 }, (_, index) => at(index / segments));
  const outline = [
    ...curve((t) => warpPoint(warp, t, 0)),
    ...curve((t) => warpPoint(warp, 1, t)),
    ...curve((t) => warpPoint(warp, 1 - t, 1)),
    ...curve((t) => warpPoint(warp, 0, 1 - t))
  ];
  const divisions = cells === 1 ? 3 : cells;
  const lines = Array.from({ length: divisions - 1 }, (_, index) => (index + 1) / divisions).flatMap((at) => [
    curve((t) => warpPoint(warp, t, at)),
    curve((t) => warpPoint(warp, at, t))
  ]);
  return { outline, lines };
}

/**
 * Triangles that approximate the warp, for drawing its pixels: `mesh` × `mesh` cells of two triangles each, in mesh
 * order, each vertex as document `x`, `y` then source `u`, `v` from 0 to 1. Holds 12 numbers per triangle.
 */
export function warpTriangles(warp: Warp, mesh: number): Float64Array {
  const grid: Point[] = [];
  for (let row = 0; row <= mesh; row++) {
    for (let column = 0; column <= mesh; column++) {
      grid.push(warpPoint(warp, column / mesh, row / mesh));
    }
  }

  const triangles = new Float64Array(mesh * mesh * 2 * 12);
  let write = 0;
  const vertex = (column: number, row: number) => {
    const point = grid[row * (mesh + 1) + column]!;
    triangles.set([point.x, point.y, column / mesh, row / mesh], write);
    write += 4;
  };
  for (let row = 0; row < mesh; row++) {
    for (let column = 0; column < mesh; column++) {
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

/**
 * The patch under `u`, `v`: the index of its top-left control point, the points per row, and the Bernstein weights of
 * its columns and rows there.
 */
function patchAt(warp: Warp, u: number, v: number) {
  const side = warpSide(warp),
    cells = (side - 1) / 3;
  const cellColumn = Math.min(cells - 1, Math.max(0, Math.floor(u * cells))),
    cellRow = Math.min(cells - 1, Math.max(0, Math.floor(v * cells)));
  return {
    first: cellRow * 3 * side + cellColumn * 3,
    side,
    weightsU: bernstein(u * cells - cellColumn),
    weightsV: bernstein(v * cells - cellRow)
  };
}

/** The four cubic Bernstein weights at `t`. */
function bernstein(t: number): [number, number, number, number] {
  const s = 1 - t;
  return [s * s * s, 3 * t * s * s, 3 * t * t * s, t * t * t];
}

function mix(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** The inverse of the Bernstein weights at 0, ⅓, ⅔ and 1: control points from points on the curve at thirds. */
const thirdsInverse = invert4([0, 1 / 3, 2 / 3, 1].map(bernstein));

/** The inverse of a 4 × 4 matrix by Gauss-Jordan elimination; the Bernstein matrix at thirds is well conditioned. */
function invert4(matrix: number[][]): number[][] {
  const rows = matrix.map((row, index) => [...row, ...[0, 1, 2, 3].map((column) => (column === index ? 1 : 0))]);
  for (let column = 0; column < 4; column++) {
    const pivot = rows
      .slice(column)
      .reduce(
        (best, row, offset) => (Math.abs(row[column]!) > Math.abs(rows[best]![column]!) ? column + offset : best),
        column
      );
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    const scale = rows[column]![column]!;
    rows[column] = rows[column]!.map((value) => value / scale);
    for (let row = 0; row < 4; row++) {
      if (row !== column) {
        const factor = rows[row]![column]!;
        rows[row] = rows[row]!.map((value, index) => value - factor * rows[column]![index]!);
      }
    }
  }

  return rows.map((row) => row.slice(4));
}
