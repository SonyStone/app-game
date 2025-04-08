import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, onCleanup, onMount } from 'solid-js';
import OffscreenCanvasWorker from './offscreen-canvas.worker?worker';

export function useOffscreenCanvas() {
  const canvas = (<canvas class="touch-none"></canvas>) as HTMLCanvasElement;

  // ! important to use Worker to offload the main thread
  const worker = new OffscreenCanvasWorker();

  canvas.style.width = '100%';
  canvas.style.height = '100%';

  onMount(() => {
    const offscreenCanvas = canvas.transferControlToOffscreen();
    worker.postMessage({ type: 'canvas', canvas: offscreenCanvas }, [offscreenCanvas]);

    onCleanup(() => {
      worker.terminate();
    });
  });

  const resize = createWindowSize();

  createEffect(() => {
    worker.postMessage({ type: 'resize', width: resize.width, height: resize.height });
  });

  return { canvas, worker };
}
