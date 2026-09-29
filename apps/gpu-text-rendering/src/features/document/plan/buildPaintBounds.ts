import { drawCount, drawMatrix, drawPage, drawTranslation } from './drawRecord';

/** Page-space box as left, bottom, right, top; empty when left > right. */
export type Bounds = readonly [number, number, number, number];

/** Instance range with its union bounds; leaves hold at most 32 instances. */
export type BoundsBranch = { first: number; end: number; bounds: Bounds; children?: [BoundsBranch, BoundsBranch] };

/** Builds transferable spatial data once; query closures stay on the render thread. */
export function buildPaintBounds(instances: ArrayBuffer, pages: { x: number; y: number }[]) {
  const data = new DataView(instances);
  const count = drawCount(data);
  const leaves = new Float64Array(count * 4);

  for (let index = 0; index < count; index++) {
    const a = drawMatrix(data, index, 0);
    const b = drawMatrix(data, index, 1);
    const c = drawMatrix(data, index, 2);
    const d = drawMatrix(data, index, 3);
    const tx = drawTranslation(data, index, 0);
    const ty = drawTranslation(data, index, 1);
    const page = pages[drawPage(data, index)]!;
    // Include the whole outline; clipping its box before adding the pixel fringe can lose thin edges.
    const left = tx + Math.min(0, a) + Math.min(0, c);
    const right = tx + Math.max(0, a) + Math.max(0, c);
    const top = ty + Math.min(0, b) + Math.min(0, d);
    const bottom = ty + Math.max(0, b) + Math.max(0, d);
    leaves.set([left - page.x, 1 - bottom - page.y, right - page.x, 1 - top - page.y], index * 4);
  }

  const tree = build(0, count);
  return { leaves, tree };

  function build(first: number, end: number): BoundsBranch {
    if (end - first <= 32) {
      let bounds = emptyBounds;

      for (let index = first; index < end; index++) {
        bounds = unionBounds(bounds, leafBounds(leaves, index));
      }

      return { first, end, bounds };
    }

    const middle = Math.floor((first + end) / 2);
    const children: [BoundsBranch, BoundsBranch] = [build(first, middle), build(middle, end)];
    return { first, end, children, bounds: unionBounds(children[0].bounds, children[1].bounds) };
  }
}

/** Smallest box containing both; empty operands leave the other unchanged. */
export function unionBounds(a: Bounds, b: Bounds): Bounds {
  if (b[0] > b[2] || b[1] > b[3]) {
    return a;
  }

  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Identity for {@link unionBounds}. */
export const emptyBounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];

/** Page-space box of one instance from {@link buildPaintBounds}' `leaves`. */
export function leafBounds(leaves: Float64Array, index: number): Bounds {
  return [leaves[index * 4]!, leaves[index * 4 + 1]!, leaves[index * 4 + 2]!, leaves[index * 4 + 3]!];
}
