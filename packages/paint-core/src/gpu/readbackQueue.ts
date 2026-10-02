import { attempt, type Result } from '../asyncResult';
import { TILE_SIZE } from '../brush';
import { packTileCopy } from '../tilePixels';

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
    /** Waits only for capacity, never for the newly submitted copy. Full RGBA8 tiles are packed losslessly;
     * smaller square masks and non-RGBA8 textures (the r16float round-brush coverage) return tightly packed raw bytes. Rejects invalid requests or cancellation
     * while waiting for capacity; mapping returns a Result. Copies start at each texture's top-left pixel.
     * `inspect` receives each full tile's raw mapped bytes (valid only during the call) before packing.
     */
    async capture(
      textures: readonly (GPUTexture | { texture: GPUTexture; side: number })[],
      inspect?: (raw: Uint8Array, index: number) => void
    ) {
      if (!textures.length || textures.length > texturesPerBatch) throw new Error('Invalid eviction readback size.');
      const copies = textures.map((item) => {
        const { texture, side } = 'texture' in item ? item : { texture: item, side: TILE_SIZE };
        return { texture, side, pixelBytes: texelBytes(texture.format) };
      });
      const layout = readbackLayout(
        copies.map((copy) => copy.side),
        copies.map((copy) => copy.pixelBytes)
      );
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
          return copies.map(({ side, pixelBytes }, index) => {
            const { offset, bytesPerRow } = layout.items[index]!;
            if (side < TILE_SIZE || pixelBytes !== 4) {
              // Transient LOD masks and coverage are raw compact squares, not persisted document tiles.
              const row = side * pixelBytes;
              const pixels = new Uint8Array(side * row);
              for (let y = 0; y < side; y++) {
                pixels.set(mapped.subarray(offset + y * bytesPerRow, offset + y * bytesPerRow + row), y * row);
              }

              return pixels;
            }
            const view = mapped.subarray(offset, offset + bytesPerRow * side);
            inspect?.(view, index);
            // Detaches dense tiles from the mapped buffer; the result is marked as already packed.
            return packTileCopy(view);
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

/** Packs square copies into a staging buffer with WebGPU-aligned row strides and offsets. `pixelBytes` holds each
 * copy's texel size and defaults to RGBA8.
 */
export function readbackLayout(sides: readonly number[], pixelBytes: readonly number[] = []) {
  let bytes = 0;
  const items = sides.map((side, index) => {
    if (!Number.isInteger(side) || side <= 0 || side > TILE_SIZE)
      throw new Error('Readback side must be an integer between 1 and 256.');
    const bytesPerRow = Math.ceil((side * (pixelBytes[index] ?? 4)) / 256) * 256;
    const offset = bytes;
    bytes += bytesPerRow * side;
    return { offset, bytesPerRow };
  });
  return { items, bytes };
}

/** Bytes per texel of the formats the renderer reads back. */
function texelBytes(format: GPUTextureFormat) {
  if (format === 'r16float') {
    return 2;
  }

  if (format === 'rgba8unorm') {
    return 4;
  }

  throw new Error(`Readback does not support ${format} textures.`);
}
