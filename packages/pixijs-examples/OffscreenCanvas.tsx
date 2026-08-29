import { createEventListener } from '@solid-primitives/event-listener';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { useRouteMatches } from '@solidjs/router';
import { JSX } from '@solidjs/web/jsx-runtime';
import { createTrackedEffect, omit, onCleanup, onSettled } from 'solid-js';

export function OffscreenCanvas(props: { worker: Worker } & JSX.CanvasHTMLAttributes<HTMLCanvasElement>) {
  const others = omit(props, 'worker');

  {
    const matches = useRouteMatches();
    createTrackedEffect(() => {
      props.worker.postMessage({ type: 'route match', route: matches()[matches().length - 1]?.route.originalPath });
    });
  }

  const canvasEl = (<canvas {...others} />) as HTMLCanvasElement;

  {
    const size = createWindowSize();
    createTrackedEffect(() => {
      props.worker.postMessage({ type: 'resize', width: size.width, height: size.height });
    });
  }

  createEventListener(
    () => canvasEl,
    'pointerdown',
    (event) => {
      const e = event as PointerEvent;
      props.worker.postMessage({
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
    }
  );

  onSettled(() => {
    // should be mounted before use
    const canvas = canvasEl.transferControlToOffscreen();
    // takes way more time to render
    props.worker.postMessage({ type: 'canvas', canvas }, [canvas]);
  });

  onCleanup(() => {
    props.worker.terminate();
  });

  return canvasEl;
}
