import { DEG_TO_RAD } from '@webgl/math/constants';
import * as m4 from '@webgl/math/mut-m4';
import * as v3 from '@webgl/math/mut-v3';
import { setFromSpherical, Spherical } from '@webgl/math/spherical';
import { GL_CLEAR_MASK, GL_DRAW_ARRAYS_MODE } from '@webgl/static-variables';
import { Accessor, createEffect, onCleanup, onMount, Setter } from 'solid-js';

import { useStats } from '../../../Stats.provider';
import { createMouseRotate } from './create-mouse-rotate';
import { createMouseWheelZoom } from './create-mouse-wheel-zoom';
import { createImage } from './image/create-image';
import { createWireframe } from './wireframe/create-wireframe';

interface Camera {
  orthographicProjection: m4.Mat4;
  perspectiveProjection: m4.Mat4;
  projection: m4.Mat4;
  // transform: m4.Mat4,
  inversePosition: m4.Mat4;
  offset: v3.Vec3;
  target: v3.Vec3;
  spherical: Spherical;
}

export interface Context {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;

  viewportWidth: number;
  viewportHeight: number;

  renderTime: number;
  renderDeltaTime: number;

  transition: Accessor<number>;

  camera: Accessor<Camera>;
  setCamera: Setter<Camera>;
}

export function Main(prop: { ctx: Context }) {
  let id: number;

  window.dispatchEvent(new Event('resize'));
  const ctx = prop.ctx;
  const gl = ctx.gl;
  const camera = ctx.camera();

  const box = [
    0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5,
    0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5,
    0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5,
    -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5,
  ];

  const shader = createWireframe(gl, box, [1, 0, 1]);

  function makeBox(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number
  ) {
    const m = m4.identity();
    m4.translate(m, [x, y, z]);
    m4.scale(m, [w, h, d]);

    return applyMatToPoints(m, box);
  }
  /*
	Dims: (mtrs)
		Room:
			w1.62 x d.1.82 x h2.79
		Deep Shelves:
			1. d0.60 x w0.80
			2. d0.60 x w0.80
		Shallow Shelf:
			1. d0.23 x w0.90
	*/

  const room = makeBox(1.62, 2.79, 1.82, 0.0, 1.395, 0.0);
  const washingMashine = makeBox(0.6, 0.85, 0.6, -0.41, 0.425, -0.51);
  const roomDoor = makeBox(0.7, 2.0, 0.2, 0.81 - 0.35 - 0.02, 1.0, 1.01);
  const balconyDoor = makeBox(0.2, 2.0, 0.7, 0.91, 1.0, -0.51 + 0.46);
  const rails: any[] = [];
  const shelves: any[] = [];

  // north west
  rails.push(makeBox(0.01, 1.8, 0.02, -0.805, 1.5, -0.79));
  rails.push(makeBox(0.01, 1.8, 0.02, -0.805, 1.5, -0.19));
  shelves.push(makeBox(0.6, 0.02, 0.8, -0.49, 1.0, -0.49));
  shelves.push(makeBox(0.6, 0.02, 0.8, -0.49, 1.4, -0.49));
  shelves.push(makeBox(0.6, 0.02, 0.8, -0.49, 2.0, -0.49));

  // south west
  rails.push(makeBox(0.01, 1.8, 0.02, -0.805, 1.5, 0.31 - 0.2));
  rails.push(makeBox(0.01, 1.8, 0.02, -0.805, 1.5, 0.31 + 0.2));
  shelves.push(makeBox(0.6, 0.02, 0.8, -0.49, 1.0, 0.31));
  shelves.push(makeBox(0.6, 0.02, 0.8, -0.49, 1.4, 0.31));
  shelves.push(makeBox(0.6, 0.02, 0.8, -0.49, 2.0, 0.31));

  // north east
  rails.push(makeBox(0.02, 1.8, 0.01, 0.21 - 0.3, 1.5, -0.905));
  rails.push(makeBox(0.02, 1.8, 0.01, 0.21 + 0.3, 1.5, -0.905));
  shelves.push(makeBox(0.8, 0.02, 0.23, 0.21, 2.0, -0.775));
  shelves.push(makeBox(0.8, 0.02, 0.23, 0.21, 1.4, -0.775));
  shelves.push(makeBox(0.8, 0.02, 0.23, 0.21, 1.0, -0.775));

  // camera box
  const camera_box = applyMatToPoints(m4.identity(), box);
  const camera_m = m4.identity();

  function updateCamera(value: number) {
    // Update Camera Position
    m4.lookAt(camera.inversePosition, camera.offset, camera.target, up);
    m4.inverse(camera.inversePosition);

    shader.camera.set(camera.inversePosition);

    // Update Camera Projection
    setOrthographicProjection(camera.orthographicProjection, gl.canvas);
    setPerspectiveProjection(camera.perspectiveProjection, gl.canvas);
    m4.transition(
      camera.projection,
      camera.orthographicProjection,
      camera.perspectiveProjection,
      value
    );

    m4.identity(camera_m);
    m4.multiply(camera_m, camera.projection);
    m4.multiply(camera_m, camera.inversePosition);

    return camera_m;
  }

  const element: HTMLElement = ctx.canvas;

  const { radius, setRadius } = createMouseWheelZoom(element);
  const { theta, setTheta, phi, setPhi } = createMouseRotate(element);

  setRadius(camera.spherical.radius);
  setPhi(camera.spherical.phi);
  setTheta(camera.spherical.theta);

  createEffect(() => {
    camera.spherical.radius = radius();
    camera.spherical.phi = phi();
    camera.spherical.theta = theta();
    setFromSpherical(camera.offset, camera.spherical);
  });

  const up = v3.create(0, 1, 0);

  const stats = useStats();

  onMount(async () => {
    const shaderImage = await createImage(gl);
    // await new Promise((res) => setTimeout(() => res(0), 1000));

    function render(context: Context) {
      const gl = context.gl;

      gl.clearColor(0.0, 0.0, 0.0, 1);
      gl.clear(GL_CLEAR_MASK.COLOR_BUFFER_BIT);

      updateViewportSize(ctx);
      gl.viewport(0, 0, ctx.viewportWidth, ctx.viewportHeight);

      shader.camera.set(updateCamera(ctx.transition()));

      drawPoints(gl, shader, room, [0.3, 0.3, 0.3]);
      drawPoints(gl, shader, roomDoor, [0.7, 0.7, 0.7]);
      drawPoints(gl, shader, balconyDoor, [0.7, 0.7, 0.7]);

      shelves.forEach((shelf) =>
        drawPoints(gl, shader, shelf, [0.3, 0.8, 0.8])
      );

      rails.forEach((rail) => drawPoints(gl, shader, rail, [0.8, 0.3, 0.8]));

      drawPoints(gl, shader, camera_box, [0.2, 1, 0.1]);
      shaderImage.bind();
      shader.camera.set(updateCamera(ctx.transition() / 2));
      drawPoints(gl, shader, washingMashine, [0.6, 0.1, 0.1]);

      drawPoints(gl, shader, camera_box, [0.2, 1, 0.1]);
      shader.camera.set(updateCamera(0));
      drawPoints(gl, shader, camera_box, [0.2, 1, 0.1]);

      gl.flush();
    }

    function handleRaf(time: number) {
      id = requestAnimationFrame(handleRaf);

      stats.begin();

      ctx.renderTime = time;
      ctx.renderDeltaTime = (time - ctx.renderTime) * 0.001;

      render(ctx);
      ctx.setCamera(camera);

      stats.end();
    }

    handleRaf(0);
  });

  onCleanup(() => {
    cancelAnimationFrame(id);
  });

  return <></>;
}

