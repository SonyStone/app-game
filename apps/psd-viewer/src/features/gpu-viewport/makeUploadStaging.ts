import { viewerPerformance } from '../telemetry/performance';

/**
 * Reuses 128 mapped COPY_SRC buffers for bounded texture strips. Call submit after the encoder using acquired
 * buffers has been submitted. Remapping waits asynchronously for GPU use to finish; exhaustion defers uploads.
 * Destroy cancels pending maps and releases all buffers, including maps that finish after disposal.
 */
export function makeUploadStaging(device: Pick<GPUDevice, 'createBuffer'>) {
  const capacity = 64 * 1024;
  let destroyed = false;
  const slots = Array.from({ length: 128 }, () => {
    const buffer = device.createBuffer({
      size: capacity,
      usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true
    });
    const mapped = buffer.getMappedRange();
    return {
      buffer,
      view: new Uint8Array(mapped) as Uint8Array<ArrayBuffer> | undefined,
      words: new Uint32Array(mapped) as Uint32Array<ArrayBuffer> | undefined,
      state: 'mapped' as 'mapped' | 'copied' | 'mapping'
    };
  });

  return {
    capacity,
    bytes: slots.length * capacity,
    /** Borrows a mapped buffer until unmap. Returns undefined while all buffers are in flight. */
    acquire() {
      if (destroyed) {
        return undefined;
      }

      const slot = slots.find((slot) => slot.state === 'mapped');
      return slot
        ? {
            buffer: slot.buffer,
            view: slot.view!,
            words: slot.words!,
            unmap() {
              slot.buffer.unmap();
              slot.view = undefined;
              slot.words = undefined;
              slot.state = 'copied';
            }
          }
        : undefined;
    },
    /** Starts remapping after queue submission; never waits on the main thread. */
    submit() {
      if (destroyed) {
        return;
      }

      for (const slot of slots) {
        if (slot.state !== 'copied') {
          continue;
        }

        slot.state = 'mapping';
        void slot.buffer
          .mapAsync(GPUMapMode.WRITE)
          .then(() => {
            if (!destroyed) {
              const start = performance.now();
              const mapped = slot.buffer.getMappedRange();
              slot.view = new Uint8Array(mapped);
              slot.words = new Uint32Array(mapped);
              slot.state = 'mapped';
              viewerPerformance.record('upload.remap', start, capacity);
            }
          })
          .catch(() => {});
      }
    },
    destroy() {
      if (destroyed) {
        return;
      }

      destroyed = true;
      for (const slot of slots) {
        slot.view = undefined;
        slot.buffer.destroy();
      }
    }
  };
}
