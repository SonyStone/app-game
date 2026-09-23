import { d } from 'typegpu';
import type { GpuContext } from '../../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../../shared/gpu/resources';
import type { TextDocument } from '../../document';
import { runDocumentWorker } from '../../runDocumentWorker';
import { uploadBuffer } from '../uploadBuffer';
import type { CoverageTables } from './buildCoverageTables';
import { coverageTableLayout } from './coverageTable';

/** Prepares area integrals once; source cubics remain authoritative at magnification. */
export async function prepareCoverageTables(
  gpu: GpuContext,
  document: Extract<TextDocument, { kind: 'curves' }>,
  keep: KeepGpuResource
) {
  const abort = new AbortController();
  keep({ destroy: () => abort.abort() });
  // File loaders already compute these alongside decoding. Standalone callers use
  // a separate worker; their geometry stays owned by the caller throughout.
  const tables =
    document.coverage ??
    (
      await runDocumentWorker<CoverageTables>(
        () => new Worker(new URL('./coverage.worker.ts', import.meta.url), { type: 'module' }),
        { instances: document.instances, curves: document.curves },
        abort.signal
      )
    )._unsafeUnwrap();
  const active = gpu.checkActive();
  if (active.isErr()) throw new Error(active.error.message);
  // These are staging buffers. A later renderer can rebuild them in a worker;
  // the live document must not pin another full coverage atlas on the CPU.
  delete document.coverage;
  const { offsets, areas: packed, grids: packedGrids } = tables;
  const offsetBuffer = keep(gpu.root.createBuffer(d.arrayOf(d.u32, offsets.length))).$usage('storage');
  await uploadBuffer(gpu, offsetBuffer.buffer, offsets.buffer);
  const areaBuffer = keep(gpu.root.createBuffer(d.arrayOf(d.f32, packed.length))).$usage('storage');
  await uploadBuffer(gpu, areaBuffer.buffer, packed.buffer);
  const gridBuffer = keep(gpu.root.createBuffer(d.arrayOf(d.u32, packedGrids.length))).$usage('storage');
  await uploadBuffer(gpu, gridBuffer.buffer, packedGrids.buffer);

  return {
    offsets,
    group: gpu.root.createBindGroup(coverageTableLayout, {
      offsets: offsetBuffer,
      areas: areaBuffer,
      grids: gridBuffer
    }),
    resourceBytes: offsets.byteLength + packed.byteLength + packedGrids.byteLength
  };
}
