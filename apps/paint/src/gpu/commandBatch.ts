/** Lazily encodes ordered GPU passes into one submission.
 * Flush before resource destruction, readback, or rewriting any buffer used by a pending pass.
 * Queue uploads are not recorded here; callers own their ordering and must flush in cleanup.
 */
export function commandBatch(device: GPUDevice) {
  let version = 0;
  let encoder: GPUCommandEncoder | undefined;
  return {
    /** Advances after submission so buffer pools can reuse slots safely. */
    get version() {
      return version;
    },
    encoder: () => (encoder ??= device.createCommandEncoder()),
    flush() {
      if (!encoder) return;
      device.queue.submit([encoder.finish()]);
      encoder = undefined;
      version++;
    }
  };
}
