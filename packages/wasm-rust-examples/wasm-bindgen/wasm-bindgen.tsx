import { createEventListener } from '@solid-primitives/event-listener';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, onMount } from 'solid-js';
import { AppWebGL, greet } from './wasm_bindgen/pkg/wasm_bindgen_example';

export default function WasmBindgen() {
  const canvas = (<canvas class="h-5xl max-w-full touch-none" tabIndex={0} />) as HTMLCanvasElement;

  const [App, setApp] = createSignal<AppWebGL | null>(null);

  createEffect(() => {
    const app = App();
    if (app) {
      app.render();

      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      createResizeObserver(canvas, ({ width, height }) => app.resize(width, height));
      createEventListener(canvas, 'pointerdown', (event) => app.on_pointer_down(event));
      createEventListener(canvas, 'pointerenter', (event) => app.on_pointer_enter(event));
      createEventListener(canvas, 'pointerleave', (event) => app.on_pointer_leave(event));
      createEventListener(canvas, 'pointermove', (event) => app.on_pointer_move(event));
      createEventListener(canvas, 'pointerup', (event) => app.on_pointer_up(event));
      createEventListener(canvas, 'wheel', (event) => {
        app.on_wheel(event);
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
