import { SphereComponent } from '@packages/math-examples/camera-projection-webgl2/sphere.component';
import { createRaycast } from '@packages/math-examples/raycast';
import {
  Camera,
  GridHelper,
  Mesh,
  Orbit,
  Plane,
  RenderTarget,
  Renderer,
  SwapBuffering,
  Texture,
  Transform,
  Vec3
} from '@packages/ogl';
import { TextureProgram } from '@packages/ogl/extras/texture-program';
import { createTimer } from '@packages/utils/timeout';
import { createTexture4colors } from '@packages/webgl-examples/ogl-model-viewer/texture-4-colors';
import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, onMount } from 'solid-js';
import { BlendModes, ColorBlendModes } from '../brush-example/blend-modes';
import { BlendMesh } from '../brush-example/blend/blend-mesh';
import { BrushStrokeMesh } from '../brush-example/brush-instancing/brush-stroke-mesh';
import { BrushMesh } from '../brush-example/brush/brush-mesh';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../brush-example/defaults';
import { normalizedToRgb, rgbToNormalized } from '../brush-example/utils/color-functions';
import { easeInCirc } from '../brush-example/utils/curve-shaping-functions';
import { TextureMesh } from '../brush-example/utils/texture-to-render-target/texture-mesh';
import { mouseNormalize } from '../paint-ogl-1/mouse-normalize';
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
  const camera = new Camera({ aspect: gl.canvas.width / gl.canvas.height, near: 0.001 });
  camera.position.set(0, 0, 0.6);
  camera.lookAt([0, 0, 0]);
  const controls = new Orbit(camera);

  const resize = createWindowSize();
  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
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
  const plane = (() => {
    const plane = new Plane(gl, { width: 0.5, height: 0.5 });
    const tMap = { value: backgroundTextTexture };
    const mesh = new Mesh(gl, {
      geometry: plane,
      program: new TextureProgram(gl, {
        uniforms: {
          tMap
        }
      })
    });
    scene.addChild(mesh);

    return {
      setTexture(texture: Texture) {
        tMap.value = texture;
      }
    };
  })();

  const grid = new GridHelper(gl, { size: 10, divisions: 10 });
  grid.position.y = -0.001; // shift down a little to avoid z-fighting with axes helper
  grid.setParent(scene);

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
  createEffect(() => {
    plane.setTexture(targetTexture());
  });

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

  const [brushPos, setBrushPos] = createSignal<Vec3>(new Vec3(), { equals: false });
  const raycast = createRaycast({ camera: camera, plane: [0, 0, 1] });

  const [, start, stop] = createRAF((t?: number | any) => {
    // render();
    // controls.update();
    renderer.render({ scene, camera });
  });
  start();

  onMount(async () => {
    makeEventListener(canvasEl, 'pointerdown', (e: PointerEvent) => {
      if (e.pressure === 0 || e.buttons !== 1) {
        return;
      }
      let x = e.clientX;
      let y = e.clientY;

      const intersectPoint = raycast.cast(mouseNormalize(e, gl.canvas));
      if (intersectPoint) {
        setBrushPos(intersectPoint);
      }
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

        const intersectPoint = raycast.cast(mouseNormalize(event, gl.canvas));
        if (intersectPoint) {
          setBrushPos(intersectPoint);
        }
      }
    });

    makeEventListener(canvasEl, 'pointerup', (e) => {});

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
        render(true);
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
  });

  return (
    <>
      {canvasEl}
      {/* <SquareComponent gl={gl} parent={scene} texture={targetTexture()} zIndex={0} transparent={true} /> */}
      <SphereComponent gl={gl} scene={scene} position={brushPos()} radius={0.01} />
    </>
  );
}
