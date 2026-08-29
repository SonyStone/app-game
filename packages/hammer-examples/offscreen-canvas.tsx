import { createWindowSize } from '@solid-primitives/resize-observer';
import { createTrackedEffect, onSettled } from 'solid-js';
import OffscreenCanvasWorker from './offscreen-canvas.worker?worker';

export function useOffscreenCanvas() {
  const canvas = (<canvas class="touch-none"></canvas>) as HTMLCanvasElement;

  // ! important to use Worker to offload the main thread
  const worker = new OffscreenCanvasWorker();

  canvas.style.width = '100%';
  canvas.style.height = '100%';

  onSettled(() => {
    const offscreenCanvas = canvas.transferControlToOffscreen();
    worker.postMessage({ type: 'canvas', canvas: offscreenCanvas }, [offscreenCanvas]);

    return () => {
      worker.terminate();
    };
  });

  const resize = createWindowSize();

  createTrackedEffect(() => {
    worker.postMessage({ type: 'resize', width: resize.width, height: resize.height });
  });

  return { canvas, worker };
}
