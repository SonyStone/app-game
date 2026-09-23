import { paintRuns } from './paintRuns';

/** A group paints into a transparent surface before its opacity and blend apply to the parent. */
export type PaintNode =
  | ReturnType<typeof paintRuns>[number]
  | {
      children: PaintNode[];
      opacity: number;
      blend: number;
      transfer?: Float32Array;
      isolated: boolean;
      knockout: boolean;
    };

/** Builds page-local paint trees without changing order or merging across group boundaries. */
export function paintTree(
  instances: ArrayBuffer,
  blends: ArrayBuffer,
  groups: ArrayBuffer,
  pages: { beginVertex: number; endVertex: number }[],
  maskTransfers = new ArrayBuffer(0)
) {
  const records = new DataView(groups);
  const transfers = new Map<number, Float32Array>();
  const transferView = new DataView(maskTransfers);

  for (let offset = 0; offset < maskTransfers.byteLength; offset += 1028) {
    transfers.set(transferView.getUint32(offset, true), new Float32Array(maskTransfers, offset + 4, 256));
  }

  const children = new Map<number, number[]>();

  for (let i = 0; i < groups.byteLength / 24; i++) {
    const parent = records.getUint32(i * 24 + 16, true);
    const list = children.get(parent) ?? [];
    list.push(i);
    children.set(parent, list);
  }

  return pages.map((page, index) =>
    build(
      page.beginVertex / 6,
      page.endVertex / 6,
      (children.get(0) ?? []).filter((i) => records.getUint32(i * 24 + 20, true) === index)
    )
  );

  function leaves(first: number, end: number, individual = false) {
    return paintRuns(instances, first, end, blends).flatMap((run) =>
      run.blend === 0 && !individual
        ? [run]
        : Array.from({ length: run.count }, (_, offset) => ({ ...run, first: run.first + offset, count: 1 }))
    );
  }

  function build(first: number, end: number, indices: number[], knockout = false): PaintNode[] {
    const nodes: PaintNode[] = [];
    let next = first;

    for (const index of indices) {
      const start = records.getUint32(index * 24, true);
      const stop = records.getUint32(index * 24 + 4, true);
      nodes.push(...leaves(next, start, knockout));
      const properties = records.getUint32(index * 24 + 12, true);
      const isolated = (properties & 256) === 0;
      const childKnockout = (properties & 512) !== 0;
      const nested = build(start, stop, children.get(index + 1) ?? [], childKnockout);
      const opacity = records.getFloat32(index * 24 + 8, true);
      const blend = properties & 255;

      if (
        !knockout &&
        !childKnockout &&
        opacity === 1 &&
        blend === 0 &&
        (!isolated || nested.every((node) => node.blend === 0))
      ) {
        nodes.push(...nested);
      } else if (nested.length > 0 || blend === 2 || blend === 3) {
        nodes.push({
          children: nested,
          opacity,
          blend,
          transfer: transfers.get(index),
          isolated,
          knockout: childKnockout
        });
      }

      next = stop;
    }

    nodes.push(...leaves(next, end, knockout));
    return knockout ? nodes : coalesceNormalPaint(nodes);
  }
}

/** Flattened opaque groups no longer separate compatible draws, but paint order remains unchanged. */
function coalesceNormalPaint(nodes: PaintNode[]) {
  const result: PaintNode[] = [];

  for (const node of nodes) {
    const previous = result.at(-1);

    if (
      previous &&
      !('children' in previous) &&
      !('children' in node) &&
      previous.blend === 0 &&
      node.blend === 0 &&
      previous.image === node.image &&
      previous.first + previous.count === node.first
    ) {
      result[result.length - 1] = { ...previous, count: previous.count + node.count };
    } else {
      result.push(node);
    }
  }

  return result;
}
