import { attempt, type Result } from '../asyncResult';
import { TILE_SIZE } from '../brush';
import { packTile } from '../tilePixels';

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
    /** Waits only for capacity, never for the newly submitted copy. Full tiles are packed losslessly;
     * smaller square masks return tightly packed raw RGBA bytes. Rejects invalid requests or cancellation
     * while waiting for capacity; mapping returns a Result. Copies start at each texture's top-left pixel.
     */
    async capture(textures: readonly (GPUTexture | { texture: GPUTexture; side: number })[]) {
      if (!textures.length || textures.length > texturesPerBatch) throw new Error('Invalid eviction readback size.');
      const copies = textures.map(item => 'texture' in item ? item : { texture: item, side: TILE_SIZE });
      const layout = readbackLayout(copies.map(copy => copy.side));
      const bytes = layout.bytes;
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
          copies.forEach(({ texture, side }, index) =>
            encoder.copyTextureToBuffer(
              { texture },
              { buffer: current.buffer, offset: layout.items[index]!.offset, bytesPerRow: layout.items[index]!.bytesPerRow },
              [side, side]
            )
          );
          device.queue.submit([encoder.finish()]);
          await current.buffer.mapAsync(GPUMapMode.READ, 0, bytes);
          if (disposed || owner !== epoch || generation !== current.generation)
            throw new Error('Eviction readback cancelled.');
          const mapped = new Uint8Array(current.buffer.getMappedRange(0, bytes));
          return copies.map(({ side }, index) => {
            const { offset, bytesPerRow } = layout.items[index]!;
            if (side < TILE_SIZE) {
              // Transient LOD masks are raw compact squares, not persisted document tiles.
              const pixels = new Uint8Array(side * side * 4);
              for (let y = 0; y < side; y++)
                pixels.set(mapped.subarray(offset + y * bytesPerRow, offset + y * bytesPerRow + side * 4), y * side * 4);
              return pixels;
            }
            const view = mapped.subarray(offset, offset + bytesPerRow * side);
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

/** Packs square RGBA copies into a staging buffer with WebGPU-aligned row strides and offsets. */
export function readbackLayout(sides: readonly number[]) {
  let bytes = 0;
  const items = sides.map(side => {
    if (!Number.isInteger(side) || side <= 0 || side > TILE_SIZE)
      throw new Error('Readback side must be an integer between 1 and 256.');
    const bytesPerRow = Math.ceil(side * 4 / 256) * 256;
    const offset = bytes;
    bytes += bytesPerRow * side;
    return { offset, bytesPerRow };
  });
  return { items, bytes };
}
