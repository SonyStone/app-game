import { Vec2Tuple } from '@packages/math';
import { OGLRenderingContext, RenderTarget, Renderer, Transform } from '@packages/ogl';
import { SwapBuffering } from '@packages/ogl/extras/swap-buffering';
import { createTexture4colors } from '@packages/webgl-examples/ogl-model-viewer/texture-4-colors';
import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { makePersisted } from '@solid-primitives/storage';
import { Accessor, createEffect, createSignal, onMount, untrack } from 'solid-js';
import { BlendMesh } from '../brush-example/blend/blend-mesh';
import { BrushStrokeMesh } from '../brush-example/brush-instancing/create-brush-instancing';
import { BrushMesh } from '../brush-example/brush/brush-mesh';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../brush-example/defaults';
import { SquareComponent } from '../brush-example/square/square.component';
import { hexToRgb, normalizedToRgb, rgbToHex, rgbToNormalized } from '../brush-example/utils/color-functions';
import { TextureMesh } from '../brush-example/utils/texture-to-render-target/texture-mesh';
import { createPointerEvents } from './apply-pointer-events';
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

  const swapBuffers = new SwapBuffering(gl, DEFAULTS_RENDER_TARGET_OPTIONS);
  const background = createBackground({ gl, swapBuffers });
  background.render();

  // creates and renderer brush texture
  // ! brush spot texture
  const brushTexture = new RenderTarget(gl, { ...DEFAULTS_RENDER_TARGET_OPTIONS, id: '🖼️brush' });
  createSpotMesh({ gl, brushTexture, brushColor });

  // creates swap buffer to merge brush stroke with brush strokes

  const brushStrokeTexture = new RenderTarget(gl, { ...DEFAULTS_RENDER_TARGET_OPTIONS, id: '🖼️brush-stroke' });

  // ! creates brush stroke
  // ! mixes brush stroke with background
  const brushStroke = (() => {
    const brushStrokeMesh = new BrushStrokeMesh(gl);
    createEffect(() => {
      brushStrokeMesh.setBrushTexture(brushTexture.texture);
      brushStrokeMesh.setBrushColor(rgbToNormalized(brushColor()));
    });
    const blendMesh = new BlendMesh(gl);

    const [targetTexture, setTargetTexture] = createSignal(swapBuffers.write.texture, { equals: () => false });

    let instance = 0;
    let needsUpdate = false;
    const markForUpdate = () => {
      needsUpdate = true;
    };
    const render = (force?: boolean) => {
      if (force) {
        needsUpdate = true;
      }
      if (!needsUpdate) {
        return;
      }
      needsUpdate = false;
      brushStrokeMesh.render(brushStrokeTexture); // render brush stroke
      blendMesh.setTexture1(swapBuffers.read.texture);
      blendMesh.setTexture2(brushStrokeTexture.texture);
      blendMesh.render(swapBuffers.write); // blend swap read with brush stroke into swap write
      swapBuffers.swap(); // swap read with write
      instance = 0;
      setTargetTexture(swapBuffers.read.texture); // set scene target texture to swap read
      console.log('🖼️rendering scene target texture');
      renderer.render({ scene }); // render scene
    };

    const clearBrushStroke = () => {
      brushStrokeMesh.clear(brushStrokeTexture);
    };

    let prev: Vec2Tuple | undefined;
    let prevOpacity: number | undefined;
    const [instancedCount, setInstancedCount] = createSignal(0);

    const end = () => {
      instance = 0;
      swapBuffers.swap();
      needsUpdate = true;
    };

    const setPoint = (point: Vec2Tuple, opacity: number) => {
      brushStrokeMesh.setBrushSpot(instance, point, opacity);
      brushStrokeMesh.setInstancedCount(instance + 1);
      setInstancedCount(instance + 1);
      instance++;
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
      needsUpdate = true;
    };

    return {
      clear: clearBrushStroke,
      render: render,
      add: add,
      apply: () => {},
      // needsUpdate,
      layer: targetTexture,
      end: end,
      instancedCount: instancedCount
    };
  })();
  // ! end

  const [updateOnEvent, setUpdateOnEvent] = makePersisted(createSignal(false), {
    storage: sessionStorage,
    name: 'updateOnEvent'
  });

  const pointerEvents = createPointerEvents();

  onMount(async () => {
    createPointerEventsHandler({
      brushStroke,
      element: canvasEl,
      updateOnEvent
    });

    await pointerEvents.apply(canvasEl);

    brushStroke.render(true);
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
      <pre class="absolute start-2 top-2 bg-white px-1">{brushStroke.instancedCount()}</pre>
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
              background.clear();
              brushStroke.render(true);
            }}
          >
            Clear
          </button>
          <button
            onClick={() => {
              brushStroke.clear();
              brushStroke.render(true);
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
      <SquareComponent gl={gl} parent={scene} texture={brushStroke.layer()} zIndex={0.9} />
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

const createSpotMesh = ({
  gl,
  brushTexture,
  brushColor
}: {
  gl: OGLRenderingContext;
  brushTexture: RenderTarget;
  brushColor: Accessor<[number, number, number]>;
}) => {
  const spotMesh = new BrushMesh(gl);
  createEffect(() => {
    spotMesh.setColor(rgbToNormalized(brushColor()));
    spotMesh.render(brushTexture);
    console.log('1️⃣ rendering brush texture', brushTexture.id);
  });
};

const createBackground = ({ gl, swapBuffers }: { gl: OGLRenderingContext; swapBuffers: SwapBuffering }) => {
  const backgroundTextTexture = createTexture4colors(
    gl,
    [255 * 0.1, 255 * 0.1, 255 * 0.1, 255],
    [0, 255 * 0.4, 0, 255],
    [255 * 0.8, 0, 0, 255],
    [0, 0, 255 * 0.4, 255]
  );
  const mesh = new TextureMesh(gl, { texture: backgroundTextTexture });
  const render = () => {
    mesh.render(swapBuffers.read);
  };
  const clear = () => {
    mesh.render(swapBuffers.read);
    mesh.render(swapBuffers.write);
  };

  return { mesh, render, clear };
};
