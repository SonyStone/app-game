import { RenderTarget, Renderer, SwapBuffering, Transform } from '@packages/ogl';
import { createTimer } from '@packages/utils/timeout';
import { createTexture4colors } from '@packages/webgl-examples/ogl-model-viewer/texture-4-colors';
import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, onMount } from 'solid-js';
import { BlendModes, ColorBlendModes } from '../brush-example/blend-modes';
import { BlendMesh } from '../brush-example/blend/blend-render-target';
import { BrushStrokeMesh } from '../brush-example/brush-instancing/create-brush-instancing';
import { BrushMesh } from '../brush-example/brush/brush-mesh';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../brush-example/defaults';
import { SquareComponent } from '../brush-example/square/square.component';
import { normalizedToRgb, rgbToNormalized } from '../brush-example/utils/color-functions';
import { easeInCirc } from '../brush-example/utils/curve-shaping-functions';
import { TextureMesh } from '../brush-example/utils/texture-to-render-target/texture-mesh';
import { createInterpoletePoints } from './utils-point-interpolation';
import { pointToCanvasPoint } from './utils-point-position';
import { createZigZagPoints } from './zig-zag-stroke';

const TIMEOUT = 10; // ms

/**
 * This file is final.
 * Is is showing how to paint on canvas using brush texture, brush stroke with instansing and custom blend with swap buffer.
 */
export default function CanvasPaintStepByStep() {
  const canvasEl = (<canvas class="touch-none" />) as HTMLCanvasElement;
  const canvas = canvasEl;

  const renderer = new Renderer({ dpr: 1, canvas, alpha: false, premultipliedAlpha: false });
  const gl = renderer.gl;

  const resize = createWindowSize();
  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
  });

  const scene = new Transform();

  // ! background
  const backgroundTextTexture = createTexture4colors(
    gl,
    [255 * 0.1, 255 * 0.1, 255 * 0.1, 255],
    [0, 255 * 0.4, 0, 255],
    [255 * 0.8, 0, 0, 255],
    [0, 0, 255 * 0.4, 255]
  );
  const backgroundMesh = new TextureMesh(gl, { texture: backgroundTextTexture });

  // ! brush spot
  const brushSpotMesh = new BrushMesh(gl);
  const brushColor = normalizedToRgb([0.27, 0.66, 0.93]);
  brushSpotMesh.setColor(rgbToNormalized(brushColor));
  const brushTexture = new RenderTarget(gl, { ...DEFAULTS_RENDER_TARGET_OPTIONS, id: '🖼️brush' });

  // ! brush stroke
  const brushStrokeMesh = new BrushStrokeMesh(gl);
  const brushStrokeTexture = new RenderTarget(gl, { ...DEFAULTS_RENDER_TARGET_OPTIONS, id: '🖼️brush-stroke' });
  brushStrokeMesh.setBrushTexture(brushTexture.texture);
  brushStrokeMesh.setBrushColor(rgbToNormalized(brushColor));

  // ! blend and swap
  const swapBuffers = new SwapBuffering(gl, DEFAULTS_RENDER_TARGET_OPTIONS);
  const blendMesh = new BlendMesh(gl);
  blendMesh.setBlendMode(BlendModes.NORMAL);
  blendMesh.setColorBlendMode(ColorBlendModes.USING_GAMMA);
  blendMesh.setOpacity(1);
  blendMesh.setTexture1(swapBuffers.read.texture);
  blendMesh.setTexture2(brushStrokeTexture.texture);

  const timeout = createTimer();

  const [targetTexture, setTargetTexture] = createSignal(swapBuffers.write.texture);

  // for requestAnimationFrame to not render two times
  let needsUpdate = false;
  let instance = 0;

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
    renderer.render({ scene }); // render scene
  };

  const interpoletePoints = createInterpoletePoints();

  const [, start, stop] = createRAF((t?: number | any) => {
    render();
    renderer.render({ scene });
  });
  start();

  onMount(async () => {
    backgroundMesh.render(swapBuffers.read);
    await timeout(TIMEOUT);
    backgroundMesh.render(swapBuffers.write);

    await timeout(TIMEOUT);

    brushSpotMesh.render(brushTexture);

    brushStrokeMesh.setBrushSpot(0, pointToCanvasPoint([300, 300], gl.canvas.clientWidth, gl.canvas.clientHeight), 1);
    brushStrokeMesh.setInstancedCount(1);
    markForUpdate();
    render(true);

    await timeout(TIMEOUT);

    brushStrokeMesh.setBrushSpot(0, pointToCanvasPoint([300, 320], gl.canvas.clientWidth, gl.canvas.clientHeight), 1);
    brushStrokeMesh.setInstancedCount(1);
    markForUpdate();
    render(true);

    await timeout(TIMEOUT);

    brushStrokeMesh.setBrushSpot(0, pointToCanvasPoint([300, 340], gl.canvas.clientWidth, gl.canvas.clientHeight), 1);
    brushStrokeMesh.setInstancedCount(1);
    markForUpdate();
    render(true);

    await timeout(TIMEOUT);

    const points = createZigZagPoints([gl.canvas.clientWidth, gl.canvas.clientHeight])
      .map((point) => interpoletePoints(point))
      .flat()
      .map((point, i) => [point[0], point[1], i]);

    console.log(`🎨 points`, points.length);

    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      brushStrokeMesh.setBrushSpot(
        instance,
        pointToCanvasPoint(point, gl.canvas.clientWidth, gl.canvas.clientHeight),
        easeInCirc(index / points.length)
      );
      brushStrokeMesh.setInstancedCount(instance);
      instance++;

      markForUpdate();
      if (index % 10 === 0) {
        await timeout(TIMEOUT);
      }
    }

    render(true);
    await timeout(TIMEOUT);

    brushStrokeMesh.setBrushSpot(0, pointToCanvasPoint([300, 360], gl.canvas.clientWidth, gl.canvas.clientHeight), 1);
    brushStrokeMesh.setInstancedCount(1);
    render(true);

    await timeout(TIMEOUT);

    brushStrokeMesh.setBrushSpot(0, pointToCanvasPoint([300, 380], gl.canvas.clientWidth, gl.canvas.clientHeight), 1);
    brushStrokeMesh.setInstancedCount(1);
    render(true);

    await timeout(TIMEOUT);

    stop();
    console.log(`🎨 done`);
  });

  console.clear();

  return (
    <>
      {canvasEl}
      <SquareComponent gl={gl} parent={scene} texture={targetTexture()} zIndex={0.9} />
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
    </>
  );
}
