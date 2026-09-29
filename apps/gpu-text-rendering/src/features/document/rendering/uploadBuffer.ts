import type { GpuDevice } from '../../../shared/gpu/context';
import { yieldToEventLoop } from './yieldToEventLoop';

/**
 * Uploads aligned bytes in at most 4 MiB writes, yielding between large chunks.
 * Checks renderer lifetime before every write, including after cancellation during a yield.
 * Source offset and length are bytes, aligned to four. Destination writes begin at zero.
 * The caller owns the destination and must allocate it before calling.
 */
export async function uploadBuffer(
  gpu: GpuDevice,
  destination: GPUBuffer,
  source: ArrayBuffer,
  sourceOffset = 0,
  byteLength = source.byteLength - sourceOffset
) {
  const chunkBytes = 4 * 1024 * 1024;
  for (let offset = 0; offset < byteLength; offset += chunkBytes) {
    const active = gpu.checkActive();
    if (active.isErr()) {
      throw new Error(active.error.message);
    }
    gpu.device.queue.writeBuffer(
      destination,
      offset,
      source,
      sourceOffset + offset,
      Math.min(chunkBytes, byteLength - offset)
    );
    if (offset + chunkBytes < byteLength) {
      await yieldToEventLoop();
    }
  }
}
