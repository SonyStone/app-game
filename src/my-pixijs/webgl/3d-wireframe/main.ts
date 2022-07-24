import { DEG_TO_RAD } from '@webgl/math/constants';
import * as m4 from '@webgl/math/m4';
import { create, setFromSpherical, setFromVec3 } from '@webgl/math/spherical';
import { clamp } from '@webgl/math/utils/clamp';
import * as v2 from '@webgl/math/v2';
import * as v3 from '@webgl/math/v3';
import {
  GL_BUFFER_TYPE,
  GL_CLEAR_MASK,
  GL_DATA_TYPE,
  GL_DRAW_ARRAYS_MODE,
} from '@webgl/static-variables';
import { Accessor, createSignal, onCleanup } from 'solid-js';

import { useStats } from '../../../Stats.provider';
import fragmentShader from './frag_shader.frag?raw';
import { Shader } from './Shader';
import vertexShader from './vert_shader.vert?raw';

function createWireframe(
  gl: WebGL2RenderingContext,
  vertices: any[],
  color: any
) {
  return new Shader(gl, {
    vertexShader,
    fragmentShader,
    uniforms: {
      cameraPosition: {
        type: GL_DATA_TYPE.FLOAT_MAT4,
        value: m4.identity(),
      },
      cameraProjection: {
        type: GL_DATA_TYPE.FLOAT_MAT4,
        value: m4.identity(),
      },
      uColor: {
        type: GL_DATA_TYPE.FLOAT_VEC3,
        value: color,
      },
    },
    attributes: {
      aPosition: {
        type: GL_BUFFER_TYPE.ARRAY_BUFFER,
        itemSize: 3,
        itemCount: vertices.length / 3,
        value: vertices.slice(0),
      },
    },
  });
}

export interface Context {
  mouse: {
    x: number;
    y: number;
    dx: number;
    dy: number;
  };
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;

  viewportWidth: number;
  viewportHeight: number;

  renderTime: number;
  renderDeltaTime: number;

  transition: Accessor<number>;
}

