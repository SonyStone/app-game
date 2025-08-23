import { createEventListener } from '@solid-primitives/event-listener';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { useCurrentMatches } from '@solidjs/router';
import { createEffect, onCleanup, onMount, splitProps } from 'solid-js';
import { JSX } from 'solid-js/jsx-runtime';

export function OffscreenCanvas(props: { worker: Worker } & JSX.CanvasHTMLAttributes<HTMLCanvasElement>) {
  const [local, others] = splitProps(props, ['worker']);

  {
    const matches = useCurrentMatches();
    createEffect(() => {
      local.worker.postMessage({ type: 'route match', route: matches()[matches().length - 1]?.route.originalPath });
    });
  }

  const canvasEl = (<canvas {...others} />) as HTMLCanvasElement;

  {
    const size = createWindowSize();
    createEffect(() => {
      local.worker.postMessage({ type: 'resize', width: size.width, height: size.height });
    });
  }

  createEventListener(canvasEl, 'pointerdown', (e: PointerEvent) => {
    local.worker.postMessage({
      type: 'pointerdown',
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      pointerType: e.pointerType,
      isPrimary: e.isPrimary
    });
  });

  onMount(() => {
    // should be mounted before use
    const canvas = canvasEl.transferControlToOffscreen();
    // takes way more time to render
    local.worker.postMessage({ type: 'canvas', canvas }, [canvas]);
  });

  onCleanup(() => {
    local.worker.terminate();
  });

  return canvasEl;
}
