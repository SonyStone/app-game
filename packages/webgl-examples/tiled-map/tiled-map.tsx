import * as m3 from '@app-game/math/m3';
import { toRadian } from '@packages/ogl/extras/path/utils';
import { createProgram } from '@app-game/webgl/createProgram';
import { createWebGL2Context } from '@packages/webgl/webgl-objects/context';
import { createEventListener } from '@solid-primitives/event-listener';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, onMount } from 'solid-js';
import { INSTANCES, PLANE, PLANE_WIREFRAME_INDICES } from './plane-mesh';
import solidFragSource from './solid.frag?raw';
import solidVertSource from './solid.vert?raw';
import { createIndexBuffer, createInstanceBuffer, createVao, createVertexBuffer } from './utils';
import wireframeFragSource from './wireframe.frag?raw';
import wireframeVertSource from './wireframe.vert?raw';

// should use Uniform Buffer Object for Camera
// should use Vertex Array Object for geometry
// should use Geometry Instancing

export default function TiledMap() {
  const canvas = (
    <canvas id="canvas" class="z-2 pointer-events-none relative h-full w-full touch-none border border-black" />
  ) as HTMLCanvasElement;

  const gl = createWebGL2Context(canvas);
  const [cameraPan, setCameraPan] = createSignal([-gl.canvas.width / 2, -gl.canvas.height / 2]);
  const [zoom, setZoom] = createSignal(1); // Zoom factor (1 = no zoom)
  const [rotation, setRotation] = createSignal(toRadian(0)); // Rotation in radians

  const resize = createWindowSize();
  createEffect(() => {
    gl.canvas.width = resize.width;
    gl.canvas.height = resize.height;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  });

  const solidPassConfig = {
    program: createProgram(gl, solidVertSource, solidFragSource),
    vao: createVao(gl, () => {
      createVertexBuffer(gl, PLANE);
      createIndexBuffer(gl, PLANE);
      createInstanceBuffer(gl, INSTANCES);
    })
  };

  const wireframePassConfig = {
    program: createProgram(gl, wireframeVertSource, wireframeFragSource),
    vao: createVao(gl, () => {
      createVertexBuffer(gl, PLANE);
      createIndexBuffer(gl, { ...PLANE, indices: PLANE_WIREFRAME_INDICES });
      createInstanceBuffer(gl, INSTANCES);
    })
  };

  const camera = (() => {
    // Create camera UBO (3x3 matrix: 9 floats)
    const buffer = gl.createBuffer();
    const bindingPoint = 0;

    // We'll update camera data per frame. For now, create a dummy buffer of size 9 floats.
    gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
    // std140 padding
    // 3x3 matrix is 4x3 in std140
    gl.bufferData(gl.UNIFORM_BUFFER, 4 * 3 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, buffer);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);

    return { buffer };
  })();

  // std140 padding
  const cameraMatrix = new Float32Array(12);

  onMount(() => {
    setCameraPan([-gl.canvas.width / 2, -gl.canvas.height / 2]);

    createEventListener(window, 'wheel', (event) => {
      setZoom((prev) => prev + event.deltaY * 0.0001);
    });
    let isDown = false;
    createEventListener(window, 'pointerdown', () => {
      isDown = true;
    });
    createEventListener(window, 'pointerup', () => {
      isDown = false;
    });
    createEventListener(window, 'pointermove', (event: PointerEvent) => {
      if (!isDown) {
        return;
      }
      if (event.altKey) {
        setRotation((prev) => prev + event.movementX * 0.01);
      } else {
        setCameraPan((prev) => [prev[0] - event.movementX, prev[1] + event.movementY]);
      }
    });

    createEffect(() => {
      m3.camera2D(zoom(), rotation(), cameraPan(), resize.width, resize.height, cameraMatrix);
      gl.bindBuffer(gl.UNIFORM_BUFFER, camera.buffer);
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, cameraMatrix);
      gl.bindBuffer(gl.UNIFORM_BUFFER, null);

      render();
    });
  });

  const render = () => {
    gl.clearColor(0.9, 0.9, 0.9, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(solidPassConfig.program);
    gl.bindVertexArray(solidPassConfig.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, PLANE.indices.length, gl.UNSIGNED_SHORT, 0, INSTANCES.numInstances);
    gl.bindVertexArray(null);

    gl.useProgram(wireframePassConfig.program);
    gl.bindVertexArray(wireframePassConfig.vao);
    gl.drawElementsInstanced(gl.LINES, PLANE_WIREFRAME_INDICES.length, gl.UNSIGNED_SHORT, 0, INSTANCES.numInstances);
    gl.bindVertexArray(null);
  };

  return (
    <>
      <div class="z-3 pointer-events-none absolute inset-x-0 top-0 p-1">
        <div class="shadow-blueGray  w-600px  pointer-events-auto flex max-w-full flex-col gap-1 rounded bg-white p-2 shadow">
          <span>WebGL Tiled Map / Chunk-Based Rendering</span>
        </div>
      </div>
      {canvas}
    </>
  );
}
