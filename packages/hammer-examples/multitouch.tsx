import { HammerInput, createPointerEventsHandler } from '@packages/hammer/pointerevent';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, onCleanup } from 'solid-js';

export default function Multitouch() {
  const canvas = (<canvas class="touch-none"></canvas>) as HTMLCanvasElement;

  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const ctx = canvas.getContext('2d')!;

  const resize = createWindowSize();

  const [inputS, setInputS] = createSignal<HammerInput | undefined>(undefined);

  createEffect(() => {
    canvas.width = resize.width;
    canvas.height = resize.height;
  });

  const pointerEventsHandler = createPointerEventsHandler();

  function pointerdownHandler(event: PointerEvent) {
    event.preventDefault();
    setInputS(pointerEventsHandler(event));
  }
  function pointermoveHandler(event: PointerEvent) {
    event.preventDefault();
    const input = pointerEventsHandler(event);
    setInputS(input);

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const point of input.pointers) {
      ctx.beginPath();
      ctx.ellipse(point[0], point[1], 30, 30, 0, 0, Math.PI * 2, false);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(point[0], point[1]);
      ctx.lineTo(input.center[0], input.center[1]);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(input.start[0], input.start[1]);
    ctx.lineTo(input.center[0], input.center[1]);
    ctx.stroke();
  }
  function pointerupHandler(event: PointerEvent) {
    event.preventDefault();
    setInputS(pointerEventsHandler(event));
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  window.addEventListener('pointerdown', pointerdownHandler);
  window.addEventListener('pointermove', pointermoveHandler);
  window.addEventListener('pointerup', pointerupHandler);
  window.addEventListener('pointerleave', pointerupHandler);
  window.addEventListener('pointercancel', pointerupHandler);

  onCleanup(() => {
    window.removeEventListener('pointerdown', pointerdownHandler);
    window.removeEventListener('pointermove', pointermoveHandler);
    window.removeEventListener('pointerup', pointerupHandler);
    window.removeEventListener('pointerleave', pointerupHandler);
    window.removeEventListener('pointercancel', pointerupHandler);
  });

  return (
    <>
      <div class="fixed pointer-events-none">
        <pre>{JSON.stringify(inputS(), null, 2)}</pre>
      </div>
      {canvas}
    </>
  );
}
