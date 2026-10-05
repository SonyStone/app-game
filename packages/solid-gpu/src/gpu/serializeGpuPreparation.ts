/**
 * Serializes preparation on a shared device. Preparation holds a validation error scope across awaits; WebGPU
 * scopes are device-wide, so only one preparation may run at a time and frame submission waits via
 * pendingGpuPreparation.
 */
export function serializeGpuPreparation<T>(device: GPUDevice, prepare: () => Promise<T>): Promise<T> {
  const result = (preparations.get(device) ?? Promise.resolve()).then(prepare);
  const settled = result.then(
    () => {},
    () => {}
  );
  preparations.set(device, settled);
  void settled.then(() => {
    if (preparations.get(device) === settled) {
      preparations.delete(device);
    }
  });
  return result;
}

/**
 * Resolves once queued and running preparations on this device have settled; undefined when none are pending.
 * Callers submitting unrelated GPU work (frames) wait on it so preparation's error scope captures only its own work.
 */
export function pendingGpuPreparation(device: GPUDevice): Promise<void> | undefined {
  return preparations.get(device);
}

const preparations = new WeakMap<GPUDevice, Promise<void>>();
