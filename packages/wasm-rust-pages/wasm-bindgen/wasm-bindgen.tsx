import { createEffect, createSignal, onSettled } from 'solid-js';
import { AppWebGL, greet } from './wasm_bindgen/pkg/wasm_bindgen_example';

export default function WasmBindgen() {
  const canvas = (<canvas class="h-[80vh] max-w-full touch-none" tabindex={0} />) as HTMLCanvasElement;

  const [App, setApp] = createSignal<AppWebGL | null>(null);

  createEffect(App, (app) => {
    if (!app) return;

    app.render();

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) app.resize(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserver.observe(canvas);

    const listeners = {
      pointerdown: (event: Event) => app.on_pointer_down(event as PointerEvent),
      pointerenter: (event: Event) => app.on_pointer_enter(event as PointerEvent),
      pointerleave: (event: Event) => app.on_pointer_leave(event as PointerEvent),
      pointermove: (event: Event) => app.on_pointer_move(event as PointerEvent),
      pointerup: (event: Event) => app.on_pointer_up(event as PointerEvent),
      wheel: (event: Event) => {
        app.on_wheel(event as WheelEvent);
        event.preventDefault();
      }
    } satisfies Record<string, EventListener>;

    for (const [type, listener] of Object.entries(listeners)) canvas.addEventListener(type, listener);
    app.init();

    return () => {
      resizeObserver.disconnect();
      for (const [type, listener] of Object.entries(listeners)) canvas.removeEventListener(type, listener);
    };
  });

  onSettled(() => {
    void (async () => {
      setApp(await AppWebGL.new(canvas));
    })();
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
