import type { PaintNode } from './paintTree';

/** Splits only at shader requirements. Preserves source paint order while allowing a lighter shader for ordinary fills. */
export function curveRuns(trees: PaintNode[][], instances: ArrayBuffer, coverageOffsets?: Uint32Array) {
  const records = new DataView(instances);
  const byNode = new Map<
    string,
    { first: number; count: number; simple: boolean; cacheScale: number; minimumScale: number }[]
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
        const simple = records.getUint32(index * 80 + 24, true) === 0 && records.getUint32(index * 80 + 72, true) < 2;
        const offset = simple ? coverageOffsets?.[records.getUint32(index * 80 + 64, true)] : 0;
        let cacheScale = Infinity;

        if (offset) {
          const size = offset & 0x80000000 ? 64 : offset & 0x40000000 ? 32 : 128;
          // Frobenius norm bounds the largest singular value, including shear and rotation.
          const norm = Math.hypot(
            records.getFloat32(index * 80, true),
            records.getFloat32(index * 80 + 4, true),
            records.getFloat32(index * 80 + 8, true),
            records.getFloat32(index * 80 + 12, true)
          );
          cacheScale = 2 ** Math.ceil(Math.log2(Math.max(norm / size, Number.MIN_VALUE)));
        }

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
        } else {
          runs.push({ first: index, count: 1, simple, cacheScale, minimumScale: cacheScale });
          minimumScale = cacheScale;
        }
      }

      byNode.set(`${node.first}:${node.count}`, runs);
    }
  }
}
