import { Renderer } from '@packages/ogl';
import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { makePersisted } from '@solid-primitives/storage';
import { createEffect, createSignal, onMount, untrack } from 'solid-js';
import { SquareComponent } from '../brush-example/square/square.component';
import { hexToRgb, normalizedToRgb, rgbToHex } from '../brush-example/utils/color-functions';
import { createPointerEvents } from './apply-pointer-events';
import { createBrushStroke } from './brush-stroke';
import { drawTestZigZagStrokePoints } from './zig-zag-stroke';

export default function CanvasPaint() {
  const canvasEl = (<canvas class="touch-none" />) as HTMLCanvasElement;
  const canvas = canvasEl;

  const renderer = new Renderer({ dpr: 1, canvas, alpha: false, premultipliedAlpha: false });
  const gl = renderer.gl;

  const resize = createWindowSize();
  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
  });

  const [brushColor, setBrushColor] = makePersisted(
    createSignal<[number, number, number]>(normalizedToRgb([0.27, 0.66, 0.93])),
    {
      storage: sessionStorage,
      name: 'brushColor'
    }
  );

  const brushStroke = createBrushStroke({
    gl,
    brushColor,
    size: () => [canvas.clientWidth, canvas.clientHeight],
    renderer
  });

  const [updateOnEvent, setUpdateOnEvent] = makePersisted(createSignal(false), {
    storage: sessionStorage,
    name: 'updateOnEvent'
  });

  const pointerEvents = createPointerEvents();

  onMount(async () => {
    makeEventListener(canvasEl, 'pointerdown', (e: PointerEvent) => {
      if (e.pressure === 0 || e.buttons !== 1) {
        return;
      }
      let x = e.clientX;
      let y = e.clientY;

      brushStroke.add([x, y], e.pressure);
    });
    makeEventListener(canvasEl, 'pointermove', (e: PointerEvent) => {
      const events = e.getCoalescedEvents();
      if (events.length === 0) {
        events.push(e);
      }
      for (const event of events) {
        if (e.pressure === 0 || e.buttons !== 1) {
          continue;
        }
        let x = event.clientX;
        let y = event.clientY;

        brushStroke.add([x, y], e.pressure);

        if (untrack(updateOnEvent)) {
          brushStroke.render(true);
        }
      }
    });

    makeEventListener(canvasEl, 'pointerup', (e) => {
      brushStroke.end();
      if (untrack(updateOnEvent)) {
        brushStroke.render(false);
      }
    });

    await pointerEvents.apply(canvasEl);
  });

  const [, start, stop] = createRAF((t?: number | any) => {
    if (!untrack(updateOnEvent)) {
      brushStroke.render();
    }
  });
  createEffect(() => {
    updateOnEvent() ? stop() : start();
  });
  start();

  return (
    <>
      <div class="absolute bottom-2 start-2 flex flex-col bg-white px-1">
        <button onClick={() => setUpdateOnEvent(!untrack(updateOnEvent))}>
          update on "{updateOnEvent() ? 'event' : 'requestAnimationFrame'}"
        </button>
        <label for="brush-color-select">Brush Color:</label>
        <input
          id="brush-color-select"
          name="brushColor"
          type="color"
          value={rgbToHex(brushColor())}
          onInput={(e) => setBrushColor(hexToRgb((e.target as any).value))}
        />
        <div class="flex flex-wrap gap-4">
          <button
            onClick={() => {
              brushStroke.clear();
              brushStroke.render(true);
            }}
          >
            Clear
          </button>
          <button
            onClick={() => {
              drawTestZigZagStrokePoints(gl, brushStroke);
            }}
          >
            Test Stroke
          </button>
        </div>
      </div>
      {canvasEl}
      <SquareComponent gl={gl} parent={brushStroke.scene} texture={brushStroke.layer()} zIndex={0.9} />
      <pre class="absolute right-0 top-0 bg-white">Brush</pre>
      <SquareComponent
        gl={gl}
        parent={brushStroke.scene}
        position={{ top: 0.9, bottom: 0.5, left: 0.5, right: 0.9 }}
        texture={brushStroke.brushTexture.texture}
        zIndex={0.1}
        transparent
      />
      <pre class="top-25% absolute right-0 bg-white">Brush Stroke</pre>
      <SquareComponent
        gl={gl}
        parent={brushStroke.scene}
        position={{ top: 0.4, bottom: 0, left: 0.5, right: 0.9 }}
        texture={brushStroke.brushStrokeTexture.texture}
        zIndex={0.2}
        transparent
      />
      <pre class="top-50% absolute right-0 bg-white">Swap Read</pre>
      <SquareComponent
        gl={gl}
        parent={brushStroke.scene}
        position={{ top: -0.1, bottom: -0.5, left: 0.5, right: 0.9 }}
        texture={brushStroke.swapBuffers.read.texture}
        zIndex={0.3}
        transparent
      />
      <pre class="top-75% absolute right-0 bg-white">Swap Write</pre>
      <SquareComponent
        gl={gl}
        parent={brushStroke.scene}
        position={{ top: -0.6, bottom: -1, left: 0.5, right: 0.9 }}
        texture={brushStroke.swapBuffers.write.texture}
        zIndex={0.4}
        transparent
      />
      {/* <PlaneWithTextureComponent gl={gl} parent={scene} texture={renderTarget.texture} /> */}
      {/* <Brush2Component gl={gl} brushScene={brushScene} position={brushPos()} /> */}
    </>
  );
}
