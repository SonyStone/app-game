import { attempt, type Result } from '../asyncResult';
import { TILE_SIZE } from '../brush';
import { packTile, TILE_BYTES } from '../tilePixels';

/** Two reusable staging buffers overlap eviction readback with painting. Each capture submits its
 * texture copies before returning; callers may then recycle source textures, but must check the ready
 * Result before reading pixels. Buffers grow to fit requested batches, up to texturesPerBatch tiles.
 * Returned arrays own their memory and survive unmap/reuse.
 */
export function createReadbackQueue(device: GPUDevice, texturesPerBatch: number) {
  const slots: { buffer: GPUBuffer; generation: number; busy: boolean; settled: Promise<Result<unknown>> }[] = [];
  let epoch = 0,
    disposed = false,
    batches = 0,
    capacityWaits = 0;
  return {
    /** Waits only for capacity, never for the newly submitted copy. Packs losslessly after mapping.
     * Rejects invalid requests or cancellation while waiting for capacity; mapping returns a Result.
     */
    async capture(textures: readonly GPUTexture[]) {
      if (!textures.length || textures.length > texturesPerBatch) throw new Error('Invalid eviction readback size.');
      const bytes = textures.length * TILE_BYTES;
      const owner = epoch;
      let slot: (typeof slots)[number] | undefined;
      for (;;) {
        if (disposed || owner !== epoch) throw new Error('Eviction readback cancelled.');
        slot = slots.find((candidate) => !candidate.busy);
        if (slot) break;
        if (slots.length < 2) {
          slot = {
            buffer: device.createBuffer({
              label: 'paint-eviction-readback',
              size: bytes,
              usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            }),
            generation: 0,
            busy: false,
            settled: Promise.resolve({ ok: true, value: undefined })
          };
          slots.push(slot);
          break;
        }
        capacityWaits++;
        await Promise.race(slots.map((candidate) => candidate.settled));
      }
      const current = slot;
      const generation = ++current.generation;
      if (current.buffer.size < bytes) {
        current.buffer.destroy();
        current.buffer = device.createBuffer({
          label: 'paint-eviction-readback',
          size: bytes,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
      }
      current.busy = true;
      batches++;
      const ready = attempt(async () => {
        try {
          const encoder = device.createCommandEncoder();
          textures.forEach((texture, index) =>
            encoder.copyTextureToBuffer(
              { texture },
              { buffer: current.buffer, offset: index * TILE_BYTES, bytesPerRow: TILE_SIZE * 4 },
              [TILE_SIZE, TILE_SIZE]
            )
          );
          device.queue.submit([encoder.finish()]);
          await current.buffer.mapAsync(GPUMapMode.READ, 0, textures.length * TILE_BYTES);
          if (disposed || owner !== epoch || generation !== current.generation)
            throw new Error('Eviction readback cancelled.');
          const mapped = new Uint8Array(current.buffer.getMappedRange(0, textures.length * TILE_BYTES));
          return textures.map((_, index) => {
            const view = mapped.subarray(index * TILE_BYTES, (index + 1) * TILE_BYTES);
            const packed = packTile(view);
            // Dense tiles are returned unchanged by packTile; detach them from the mapped buffer.
            return packed === view ? view.slice() : packed;
          });
        } finally {
          if (generation === current.generation) {
            if (!disposed) current.buffer.unmap();
            current.busy = false;
          }
        }
      });
      // Capacity waits continue after either outcome; consumers must inspect the same result.
      current.settled = ready;
      return { ready };
    },
    /** Invalidates old results and releases mappings. Generation checks protect immediate slot reuse. */
    clear() {
      epoch++;
      for (const slot of slots) {
        slot.generation++;
        slot.buffer.unmap();
        slot.busy = false;
      }
    },
    stats: () => ({
      buffers: slots.length,
      pending: slots.filter((slot) => slot.busy).length,
      bytes: slots.reduce((bytes, slot) => bytes + slot.buffer.size, 0),
      batches,
      capacityWaits
    }),
    /** Rejects pending maps without leaving unhandled background rejections. */
    destroy() {
      disposed = true;
      epoch++;
      for (const slot of slots) {
        slot.generation++;
        slot.busy = false;
        slot.buffer.destroy();
      }
      slots.length = 0;
    }
  };
}
