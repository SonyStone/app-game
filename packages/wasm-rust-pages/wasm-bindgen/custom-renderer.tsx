import { onMount } from 'solid-js';
import { App } from './wasm_bindgen/libs/custom-renderer-examples/pkg/custom_renderer_examples';

export default function CustomRenderer() {
  const canvas = (<canvas class="h-[80vh] max-w-full touch-none" tabIndex={0} />) as HTMLCanvasElement;

  onMount(() => {
    App.new(canvas);
  });

  return (
    <div class="flex flex-col gap-1 px-1">
      <h1>New Custom Renderer for WebGL2</h1>
      {canvas}
    </div>
  );
}
