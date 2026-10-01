import type { GpuDevice, KeepGpuResource } from '@app-game/solid-gpu/gpu';
import { err, ok } from 'neverthrow';
import { d } from 'typegpu';
import type { TextDocument } from '../../document';
import type { DocumentWorkers } from '../DocumentWorkers';
import { uploadBuffer } from '../uploadBuffer';
import { coverageTableLayout } from './coverageTable';

/**
 * Prepares area integrals once; source cubics remain authoritative at magnification.
 * Also reserves room for magnified tables built on demand: a second half of the offset array, indexed like the first,
 * and a pool of 32-bit words after the prepared grids, both empty until a caller fills them (see `createDetailTables`).
 *
 * Consumes `document.coverage`: the loader-supplied staging tables are deleted from the caller's
 * document once read, so the live document does not pin a second coverage atlas on the CPU.
 * Preparing the same document again therefore requests fresh tables from `request` (the coverage worker).
 *
 * Resolves a typed error when the coverage worker fails or the GPU context became inactive;
 * TypeGPU allocation exceptions still propagate to the renderer boundary.
 */
export async function prepareCoverageTables(
  gpu: GpuDevice,
  document: Extract<TextDocument, { kind: 'curves' }>,
  keep: KeepGpuResource,
  request: DocumentWorkers['coverage']
) {
  // File loaders may supply these alongside decoding. Otherwise request them from
  // the renderer owner; source geometry stays owned by the caller throughout.
  const tables = document.coverage
    ? ok(document.coverage)
    : await request({ instances: document.instances, curves: document.curves });
  if (tables.isErr()) {
    return err(tables.error);
  }

  const active = gpu.checkActive();
  if (active.isErr()) {
    return err(active.error);
  }

  delete document.coverage;
  const { offsets, areas: packed, grids: packedGrids } = tables.value;
  const offsetBuffer = keep(gpu.root.createBuffer(d.arrayOf(d.u32, offsets.length * 2))).$usage('storage');
  await uploadBuffer(gpu, offsetBuffer.buffer, offsets.buffer);
  const areaBuffer = keep(gpu.root.createBuffer(d.arrayOf(d.f32, packed.length))).$usage('storage');
  await uploadBuffer(gpu, areaBuffer.buffer, packed.buffer);
  const { maxStorageBufferBindingSize, maxBufferSize } = gpu.device.limits;
  const poolWords = Math.max(
    0,
    Math.min(maxDetailPoolBytes, Math.min(maxStorageBufferBindingSize, maxBufferSize) - packedGrids.byteLength) >> 2
  );
  const gridBuffer = keep(gpu.root.createBuffer(d.arrayOf(d.u32, packedGrids.length + poolWords))).$usage('storage');
  await uploadBuffer(gpu, gridBuffer.buffer, packedGrids.buffer);

  return ok({
    offsets,
    group: gpu.root.createBindGroup(coverageTableLayout, {
      offsets: offsetBuffer,
      areas: areaBuffer,
      grids: gridBuffer
    }),
    /** Buffers and layout for tables built on demand. */
    detail: {
      offsetBuffer: offsetBuffer.buffer,
      poolBuffer: gridBuffer.buffer,
      /** First index of the on-demand half of the offset array. */
      offsetStart: offsets.length,
      /** First word of the on-demand pool in the grid buffer. */
      poolStart: packedGrids.length,
      poolWords
    },
    resourceBytes: offsets.byteLength * 2 + packed.byteLength + packedGrids.byteLength + poolWords * 4
  });
}

/**
 * Upper bound for tables built on demand; also limited by the device's largest storage binding. Tables sized to their
 * scale take a few to a few dozen kilobytes in a reading view, so this holds every outline of several pages.
 */
const maxDetailPoolBytes = 48 * 1024 * 1024;
