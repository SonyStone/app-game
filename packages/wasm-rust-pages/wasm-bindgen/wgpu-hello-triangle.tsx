import { createResizeObserver } from '@solid-primitives/resize-observer';
import { onMount } from 'solid-js';
import { HelloTriangle } from './wasm_bindgen/libs/start_wgpu/pkg/start_wgpu';

export default function WgpuTest() {
  const canvas = (<canvas class="aspect-ratio-square max-w-full touch-none" />) as HTMLCanvasElement;

  createResizeObserver(canvas, ({ width, height }) => resize?.(width, height));

  let resize: (width: number, height: number) => void;

  onMount(async () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const app = await HelloTriangle.new(canvas);
    app.redraw();
    resize = () => app.resize(canvas.clientWidth, canvas.clientHeight);
  });

  return (
    <div class="flex flex-col gap-1 px-1">
      <span>WGPU from Rust:</span>
      {canvas}
    </div>
  );
}
