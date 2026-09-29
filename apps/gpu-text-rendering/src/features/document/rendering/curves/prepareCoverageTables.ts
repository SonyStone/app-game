import { err, ok } from 'neverthrow';
import { d } from 'typegpu';
import type { GpuContext } from '../../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../../shared/gpu/resources';
import type { TextDocument } from '../../document';
import { documentWorkerError } from '../../documentWorkerError';
import type { DocumentWorkers } from '../DocumentWorkers';
import { uploadBuffer } from '../uploadBuffer';
import { coverageTableLayout } from './coverageTable';

/**
 * Prepares area integrals once; source cubics remain authoritative at magnification.
 *
 * Consumes `document.coverage`: the loader-supplied staging tables are deleted from the caller's
 * document once read, so the live document does not pin a second coverage atlas on the CPU.
 * Preparing the same document again therefore requests fresh tables from `request` (the coverage worker).
 *
 * Resolves a typed error when the coverage worker fails or the GPU context became inactive;
 * TypeGPU allocation exceptions still propagate to the renderer boundary.
 */
export async function prepareCoverageTables(
  gpu: GpuContext,
  document: Extract<TextDocument, { kind: 'curves' }>,
  keep: KeepGpuResource,
  request: DocumentWorkers['coverage']
) {
  // File loaders may supply these alongside decoding. Otherwise request them from
  // the renderer owner; source geometry stays owned by the caller throughout.
  const tables = document.coverage
    ? ok(document.coverage)
    : (await request({ instances: document.instances, curves: document.curves })).mapErr(documentWorkerError);
  if (tables.isErr()) {
    return err(tables.error);
  }

  const active = gpu.checkActive();
  if (active.isErr()) {
    return err(active.error);
  }

  delete document.coverage;
  const { offsets, areas: packed, grids: packedGrids } = tables.value;
  const offsetBuffer = keep(gpu.root.createBuffer(d.arrayOf(d.u32, offsets.length))).$usage('storage');
  await uploadBuffer(gpu, offsetBuffer.buffer, offsets.buffer);
  const areaBuffer = keep(gpu.root.createBuffer(d.arrayOf(d.f32, packed.length))).$usage('storage');
  await uploadBuffer(gpu, areaBuffer.buffer, packed.buffer);
  const gridBuffer = keep(gpu.root.createBuffer(d.arrayOf(d.u32, packedGrids.length))).$usage('storage');
  await uploadBuffer(gpu, gridBuffer.buffer, packedGrids.buffer);

  return ok({
    offsets,
    group: gpu.root.createBindGroup(coverageTableLayout, {
      offsets: offsetBuffer,
      areas: areaBuffer,
      grids: gridBuffer
    }),
    resourceBytes: offsets.byteLength + packed.byteLength + packedGrids.byteLength
  });
}
