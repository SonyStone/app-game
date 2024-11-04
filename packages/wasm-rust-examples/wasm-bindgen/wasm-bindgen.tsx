import { createEventBus } from '@solid-primitives/event-bus';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import { onMount } from 'solid-js';
import { AppWebGL, greet, PointerEvent } from './wasm_bindgen/pkg/wasm_bindgen_example';

export default function WasmBindgen() {
  const canvas = (<canvas class="aspect-ratio-square max-w-full touch-none" tabIndex={0} />) as HTMLCanvasElement;

  createResizeObserver(canvas, ({ width, height }) => resize?.(width, height));
  let resize: (width: number, height: number) => void;

  const pointerEvents = createEventBus<PointerEvent>();

  onMount(async () => {
    const app = await AppWebGL.new(canvas);
    app.render();

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    resize = () => app.resize(canvas.clientWidth, canvas.clientHeight);

    pointerEvents.listen((event) => {
      app.on_pointer_down(event);
    });
  });

  return (
    <div class="flex flex-col gap-1 px-1">
      <h1>Wasm Bindgen</h1>
      <span>HTML DOM from Rust:</span>
      {greet('World')}
      <span>WebGL from Rust:</span>
      {canvas}
    </div>
  );
}
