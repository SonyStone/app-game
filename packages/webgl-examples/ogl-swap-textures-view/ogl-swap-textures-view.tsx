import { Camera, GridHelper, Orbit, Renderer, Transform, Vec3 } from '@packages/ogl';
import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { makePersisted } from '@solid-primitives/storage';
import { Show, createEffect, createResource, createSignal } from 'solid-js';

import { RenderTargetOptions } from '@packages/ogl/core/render-target';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import { BlendModes } from './blend-modes';
import { createBlendRenderTarget } from './blend/blend-render-target';
import { createBrushInstancingRenderTarget } from './brush-instancing/brush-instancing';
import { createBrushRenderTarget } from './brush/brush-render-target';
import { createLayersRenderTarget } from './layers/layers-render-target';
import { PlaneWithTextureComponent } from './plane-with-texture.component';
import large_red_bricks_diff_1k from './swap/large_red_bricks_diff_1k.jpg?url';
import { createSwapRenderTarget } from './swap/swap-render-target';
import { createColorTexture } from './utils/black-texture';
import { loadTextureAsync } from './utils/load-texture';

export default function OglSwapTexturesView() {
  const canvas = (<canvas />) as HTMLCanvasElement;

  const renderer = new Renderer({ dpr: 2, canvas });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const MOVE_BACK = 2;
  const [position, setPosition] = makePersisted(createSignal<Vec3Tuple>([0.3 * MOVE_BACK, 0.5, 0.6 * MOVE_BACK]), {
    storage: sessionStorage,
    name: 'cameraPosition',
    serialize: (v) => JSON.stringify(v.map((v) => +v.toFixed(3)))
  });
  const [target, setTtarget] = makePersisted(createSignal<Vec3Tuple>([0, 0.3, 0]), {
    storage: sessionStorage,
    name: 'cameraTarget',
    serialize: (v) => JSON.stringify(v.map((v) => +v.toFixed(3)))
  });
  const camera = (() => {
    const camera = new Camera({ fov: 35 });
    camera.position.copy(position());
    return camera;
  })();
  const targetVec3 = new Vec3().copy(target());
  const controls = new Orbit(camera, { element: canvas, target: targetVec3 });
  const scene = new Transform();

  {
    const resize = createWindowSize();
    createEffect(() => {
      renderer.setSize(resize.width, resize.height);
      camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
    });
  }

  {
    const grid = new GridHelper(gl, { size: 10, divisions: 10 });
    grid.setParent(scene);
  }

  let prev = 0;
  const [, start] = createRAF((t: number) => {
    controls.update();
    const next = Math.floor(t / 1000);
    if (prev !== next) {
      prev = next;
      setTtarget(controls.target);
      setPosition(camera.position);
    }
    gl.clearColor(1, 1, 1, 0);
    renderer.render({ scene, camera });
  });
  start();

  const [blendMode, setBlendMode] = createSignal(BlendModes.NORMAL);
  const [transparent, setTransparent] = createSignal(false);
  const [opacity, setOpacity] = createSignal(1.0);
  const [instancedCount, setInstancedCount] = createSignal(300);

  const renderTargetOptions: Partial<RenderTargetOptions> = {
    width: 1024,
    height: 1024,
    type: GL_DATA_TYPE.HALF_FLOAT,
    format: gl.RGBA,
    internalFormat: gl.RGBA16F,
    depth: false
  };

  const bg = createColorTexture(gl, [10, 30, 70]);
  const [redBricks] = createResource(() => loadTextureAsync(gl, large_red_bricks_diff_1k), { initialValue: bg });
  const brush = createBrushRenderTarget({ gl, options: renderTargetOptions });
  const layers = createLayersRenderTarget({ gl, texture: brush.texture, options: renderTargetOptions });
  const swap = createSwapRenderTarget({ gl, options: renderTargetOptions });
  const brushInstancing = createBrushInstancingRenderTarget({
    gl,
    texture: brush.texture,
    instancedCount,
    options: renderTargetOptions
  });
  const layers2 = createBlendRenderTarget({
    gl,
    texture1: redBricks,
    texture2: brushInstancing.texture,
    blendMode,
    opacity,
    refresh: instancedCount,
    options: renderTargetOptions
  });

  return (
    <>
      {canvas}
      <PlaneWithTextureComponent gl={gl} parent={scene} position={[-1, 0.5, 0.0]} texture={swap.texture} />
      <PlaneWithTextureComponent gl={gl} parent={scene} position={[0, 0.5, 0.0]} texture={layers.texture} />
      <PlaneWithTextureComponent gl={gl} parent={scene} position={[1, 0.5, 0.0]} texture={brush.texture} transparent />
      <PlaneWithTextureComponent gl={gl} parent={scene} position={[1, 0.5, -0.1]} texture={bg} transparent />
      <PlaneWithTextureComponent
        gl={gl}
        parent={scene}
        position={[0, 1.6, 0.0]}
        texture={brushInstancing.texture}
        transparent
      />
      <PlaneWithTextureComponent gl={gl} parent={scene} position={[-1, 1.6, 0.0]} texture={layers2.texture} />
      <Show when={false}>
        <></>
      </Show>
      <div class="absolute bottom-0 start-0 flex flex-col border bg-white p-2">
        <button onClick={() => setTransparent(!transparent())}>toggle</button>
        <div>
          <label for="blend-mode-select">Choose a BlendMode:</label>
          <select
            id="blend-mode-select"
            onChange={(e) => {
              setBlendMode(+e.currentTarget.value as BlendModes);
            }}
          >
            <option value={BlendModes.NORMAL}>Noraml</option>
            <option value={BlendModes.MULTIPLY}>Multiply</option>
            <option value={BlendModes.SCREEN}>Screen</option>
            <option value={BlendModes.OVERLAY}>Overlay</option>
          </select>
        </div>

        <label for="opacity-select">Opacity:</label>
        <input
          id="opacity-select"
          name="opacity"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={opacity()}
          onInput={(e) => setOpacity(parseFloat((e.target as any).value))}
        />
        <label for="instanced-count-select">Instanced Count: {instancedCount()}</label>
        <input
          id="instanced-count-select"
          name="instancedCount"
          type="range"
          min={0}
          max={500}
          step={1}
          value={instancedCount()}
          onInput={(e) => setInstancedCount(parseFloat((e.target as any).value))}
        />
      </div>
    </>
  );
}
