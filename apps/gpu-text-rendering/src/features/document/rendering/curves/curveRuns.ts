import { drawClip, drawFirst, drawKind, drawMatrix, drawSegments, imageKind } from '../../plan/drawRecord';
import type { PaintNode } from '../../plan/paintTree';

/**
 * Splits only at shader requirements. Preserves source paint order while allowing a lighter shader for ordinary fills.
 * Each run also lists its `large` ordinary fills, at least {@link largeOutlineNorm} of a page across with at most
 * {@link maxCellSegments} segments, with their matrix norm, so a painter can draw them as cells once magnified.
 */
export function curveRuns(trees: PaintNode[][], instances: ArrayBuffer, coverageOffsets?: Uint32Array) {
  const records = new DataView(instances);
  const byNode = new Map<
    string,
    {
      first: number;
      count: number;
      simple: boolean;
      cacheScale: number;
      minimumScale: number;
      large: { index: number; norm: number }[];
    }[]
  >();

  for (const nodes of trees) {
    visit(nodes);
  }

  return byNode;

  function visit(nodes: PaintNode[]) {
    for (const node of nodes) {
      if ('children' in node) {
        visit(node.children);
        continue;
      }

      if (node.image !== undefined) {
        continue;
      }

      const runs: NonNullable<ReturnType<typeof byNode.get>> = [];
      let minimumScale = Infinity;

      for (let index = node.first; index < node.first + node.count; index++) {
        const simple = drawClip(records, index) === 0 && drawKind(records, index) < imageKind;
        const offset = simple ? coverageOffsets?.[drawFirst(records, index)] : 0;
        // Frobenius norm bounds the largest singular value, including shear and rotation.
        const norm = Math.hypot(
          drawMatrix(records, index, 0),
          drawMatrix(records, index, 1),
          drawMatrix(records, index, 2),
          drawMatrix(records, index, 3)
        );
        let cacheScale = Infinity;

        if (offset) {
          const size = offset & 0x80000000 ? 64 : offset & 0x40000000 ? 32 : 128;
          cacheScale = 2 ** Math.ceil(Math.log2(Math.max(norm / size, Number.MIN_VALUE)));
        }

        const large = simple && norm >= largeOutlineNorm && drawSegments(records, index) <= maxCellSegments;

        const previous = runs.at(-1);

        if (
          previous?.simple === simple &&
          Number.isFinite(previous.cacheScale) === Number.isFinite(cacheScale) &&
          Math.max(previous.cacheScale, cacheScale) <= Math.min(minimumScale, cacheScale) * 8
        ) {
          previous.count++;
          previous.cacheScale = Math.max(previous.cacheScale, cacheScale);
          minimumScale = Math.min(minimumScale, cacheScale);
          previous.minimumScale = minimumScale;

          if (large) {
            previous.large.push({ index, norm });
          }
        } else {
          runs.push({
            first: index,
            count: 1,
            simple,
            cacheScale,
            minimumScale: cacheScale,
            large: large ? [{ index, norm }] : []
          });
          minimumScale = cacheScale;
        }
      }

      byNode.set(`${node.first}:${node.count}`, runs);
    }
  }
}

/** Matrix norm, in page sizes, from which an ordinary fill may be drawn as cells: figures, not glyphs. */
const largeOutlineNorm = 0.05;
/** Most segments of an outline drawn as cells; every cell vertex scans the segments of its index rows. */
const maxCellSegments = 512;
