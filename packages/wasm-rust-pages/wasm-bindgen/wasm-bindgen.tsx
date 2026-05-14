import { createEventListener } from '@solid-primitives/event-listener';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, onMount } from 'solid-js';
import { AppWebGL, greet } from './wasm_bindgen/pkg/wasm_bindgen_example';

export default function WasmBindgen() {
  const canvas = (<canvas class="h-[80vh] max-w-full touch-none" tabIndex={0} />) as HTMLCanvasElement;

  const [App, setApp] = createSignal<AppWebGL | null>(null);

  createEffect(() => {
    const app = App();
    if (app) {
      app.render();

      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      createResizeObserver(canvas as unknown as Element, ({ width, height }) => app.resize(width, height));
      createEventListener(canvas as unknown as EventTarget, 'pointerdown', (event) => app.on_pointer_down(event as PointerEvent));
      createEventListener(canvas as unknown as EventTarget, 'pointerenter', (event) => app.on_pointer_enter(event as PointerEvent));
      createEventListener(canvas as unknown as EventTarget, 'pointerleave', (event) => app.on_pointer_leave(event as PointerEvent));
      createEventListener(canvas as unknown as EventTarget, 'pointermove', (event) => app.on_pointer_move(event as PointerEvent));
      createEventListener(canvas as unknown as EventTarget, 'pointerup', (event) => app.on_pointer_up(event as PointerEvent));
      createEventListener(canvas as unknown as EventTarget, 'wheel', (event) => {
        app.on_wheel(event as WheelEvent);
        event.preventDefault();
      });
      app.init();
    }
  });

  onMount(async () => {
    setApp(await AppWebGL.new(canvas));
  });

  return (
    <div class="flex flex-col gap-1 px-1">
      <h1>Wasm Bindgen</h1>
      <span>HTML DOM from WASM Rust:</span>
      {greet('World')}
      <span>WebGL from WASM Rust:</span>
      {canvas}
    </div>
  );
}
