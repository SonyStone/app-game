import {
  Camera,
  Geometry,
  GridHelper,
  Mesh,
  Orbit,
  Program,
  RenderTarget,
  Renderer,
  Transform,
  Vec3
} from '@packages/ogl';
import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { makePersisted } from '@solid-primitives/storage';
import { createEffect, createSignal } from 'solid-js';

import { Attribute } from '@packages/ogl/core/geometry';
import { Square } from '@packages/ogl/extras/square';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import { GL_CONST } from '@packages/webgl/static-variables/static-variables';
import { makeEventListener } from '@solid-primitives/event-listener';
import fragmentEdge from './edge-detection.frag?raw';
import vertexEdge from './edge-detection.vert?raw';
import fragment from './lasso-line-fill.frag?raw';
import vertex from './lasso-line.vert?raw';

export default function LassoSelectExample() {
  const canvas = (<canvas class="touch-none" />) as HTMLCanvasElement;

  const renderer = new Renderer({ dpr: 2, canvas });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const [position, setPosition] = makePersisted(createSignal<Vec3Tuple>([0.3 * 2, 0.5, 0.6 * 2]), {
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
  const controls = new Orbit(camera, { target: targetVec3 });
  const scene = new Transform();

  const resize = createWindowSize();
  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  {
    const grid = new GridHelper(gl, { size: 10, divisions: 10 });
    grid.setParent(scene);
  }

  const lasso = (() => {
    const points = {
      size: 2,
      data: new Float32Array(64 * 2),
      usage: gl.STREAM_DRAW,
      needsUpdate: true,
      count: 0
    } as Attribute;
    const geometry = new Geometry(gl, {
      position: points
    });
    // Expand the points array if necessary
    const expandPoints = () => {
      if (pointCount >= points.data.length / 2) {
        const newPoints = new Float32Array(points.data.length * 2);
        newPoints.set(points.data);
        points.data = newPoints;
        // set as isNewBuffer to true to force the buffer to be recreated
        // points.buffer = undefined as any;
        points.needsUpdate = true;
      }
    };
    // Add the new point
    const addPoint = (e: PointerEvent) => {
      points.data[pointCount * 2] = (e.clientX / gl.canvas.clientWidth) * 2 - 1;
      points.data[pointCount * 2 + 1] = (1 - e.clientY / gl.canvas.clientHeight) * 2 - 1;
      pointCount++;
      points.needsUpdate = true;
      points.count = pointCount;
      geometry.setDrawRange(0, pointCount);
    };
    const uTime = { value: 0 };
    const select = { value: true };
    const program = new Program(gl, {
      vertex,
      fragment,
      cullFace: false,
      uniforms: {
        uTime,
        select
      }
    });

    const [meshMode, setMeshMode] = createSignal(GL_CONST.TRIANGLE_FAN);

    const mesh = new Mesh(gl, {
      geometry,
      program,
      mode: meshMode()
    });

    let isDrawing = false;
    let pointCount = 0;

    makeEventListener(window, 'pointerdown', (e) => {
      if (e.button !== 0) return;

      isDrawing = true;
      pointCount = 0;
      points.data.fill(0);

      controls.enabled = false;

      if (e.altKey) {
        select.value = false;
      } else {
        select.value = true;
      }

      addPoint(e);
    });

    makeEventListener(window, 'pointermove', (e) => {
      if (!isDrawing) {
        return;
      }

      expandPoints();
      addPoint(e);
    });

    makeEventListener(window, 'pointerup', () => {
      isDrawing = false;
      controls.enabled = true;
    });

    return {
      mesh,
      uTime,
      meshMode,
      setMeshMode
    };
  })();

  const edge = (() => {
    const renderTarget = new RenderTarget(gl, {
      width: gl.canvas.width,
      height: gl.canvas.height,
      type: GL_DATA_TYPE.HALF_FLOAT,
      format: GL_CONST.RGBA,
      internalFormat: GL_CONST.RGBA16F,
      depth: false
    });

    const uTime = { value: 0 };
    const u_texture = { value: renderTarget.texture };
    const u_textureSize = { value: [renderTarget.width, renderTarget.height] };

    createEffect(() => {
      const width = gl.canvas.width;
      const height = gl.canvas.height;
      renderTarget.setSize(width, height);
      u_textureSize.value = [width, height];
    });

    const geometry = new Square(gl);
    const program = new Program(gl, {
      vertex: vertexEdge,
      fragment: fragmentEdge,
      cullFace: false,
      uniforms: {
        uTime,
        u_texture,
        u_textureSize
      },
      transparent: true
    });

    const mesh = new Mesh(gl, {
      geometry,
      program
    });

    return {
      mesh,
      renderTarget,
      uTime
    };
  })();

  let prev = 0;
  const [, start, stop] = createRAF((t: number) => {
    controls.update();
    const next = Math.floor(t / 1000);
    if (prev !== next) {
      prev = next;
      setTtarget(controls.target);
      setPosition(camera.position);
    }
    gl.clearColor(1, 1, 1, 0);
    renderer.render({ scene, camera });
    lasso.uTime.value = t * 0.001;
    lasso.mesh.mode = lasso.meshMode();
    edge.uTime.value = t * 0.001;
    gl.renderer.render({
      scene: lasso.mesh,
      target: edge.renderTarget,
      clear: false
    });
    gl.renderer.render({
      scene: edge.mesh,
      clear: false
    });
  });
  start();

  return (
    <>
      {canvas}
      <div class="absolute bottom-0 end-0 flex flex-col border bg-white p-2">
        <div>
          <label for="blend-mode-select">Mesh Mode:</label>
          <select
            id="blend-mode-select"
            onChange={(e) => {
              lasso.setMeshMode(+e.currentTarget.value);
            }}
          >
            <option value={GL_CONST.TRIANGLE_FAN}>TRIANGLE_FAN</option>
            <option value={GL_CONST.LINE_LOOP}>LINE_LOOP</option>
          </select>
        </div>
      </div>
    </>
  );
}
