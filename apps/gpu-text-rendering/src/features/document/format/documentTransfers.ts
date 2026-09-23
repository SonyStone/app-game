import type { DecodeReply } from './types';

/** Transfers every owned buffer without structured-clone copies, including worker-built coverage. */
export function documentTransfers(reply: DecodeReply) {
  const transfer: Transferable[] = [];

  if (reply.ok) {
    const data = reply.value;
    transfer.push(data.positions.x.buffer, data.positions.y.buffer);
    transfer.push(
      ...(data.kind === 'glyphs'
        ? [data.glyphVertices, data.atlas.buf, data.atlasVertices.buf]
        : [
            data.curves,
            data.instances,
            data.clips,
            data.curveBins,
            data.blends,
            data.groups,
            data.maskTransfers,
            data.radialGradients,
            data.rasterImages.table,
            data.rasterImages.pixels
          ])
    );
  }

  if (reply.ok && reply.value.kind === 'curves' && reply.value.coverage) {
    const { offsets, areas, grids } = reply.value.coverage;
    transfer.push(offsets.buffer, areas.buffer, grids.buffer);
  }
  if (reply.ok && reply.value.kind === 'curves' && reply.value.preparation) {
    const { instances, clips, bins } = reply.value.preparation.indexed;
    transfer.push(instances, clips, bins, reply.value.preparation.spatial.leaves.buffer);
  }
  return [...new Set(transfer)];
}
