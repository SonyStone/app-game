import { createEffect, createRoot } from 'solid-js';
import { createGpuCanvas, type GpuContext } from '../../src/shared/gpu/context';
import { createGpuRoot } from '../../src/shared/gpu/createGpuRoot';

/** Browser-only harness: exercises the provider lifetimes without mounting the viewer's camera/UI. */
export function mountRenderingGpu(canvas: HTMLCanvasElement, bytes: number) {
  return new Promise<{ gpu: GpuContext; dispose: () => void }>((resolve, reject) => {
    createRoot((disposeRoot) => {
      const state = createGpuRoot(() => bytes);
      createEffect(state, (current) => {
        if (current.status === 'error') {
          disposeRoot();
          reject(current.error);
        }
        if (current.status === 'ready') {
          return createRoot((disposeCanvas) => {
            const result = createGpuCanvas(current.gpu, canvas);
            if (result.isErr()) {
              disposeCanvas();
              disposeRoot();
              reject(result.error);
            } else {
              resolve({ gpu: result.value, dispose: disposeRoot });
            }
            return disposeCanvas;
          });
        }
      });
    });
  });
}
