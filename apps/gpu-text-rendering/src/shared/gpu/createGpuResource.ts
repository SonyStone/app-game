import { makeEventListener } from '@solid-primitives/event-listener';
import { onCleanup } from 'solid-js';
import type { GpuContext } from './context';
import { useGpuCanvas } from './GpuCanvasProvider';
import { createGpuResources } from './resources';

/**
 * Creates a buffer or texture for the current Solid owner beneath GpuCanvasProvider. It is destroyed on owner
 * cleanup or when the canvas detaches (device loss or canvas replacement), whichever happens first.
 * `create` runs once, synchronously; its exceptions propagate to the caller.
 */
export function createGpuResource<T extends { destroy(): void }>(create: (gpu: GpuContext) => T): T {
  const gpu = useGpuCanvas();
  const resources = createGpuResources();

  onCleanup(resources.destroy);
  makeEventListener(gpu.signal, 'abort', resources.destroy, { once: true });

  if (gpu.signal.aborted) {
    resources.destroy();
  }

  return resources.keep(create(gpu));
}
