import { createEffect, onMount } from 'solid-js';

import { makeEventListener } from '@solid-primitives/event-listener';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createPointerEvents } from '../canvas-paint/apply-pointer-events';
import Worker from './offscreen-canvas-paint.worker?worker';

export default function OffscreenCanvasPaint() {
  const canvas = (<canvas class="touch-none" />) as HTMLCanvasElement;
  const worker = new Worker();

  const pointerEvents = createPointerEvents();

  onMount(async () => {
    // should be mounted before use
    const offscreenCanvas = canvas.transferControlToOffscreen();
    // takes way more time to render
    worker.postMessage({ canvas: offscreenCanvas, type: 'canvas' }, [offscreenCanvas]);

    onMount(() => {
      makeEventListener(canvas, 'pointermove', (e: PointerEvent) => {
        const events = e.getCoalescedEvents();
        if (events.length === 0) {
          events.push(e);
        }
        for (const event of events) {
          worker.postMessage({
            type: 'pointermove',
            event: {
              pressure: event.pressure,
              buttons: event.buttons,
              x: event.clientX,
              y: event.clientY
            }
          });
        }
      });

      makeEventListener(canvas, 'pointerup', (event: PointerEvent) => {
        worker.postMessage({
          type: 'pointerup',
          event: {
            pressure: event.pressure,
            buttons: event.buttons,
            x: event.clientX,
            y: event.clientY
          }
        });
      });
    });

    await pointerEvents.apply(canvas);
  });

  const resize = createWindowSize();
  createEffect(() => {
    worker.postMessage({ resize, type: 'resize' });
    setSize(resize.width, resize.height, canvas);
  });

  return <>{canvas}</>;
}

const setSize = (width: number, height: number, canvas: HTMLCanvasElement): void => {
  if (!canvas.style) {
    return;
  }
  Object.assign(canvas.style, {
    width: width + 'px',
    height: height + 'px'
  });
};
