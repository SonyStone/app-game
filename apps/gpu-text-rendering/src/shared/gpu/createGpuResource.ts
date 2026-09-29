import type { GpuContext } from './context';
import { useGpuCanvas } from './GpuCanvasProvider';
import { onGpuRelease } from './onGpuRelease';

/**
 * Creates a buffer or texture for the current Solid owner beneath GpuCanvasProvider. It is destroyed once, on owner
 * cleanup or when the canvas detaches (device loss or canvas replacement), whichever happens first.
 * `create` runs once, synchronously; its exceptions propagate to the caller.
 */
export function createGpuResource<T extends { destroy(): void }>(create: (gpu: GpuContext) => T): T {
  const gpu = useGpuCanvas();
  const resource = create(gpu);

  onGpuRelease(gpu.signal, () => resource.destroy());

  return resource;
}