function drawPoints(
  gl: WebGL2RenderingContext,
  shader: any,
  points: number[],
  color: number[]
) {
  shader.aPosition.set(new Float32Array(points));
  shader.uColor.set(color);

  shader.bind();

  gl.drawArrays(
    GL_DRAW_ARRAYS_MODE.LINE_STRIP,
    0,
    shader.aPosition.value.length / 3
  );
}

function applyMatToPoints(
  mat: number[] | Float32Array,
  points: number[],
  r?: number[]
) {
  r = r || [];
  const v = [];
  for (let i = 0; i < points.length; i += 3) {
    v[0] = points[i + 0];
    v[1] = points[i + 1];
    v[2] = points[i + 2];
    m4.transformPoint(v, mat);
    r[i + 0] = v[0];
    r[i + 1] = v[1];
    r[i + 2] = v[2];
  }
  return r;
}

// WebGL Helpers
function updateViewportSize(context: Context) {
  const gl = context.gl;
  if (
    context.viewportWidth !== gl.drawingBufferWidth ||
    context.viewportHeight !== gl.drawingBufferHeight
  ) {
    context.viewportWidth = gl.drawingBufferWidth;
    context.viewportHeight = gl.drawingBufferHeight;
  }
}
function drawQuad(gl: WebGL2RenderingContext) {
  gl.drawArrays(GL_DRAW_ARRAYS_MODE.TRIANGLE_STRIP, 0, 4);
}

/**
 * @param m __mut__
 * @param canvas
 */
function setOrthographicProjection(m: m4.Mat4, canvas: HTMLCanvasElement) {
  const near = -5000.1;
  const far = 2000;

  const size = 600;
  const left = -canvas.clientWidth / size;
  const right = canvas.clientWidth / size;
  const bottom = -canvas.clientHeight / size;
  const top = canvas.clientHeight / size;

  m4.ortho(m, left, right, bottom, top, near, far);
}

/**
 * @param m __mut__
 * @param canvas
 */
function setPerspectiveProjection(m: m4.Mat4, canvas: HTMLCanvasElement) {
  const fov = 60 * DEG_TO_RAD;
  const near = 0.1;
  const far = 2000;
  const aspect = canvas.clientWidth / canvas.clientHeight;

  m4.perspective(m, fov, aspect, near, far);
}
