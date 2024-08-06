import { createWindowSize } from '@solid-primitives/resize-observer';
import { For, createEffect, createSignal, onMount, untrack } from 'solid-js';

import { RenderTarget, Renderer, Transform } from '@packages/ogl';

import { Vec2Tuple } from '@packages/math';
import { SwapBuffering } from '@packages/ogl/extras/swap-buffering';
import { createTimer } from '@packages/utils/timeout';
import { createTexture4colors } from '@packages/webgl-examples/ogl-model-viewer/texture-4-colors';
import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import { makePersisted } from '@solid-primitives/storage';
import { Key } from 'ts-keycode-enum';
import { BlendModes, ColorBlendModes } from '../brush-example/blend-modes';
import { BlendMesh } from '../brush-example/blend/blend-render-target';
import { BrushStrokeMesh } from '../brush-example/brush-instancing/create-brush-instancing';
import { BrushMesh } from '../brush-example/brush/brush-mesh';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../brush-example/defaults';
import { SquareComponent } from '../brush-example/square/square.component';
import { hexToRgb, normalizedToRgb, rgbToHex, rgbToNormalized } from '../brush-example/utils/color-functions';
import { TextureMesh } from '../brush-example/utils/texture-to-render-target/texture-mesh';
import { createPointerEventsHandler } from './create-pointer-events-handler';
import { pointToCanvasPoint } from './utils-point-position';
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

  const scene = new Transform();

  console.clear();

  const [brushColor, setBrushColor] = makePersisted(
    createSignal<[number, number, number]>(normalizedToRgb([0.27, 0.66, 0.93])),
    {
      storage: sessionStorage,
      name: 'brushColor'
    }
  );

  const brushTexture = new RenderTarget(gl, { ...DEFAULTS_RENDER_TARGET_OPTIONS, id: '🖼️brush' });
  const brushStrokeTexture = new RenderTarget(gl, { ...DEFAULTS_RENDER_TARGET_OPTIONS, id: '🖼️brush-stroke' });
  const swapBuffers = new SwapBuffering(gl, DEFAULTS_RENDER_TARGET_OPTIONS);
  const backgroundTextTexture = createTexture4colors(
    gl,
    [255 * 0.1, 255 * 0.1, 255 * 0.1, 255],
    [0, 255 * 0.4, 0, 255],
    [255 * 0.8, 0, 0, 255],
    [0, 0, 255 * 0.4, 255]
  );

  const background = (() => {
    const mesh = new TextureMesh(gl, { texture: backgroundTextTexture });
    mesh.render(swapBuffers.read);
    const clear = () => {
      mesh.render(swapBuffers.read);
      mesh.render(swapBuffers.write);
    };

    return { clear };
  })();

  // creates and renderer brush texture
  // ! brush spot texture
  {
    const spotMesh = new BrushMesh(gl);
    createEffect(() => {
      spotMesh.setColor(rgbToNormalized(brushColor()));
      spotMesh.render(brushTexture);
      console.log('1️⃣ rendering brush texture', brushTexture.id);
    });
  }

  // creates swap buffer to merge brush stroke with brush strokes

  // ! creates brush stroke
  // ! mixes brush stroke with background
  const brushStroke = (() => {
    const strokeMesh = new BrushStrokeMesh(gl);
    const blendMesh = new BlendMesh(gl);

    let needsUpdate = { value: true };

    const [layer, setLayer] = createSignal(swapBuffers.write, { equals: () => false });

    const render = {
      brushStroke() {
        // if (!needsUpdate.value) {
        //   return;
        // }

        strokeMesh.setBrushTexture(brushTexture.texture);
        strokeMesh.setBrushColor(rgbToNormalized(untrack(brushColor)));
        strokeMesh.render(brushStrokeTexture);
        console.groupCollapsed('2️⃣ brush stroke');
        console.log(' rendering ', brushStrokeTexture.id);
        console.trace();
        console.groupEnd();
        // needsUpdate.value = false;
      },
      blend() {
        // if (!needsUpdate.value) {
        //   return;
        // }

        blendMesh.setBlendMode(BlendModes.NORMAL);
        blendMesh.setColorBlendMode(ColorBlendModes.USING_GAMMA);
        blendMesh.setTexture1(swapBuffers.read.texture);
        blendMesh.setTexture2(brushStrokeTexture.texture);
        blendMesh.render(swapBuffers.write);
        console.groupCollapsed('3️⃣ blending');
        console.log('🎨 rendering', blendMesh.id);
        console.trace();
        console.groupEnd();
        // needsUpdate.value = false;
      },
      render() {
        render.brushStroke();
        render.blend();
      }
    };

    const clearBrushStroke = () => {
      strokeMesh.clear(brushStrokeTexture);
    };

    let index = 0;
    let prev: Vec2Tuple | undefined;
    let prevOpacity: number | undefined;
    const [instancedCount, setInstancedCount] = createSignal(0);

    const jsutSwap = () => {
      index = 0;
      prev = undefined;
      prevOpacity = undefined;
      swapBuffers.swap();

      // needsUpdate.value = true;
    };

    const swap = () => {
      index = 0;
      prev = undefined;
      prevOpacity = undefined;
      render.brushStroke();
      render.blend();
      swapBuffers.swap();
      clearBrushStroke();
      setLayer(swapBuffers.read);

      // setLayer(swapBuffers.write);
      // needsUpdate.value = true;
    };

    const end = () => {
      index = 0;
      render.brushStroke();
      render.blend();

      swapBuffers.swap();
      setLayer(swapBuffers.write);
      needsUpdate.value = true;
    };

    const swapCheck = () => {
      if (index > 3000) {
        index = 0;
        // renderBrushStroke();
        render.blend();
        // swapBuffers.swap();
        setLayer(swapBuffers.write);
        // needsUpdate.value = true;
      }
    };

    const setPoint = (point: Vec2Tuple, opacity: number) => {
      swapCheck();
      strokeMesh.setBrushSpot(index, point, opacity);
      strokeMesh.setInstancedCount(index + 1);
      setInstancedCount(index + 1);
      index++;
    };

    const add = (point: Vec2Tuple, opacity: number) => {
      if (prev && prevOpacity !== undefined) {
        const dist = Math.sqrt(Math.pow(point[0] - prev[0], 2) + Math.pow(point[1] - prev[1], 2));
        const angle = Math.atan2(point[1] - prev[1], point[0] - prev[0]);

        for (let i = 0; i < dist; i++) {
          let point = [prev[0] + i * Math.cos(angle), prev[1] + i * Math.sin(angle)];
          let tempOpacity = prevOpacity + (opacity - prevOpacity) * (i / dist);
          point = pointToCanvasPoint(point, gl.canvas.clientWidth, gl.canvas.clientHeight);
          setPoint(point, tempOpacity);
        }
      } else {
        setPoint(pointToCanvasPoint(point, gl.canvas.clientWidth, gl.canvas.clientHeight), opacity);
      }

      prev = point;
      prevOpacity = opacity;
      needsUpdate.value = true;
    };

    return {
      clear: clearBrushStroke,
      render: render.render,
      add: add,
      swap: jsutSwap,
      apply: swap,
      // needsUpdate,
      layer: layer,
      end: end,
      instancedCount: instancedCount
    };
  })();
  // ! end

  const timeout = createTimer();

  const [updateOnEvent, setUpdateOnEvent] = makePersisted(createSignal(false), {
    storage: sessionStorage,
    name: 'updateOnEvent'
  });

  onMount(async () => {
    createPointerEventsHandler({
      brushStroke,
      element: canvasEl,
      updateOnEvent
    });

    drawTestZigZagStrokePoints(gl, brushStroke);

    makeEventListener(document, 'keydown', (e) => {
      if (e.keyCode === Key.Space) {
        brushStroke.swap();
      }
    });

    // applyPointerEvents(canvasEl);
  });

  const [, start] = createRAF((t?: number | any) => {
    if (!untrack(updateOnEvent)) {
      brushStroke.render();
    }
    renderer.render({ scene });
  });
  start();

  const [targetLayer, setTargetLayer] = createSignal(untrack(brushStroke.layer).texture);

  return (
    <>
      <pre class="absolute start-2 top-2 bg-white px-1">{brushStroke.instancedCount()}</pre>
      <div class="absolute bottom-2 start-2 flex flex-col bg-white px-1">
        <button onClick={() => setUpdateOnEvent(!untrack(updateOnEvent))}>
          update on "{updateOnEvent() ? 'event' : 'requestAnimationFrame'}"
        </button>
        <SelectLayer
          options={[
            {
              name: 'Brush Spot',
              onSelect: () => {
                setTargetLayer(brushTexture.texture);
              }
            },
            {
              name: 'Brush Stroke',
              onSelect: () => {
                setTargetLayer(brushStrokeTexture.texture);
              }
            },
            {
              name: 'Swap Buffer Write',
              onSelect: () => {
                setTargetLayer(swapBuffers.write.texture);
              }
            },
            {
              name: 'Swap Buffer Read',
              onSelect: () => {
                setTargetLayer(swapBuffers.read.texture);
              }
            },
            {
              name: 'Result',
              onSelect: () => {
                setTargetLayer(untrack(brushStroke.layer).texture);
              }
            }
          ]}
        />
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
              background.clear();
            }}
          >
            Clear
          </button>
          <button
            onClick={() => {
              brushStroke.clear();
            }}
          >
            Clear Brush Stroke
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
      <SquareComponent gl={gl} parent={scene} texture={targetLayer()} zIndex={0.9} />
      <pre class="absolute right-0 top-0 bg-white">Brush</pre>
      <SquareComponent
        gl={gl}
        parent={scene}
        position={{ top: 0.9, bottom: 0.5, left: 0.5, right: 0.9 }}
        texture={brushTexture.texture}
        zIndex={0.1}
        transparent
      />
      <pre class="top-25% absolute right-0 bg-white">Brush Stroke</pre>
      <SquareComponent
        gl={gl}
        parent={scene}
        position={{ top: 0.4, bottom: 0, left: 0.5, right: 0.9 }}
        texture={brushStrokeTexture.texture}
        zIndex={0.2}
        transparent
      />
      <pre class="top-50% absolute right-0 bg-white">Swap Read</pre>
      <SquareComponent
        gl={gl}
        parent={scene}
        position={{ top: -0.1, bottom: -0.5, left: 0.5, right: 0.9 }}
        texture={swapBuffers.read.texture}
        zIndex={0.3}
        transparent
      />
      <pre class="top-75% absolute right-0 bg-white">Swap Write</pre>
      <SquareComponent
        gl={gl}
        parent={scene}
        position={{ top: -0.6, bottom: -1, left: 0.5, right: 0.9 }}
        texture={swapBuffers.write.texture}
        zIndex={0.4}
        transparent
      />
      {/* <PlaneWithTextureComponent gl={gl} parent={scene} texture={renderTarget.texture} /> */}
      {/* <Brush2Component gl={gl} brushScene={brushScene} position={brushPos()} /> */}
    </>
  );
}

const SelectLayer = (props: { options: { name: string; onSelect(): void }[] }) => {
  return (
    <fieldset>
      <legend>Select layer:</legend>

      <For each={props.options}>
        {({ name, onSelect }) => (
          <div class="flex gap-1">
            <input
              type="radio"
              id={name}
              name="layer"
              value={name}
              onChange={(e) => {
                onSelect();
              }}
            />
            <label for={name}>{name}</label>
          </div>
        )}
      </For>
    </fieldset>
  );
};
