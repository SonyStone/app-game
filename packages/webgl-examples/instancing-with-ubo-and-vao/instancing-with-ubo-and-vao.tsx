import * as m4 from '@packages/math/m4';
import { createProgram } from '@packages/webgl/createProgram';
import { createWebGL2Context } from '@packages/webgl/webgl-objects/context';
import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, untrack } from 'solid-js';
import { effect } from 'solid-js/web';
import { BYTE, CUBE, CUBE_WIREFRAME_INDICES, INSTANCES } from './cube-mesh';
import fragmentShaderSource from './shader.frag?raw';
import vertexShaderSource from './shader.vert?raw';
import wireframeFragmentShaderSource from './wireframe.frag?raw';
import wireframeVertexShaderSource from './wireframe.vert?raw';

// should use Uniform Buffer Object for Camera
// should use Vertex Array Object for geometry
// should use Geometry Instancing

export default function InstancingWithUBOandVAO() {
  const canvas = (
    <canvas id="canvas" class="z-2 pointer-events-none relative h-full w-full touch-none border border-black" />
  ) as HTMLCanvasElement;

  const resize = createWindowSize();

  const [numInstances, setNumInstances] = createSignal(INSTANCES.instances.numInstances / 4);
  const [depthTest, setDepthTest] = createSignal(true);
  const [wireframe, setWireframe] = createSignal(false);
  const [solid, setSolid] = createSignal(true);
  const [aspect, setAspect] = createSignal(1);
  const [ultrawideFix, setUltrawideFix] = createSignal(false);
  const [fov, setFov] = createSignal(45);

  const gl = createWebGL2Context(canvas);

  createEffect(() => {
    gl.canvas.width = resize.width;
    gl.canvas.height = resize.height;
    setAspect(gl.canvas.width / gl.canvas.height);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  });

  // console.clear();
  const solidPass = (() => {
    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    {
      // Geometry Buffer
      const buffer = gl.createBuffer();
      gl.bindBuffer(CUBE.geometry.target, buffer);
      gl.bufferData(CUBE.geometry.target, CUBE.vertex, CUBE.geometry.usage);
      for (const point of CUBE.vertexAttribPointers) {
        gl.enableVertexAttribArray(point.index);
        gl.vertexAttribPointer(point.index, point.size, point.type, point.normalize, point.stride, point.offset);
      }
    }
    {
      // Element Buffer
      const buffer = gl.createBuffer();
      gl.bindBuffer(CUBE.element.target, buffer);
      gl.bufferData(CUBE.element.target, CUBE.indices, CUBE.element.usage);
    }
    {
      // Instance Buffer
      const buffer = gl.createBuffer();
      gl.bindBuffer(INSTANCES.instance.target, buffer);
      gl.bufferData(INSTANCES.instance.target, INSTANCES.instances.data, INSTANCES.instance.usage);
      for (const point of INSTANCES.instanceAttribPointers) {
        gl.enableVertexAttribArray(point.index);
        gl.vertexAttribPointer(point.index, point.size, point.type, point.normalize, point.stride, point.offset);
        gl.vertexAttribDivisor(point.index, point.divisor);
      }
    }
    gl.bindVertexArray(null);

    return { program, vao };
  })();

  const wireframePass = (() => {
    const program = createProgram(gl, wireframeVertexShaderSource, wireframeFragmentShaderSource);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    {
      // Geometry Buffer
      const buffer = gl.createBuffer();
      gl.bindBuffer(CUBE.geometry.target, buffer);
      gl.bufferData(CUBE.geometry.target, CUBE.vertex, CUBE.geometry.usage);
      for (const point of CUBE.vertexAttribPointers) {
        gl.enableVertexAttribArray(point.index);
        gl.vertexAttribPointer(point.index, point.size, point.type, point.normalize, point.stride, point.offset);
      }
    }
    {
      // Element Buffer
      const buffer = gl.createBuffer();
      gl.bindBuffer(CUBE.element.target, buffer);
      gl.bufferData(CUBE.element.target, CUBE_WIREFRAME_INDICES, CUBE.element.usage);
    }
    {
      // Instance Buffer
      const buffer = gl.createBuffer();
      gl.bindBuffer(INSTANCES.instance.target, buffer);
      gl.bufferData(INSTANCES.instance.target, INSTANCES.instances.data, INSTANCES.instance.usage);
      for (const point of INSTANCES.instanceAttribPointers) {
        gl.enableVertexAttribArray(point.index);
        gl.vertexAttribPointer(point.index, point.size, point.type, point.normalize, point.stride, point.offset);
        gl.vertexAttribDivisor(point.index, point.divisor);
      }
    }
    gl.bindVertexArray(null);

    return { program, vao };
  })();

  const camera = simpleCamera();

  const buffer = (() => {
    // Camera Uniform Buffer Object

    const blockIndex = gl.getUniformBlockIndex(solidPass.program, 'Camera');
    const bindingPoint = 0;

    gl.uniformBlockBinding(solidPass.program, blockIndex, bindingPoint);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
    gl.bufferData(gl.UNIFORM_BUFFER, 4 * 4 * BYTE, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);

    gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, buffer);

    return buffer;
  })();

  const setCamera = (time: number) => {
    time *= 0.0001;
    const viewProjection = camera(time, untrack(aspect), untrack(ultrawideFix), untrack(fov));
    gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, viewProjection, 0);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
  };

  effect(() => {
    if (depthTest()) {
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
    } else {
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
    }
  });

  const render = (time: number) => {
    setCamera(time);

    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. Normal solid pass
    if (untrack(solid)) {
      gl.useProgram(solidPass.program);
      gl.bindVertexArray(solidPass.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, CUBE.indices.length, gl.UNSIGNED_SHORT, 0, untrack(numInstances));
      gl.bindVertexArray(null);
    }

    // 2. Wireframe pass
    if (untrack(wireframe)) {
      gl.useProgram(wireframePass.program);
      gl.bindVertexArray(wireframePass.vao);
      gl.drawElementsInstanced(gl.LINES, CUBE_WIREFRAME_INDICES.length, gl.UNSIGNED_SHORT, 0, untrack(numInstances));
      gl.bindVertexArray(null);
    }
  };

  const [running, start, stop] = createRAF(render);

  start();

  return (
    <>
      <div class="z-3 pointer-events-none absolute inset-x-0 top-0 p-1">
        <div class="shadow-blueGray  w-600px  pointer-events-auto flex max-w-full flex-col gap-1 rounded bg-white p-2 shadow">
          <div class="flex gap-2">
            <input
              class="w-full"
              type="range"
              min={0}
              max={INSTANCES.instances.numInstances}
              value={numInstances()}
              onInput={(e) => setNumInstances(parseFloat(e.target.value))}
            ></input>
            <pre>{numInstances()}</pre>
          </div>
          <div class="flex w-full flex-wrap place-content-stretch gap-2">
            <button class="rounded border px-2 font-mono" onClick={() => (untrack(running) ? stop() : start())}>
              {running() ? 'Pause' : 'Play'}
            </button>
            <button class="flex-1 rounded border px-2 font-mono" onClick={() => setDepthTest(!depthTest())}>
              DEPTH_TEST {depthTest() ? 'enabled' : 'disabled'}
            </button>
            <button class="flex-1 rounded border px-2 font-mono" onClick={() => setSolid(!solid())}>
              solid {solid() ? 'enabled' : 'disabled'}
            </button>
            <button class="flex-1 rounded border px-2 font-mono" onClick={() => setWireframe(!wireframe())}>
              wireframe {wireframe() ? 'enabled' : 'disabled'}
            </button>
          </div>
          <button class="flex-1 rounded border px-2 font-mono" onClick={() => setUltrawideFix(!ultrawideFix())}>
            Ultrawide Fix {ultrawideFix() ? 'enabled' : 'disabled'}
          </button>
          <div class="flex w-full gap-2">
            <input
              class="w-full"
              type="range"
              min={10}
              max={130}
              value={fov()}
              onInput={(e) => setFov(parseFloat(e.target.value))}
            ></input>
            <pre>{fov()}</pre>
          </div>
        </div>
      </div>
      {canvas}
    </>
  );
}

function simpleCamera() {
  const projection = new Float32Array(16);
  const camera = new Float32Array(16);
  const view = new Float32Array(16);
  const viewProjection = new Float32Array(16);

  return (time: number = 0.5, aspect = 1, ultrawideFix = true, fov = 45) => {
    const a = aspect < 1 ? 1 / aspect : aspect;
    const fieldOfView = ultrawideFix ? ((fov / a) * Math.PI) / 180 : (fov * Math.PI) / 180;
    m4.perspective(projection, fieldOfView, aspect, 0.1, 500);
    const radius = 10;
    const eye = [Math.sin(time) * radius, Math.sin(time * 0.3) * radius * 0.6, Math.cos(time) * radius];
    const target = [0, 0, 0];
    const up = [0, 1, 0];

    m4.lookAt(camera, eye, target, up);
    m4.inverse(camera, view);

    m4.multiply(projection, view, viewProjection);

    return viewProjection;
  };
}
