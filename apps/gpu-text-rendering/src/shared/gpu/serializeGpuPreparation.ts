/** Serializes preparation on a shared device so asynchronous jobs cannot pop one another's validation scopes. */
export function serializeGpuPreparation<T>(device: GPUDevice, prepare: () => Promise<T>): Promise<T> {
  const result = (preparations.get(device) ?? Promise.resolve()).then(prepare);
  const settled = result.then(
    () => {},
    () => {}
  );
  preparations.set(device, settled);
  void settled.then(() => {
    if (preparations.get(device) === settled) preparations.delete(device);
  });
  return result;
}

const preparations = new WeakMap<GPUDevice, Promise<void>>();
