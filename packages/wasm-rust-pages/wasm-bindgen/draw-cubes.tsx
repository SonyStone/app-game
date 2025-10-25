import { createResizeObserver } from '@solid-primitives/resize-observer';
import { createSignal, onMount } from 'solid-js';
import { App } from './wasm_bindgen/libs/from-webgl-state-diagram/draw-cubes/pkg/draw_cubes';
import { App as App2 } from './wasm_bindgen/libs/from-webgl-state-diagram/samplers/pkg/samplers';

export default function FromWebglStateDiagram() {
  return (
    <>
      <DrawCubes />
      <Samplers />
    </>
  );
}

function DrawCubes() {
  const canvas = (<canvas class="h-[80vh] max-w-full touch-none" tabIndex={0} />) as HTMLCanvasElement;
  const [frameTook, setFrameTook] = createSignal<number>(0);

  onMount(() => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const app = App.new(canvas);
    app.render();

    const update = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      const now = performance.now();
      app.render();
      setFrameTook(performance.now() - now);
    };

    createResizeObserver(
      () => canvas,
      () => {
        update();
      }
    );

    // const [, start] = createRAF(() => {
    //   update();
    // });
    // start();
  });

  return (
    <>
      <div class="flex flex-col gap-1 px-1">
        <a href="https://webgl2fundamentals.org/webgl/lessons/resources/webgl-state-diagram.html#no-help">
          webgl2fundamentals
        </a>
        <h1>DrawCubes but in Rust!</h1>
        <div>Frame took: {frameTook().toFixed(2)} milliseconds.</div>
        {canvas}
      </div>
    </>
  );
}

function Samplers() {
  const canvas = (<canvas class="h-[80vh] max-w-full touch-none" tabIndex={0} />) as HTMLCanvasElement;
  const [frameTook, setFrameTook] = createSignal<number>(0);

  onMount(() => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const app = App2.new(canvas);
    app.render();

    const update = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      const now = performance.now();
      app.render();
      setFrameTook(performance.now() - now);
    };

    createResizeObserver(
      () => canvas,
      () => {
        update();
      }
    );
  });

  return (
    <div class="flex flex-col gap-1 px-1">
      <a href="https://webgl2fundamentals.org/webgl/lessons/resources/webgl-state-diagram.html#no-help">
        webgl2fundamentals
      </a>
      <h1>DrawCubes but in Rust!</h1>
      <div>Frame took: {frameTook().toFixed(2)} milliseconds.</div>
      {canvas}
    </div>
  );
}