export function main(context: Context) {
  const tmp = [
    m4.identity(),
    m4.identity(),
    m4.identity(),
    m4.identity(),
    m4.identity(),
    m4.identity(),
  ];

  window.dispatchEvent(new Event('resize'));
  const gl = context.gl;

  let fov = 75 * DEG_TO_RAD;

  const zNear = 0.1;
  const zFar = 2000;

  const cameraMatrix = m4.identity();
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
    return applyMatToPoints(
      m4.multiplyArray([m4.translation([x, y, z]), m4.scaling([w, h, d])]),
      box
    );
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

  function render(context: Context) {
    const gl = context.gl;

    gl.clearColor(0.0, 0.0, 0.0, 1);
    gl.clear(GL_CLEAR_MASK.COLOR_BUFFER_BIT);

    drawPoints(gl, shader, room, [0.3, 0.3, 0.3]);
    drawPoints(gl, shader, roomDoor, [0.7, 0.7, 0.7]);
    drawPoints(gl, shader, balconyDoor, [0.7, 0.7, 0.7]);
    drawPoints(gl, shader, washingMashine, [0.6, 0.1, 0.1]);
    shelves.forEach((shelf) => drawPoints(gl, shader, shelf, [0.3, 0.8, 0.8]));
    rails.forEach((rail) => drawPoints(gl, shader, rail, [0.8, 0.3, 0.8]));

    gl.flush();
  }

  function createOrthographicProjection(dst = m4.identity()) {
    const near = -5000.1;
    const far = 2000;

    const size = 600;
    const left = -gl.canvas.clientWidth / size;
    const right = gl.canvas.clientWidth / size;
    const bottom = -gl.canvas.clientHeight / size;
    const top = gl.canvas.clientHeight / size;

    return m4.ortho(left, right, bottom, top, near, far, dst);
  }

  function createPerspectiveProjection(dst = m4.identity()) {
    const fov = 60 * DEG_TO_RAD;
    const near = 0.1;
    const far = 2000;
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

    return m4.perspective(fov, aspect, near, far, dst);
  }

  const element: HTMLElement = context.canvas;

  const [time, setTime] = createSignal(0);

  // --- wheel start
  let scale = 1;
  const offset = v3.create(0.6, 1.8, 2.0);
  const spherical = setFromVec3(offset);
  const dollyScale = Math.pow(0.95, 1);

  const onMouseWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (event.deltaY < 0) {
      scale *= dollyScale;
    } else if (event.deltaY > 0) {
      scale /= dollyScale;
    }

    spherical.radius *= scale;
    spherical.radius = clamp(spherical.radius, 0, 100);

    setFromSpherical(spherical, offset);
    setTime(time() + 1);

    scale = 1;
  };

  element.addEventListener('wheel', onMouseWheel, {
    passive: false,
  });
  onCleanup(() => {
    element.removeEventListener('wheel', onMouseWheel);
  });
  // --- wheel end

  // --- pointer start

  const rotateStart = v2.create();
  const rotateEnd = v2.create();
  const rotateDelta = v2.create();
  const sphericalDelta = create();

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
    } else {
      v2.set(event.clientX, event.clientY, rotateEnd);

      v2.subtract(rotateEnd, rotateStart, rotateDelta);

      // rotateLeft
      {
        const angle = (2 * Math.PI * rotateDelta[0]) / element.clientHeight;
        sphericalDelta.theta -= angle;
      }

      // rotateUp
      {
        const angle = (2 * Math.PI * rotateDelta[1]) / element.clientHeight;
        sphericalDelta.phi -= angle;
      }

      v2.copy(rotateEnd, rotateStart);
    }

    spherical.theta += sphericalDelta.theta;
    spherical.phi += sphericalDelta.phi;

    setFromSpherical(spherical, offset);

    sphericalDelta.radius = 0;
    sphericalDelta.phi = 0;
    sphericalDelta.theta = 0;

    setTime(time() + 1);
  };

  const onPointerUp = (event: PointerEvent) => {
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
  };

  const onPointerDown = (event: PointerEvent) => {
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);

    if (event.pointerType === 'touch') {
    } else {
      v2.set(event.clientX, event.clientY, rotateStart);
    }
  };

  element.addEventListener('pointerdown', onPointerDown, {
    passive: false,
  });
  onCleanup(() => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
  });
  // --- pointer end

  function createPosition(time: number, dst = m4.identity()) {
    m4.identity(dst);
    m4.translate(dst, offset, dst);
    // m4.translate(dst, [0, 0, 1.0], dst);
    m4.lookAt(offset, [0, 0, 0], [0, 1, 0], dst);
    // m4.rotateY(dst, -Math.sin(time * 0.0003) * 0.2, dst);
    // m4.rotateY(dst, 15 * DEG_TO_RAD, dst);
    // m4.rotateX(dst, -10 * DEG_TO_RAD, dst);

    return dst;
  }

  const camera = {
    projection: m4.transition(
      createOrthographicProjection(),
      createPerspectiveProjection(),
      context.transition()
    ),
    transform: createPosition(0),
  };

  const cameraInversePosition = m4.identity();
  function update(context: Context) {
    const time = context.renderTime;
    const mouse = context.mouse;
    const canvas = context.canvas;

    updateViewportSize(context);

    shader.cameraPosition.value = m4.inverse(
      createPosition(time, camera.transform),
      cameraInversePosition
    );

    camera.projection = m4.transition(
      createOrthographicProjection(),
      createPerspectiveProjection(),
      context.transition()
    );

    shader.cameraProjection.value = camera.projection;
  }

  let id: number;
  const stats = useStats();

  function handleRaf(time: number) {
    // console.log(`main`);

    id = requestAnimationFrame(handleRaf);

    stats.begin();
    if (context.renderTime === undefined) {
      return (context.renderTime = time);
    }
    context.renderDeltaTime = (time - context.renderTime) * 0.001;
    context.renderTime = time;
    update(context);

    render(context);

    stats.end();
  }

  handleRaf(0);

  onCleanup(() => {
    cancelAnimationFrame(id);
  });
}

function drawPoints(
  gl: WebGL2RenderingContext,
  shader: any,
  points: number[],
  color: number[]
) {
  shader.attributes.aPosition.value.length = 0;
  Array.prototype.push.apply(shader.attributes.aPosition.value, points);

  if (color) {
    shader.uniforms.uColor.value.length = 0;
    Array.prototype.push.apply(shader.uniforms.uColor.value, color);
  }
  shader.bind();

  gl.drawArrays(
    GL_DRAW_ARRAYS_MODE.LINE_STRIP,
    0,
    shader.attributes.aPosition.value.length / 3
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
    m4.transformPoint(mat, v, v);
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
    gl.viewport(0, 0, context.viewportWidth, context.viewportHeight);
  }
}
function drawQuad(gl: WebGL2RenderingContext) {
  gl.drawArrays(GL_DRAW_ARRAYS_MODE.TRIANGLE_STRIP, 0, 4);
}
