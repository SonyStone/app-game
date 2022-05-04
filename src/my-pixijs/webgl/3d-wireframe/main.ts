const RADTODEG = 180 / Math.PI;
const DEGTORAD = Math.PI / 180;

import vertexShader from './vert_shader.vert?raw';
import fragmentShader from './frag_shader.frag?raw';

import { Mat4 } from './Mat4';
import { Shader } from './Shader';
import { onCleanup } from 'solid-js';
import { useStats } from '../../../Stats.provider';

function createWireframe(
  gl: WebGL2RenderingContext,
  vertices: any[],
  color: any
) {
  return new Shader(gl, {
    vertexShader,
    fragmentShader,
    uniforms: {
      uTransform: {
        type: gl.FLOAT_MAT4,
        value: Mat4.identity(),
      },
      uViewProjection: {
        type: gl.FLOAT_MAT4,
        value: Mat4.identity(),
      },
      uColor: {
        type: gl.FLOAT_VEC3,
        value: color,
      },
    },
    attributes: {
      aPosition: {
        type: gl.ARRAY_BUFFER,
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
}

export function main(context: Context) {
  const tmp = [
    Mat4.identity(),
    Mat4.identity(),
    Mat4.identity(),
    Mat4.identity(),
    Mat4.identity(),
    Mat4.identity(),
  ];
  const { mouse } = context;
  window.dispatchEvent(new Event('resize'));
  const gl = context.gl;

  let fov = 75 * DEGTORAD;

  const zNear = 0.1;
  const zFar = 2000;

  function getCameraMatrixAnim01(time: number) {
    return [
      //Mat4.rotateX(15 * DEGTORAD),
      Mat4.rotateY(-10 * DEGTORAD),
      Mat4.rotateY(Math.sin(time * 0.0003) * 0.13),
      Mat4.translate(0.6, 1.8, 2.0),
      //Mat4.translate(0, 1.5, 4.5),
      Mat4.translate(0, 0, 1.0),
      Mat4.rotateY(Math.sin(time * 0.0003) * 0.2),
      Mat4.rotateY(-15 * DEGTORAD),
      Mat4.rotateX(10 * DEGTORAD),
      //Mat4.translate(0, 0, 2 * (1 - 2 * mouse.y / canvas.height)),
    ];
  }

  const cameraFunc = getCameraMatrixAnim01;
  // fov = 0.1 * DEGTORAD;
  // const cameraFunc = getCameraMatrixOverhead;

  const cameraMatrix = Mat4.identity();
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
      Mat4.multiplyArray([Mat4.translate(x, y, z), Mat4.scale(w, h, d)]),
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
  //rails.push(makeBox(0.01, 1.8, 0.02, -0.805, 1.50, -0.49-0.20));
  //rails.push(makeBox(0.01, 1.8, 0.02, -0.805, 1.50, -0.91));
  //rails.push(makeBox(0.01, 1.8, 0.02, -0.805, 1.50, -0.89));
  rails.push(makeBox(0.01, 1.8, 0.02, -0.805, 1.5, -0.79));
  rails.push(makeBox(0.01, 1.8, 0.02, -0.805, 1.5, -0.19));
  //rails.push(makeBox(0.01, 1.8, 0.02, -0.805, 1.50, -0.49));
  //rails.push(makeBox(0.01, 1.8, 0.02, -0.805, 1.50, -0.49+0.20));
  shelves.push(makeBox(0.6, 0.02, 0.8, -0.49, 1.0, -0.49));
  shelves.push(makeBox(0.6, 0.02, 0.8, -0.49, 1.4, -0.49));
  shelves.push(makeBox(0.6, 0.02, 0.8, -0.49, 2.0, -0.49));

  //shelves.push(makeBox(0.61, 0.02, 2.443, -0.49, 2.00, 0));

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
    gl.clear(gl.COLOR_BUFFER_BIT);

    // console.log(`main`);

    drawPoints(gl, shader, room, [0.3, 0.3, 0.3]);
    drawPoints(gl, shader, roomDoor, [0.7, 0.7, 0.7]);
    drawPoints(gl, shader, balconyDoor, [0.7, 0.7, 0.7]);
    drawPoints(gl, shader, washingMashine, [0.6, 0.1, 0.1]);
    shelves.forEach((shelf) => drawPoints(gl, shader, shelf, [0.3, 0.8, 0.8]));
    rails.forEach((rail) => drawPoints(gl, shader, rail, [0.8, 0.3, 0.8]));

    gl.flush();
  }
  function update(context: Context) {
    const time = context.renderTime;
    const mouse = context.mouse;
    const canvas = context.canvas;

    updateViewportSize(context);

    Mat4.multiplyArray(cameraFunc(time), cameraMatrix);

    Mat4.multiplyArray(
      [
        Mat4.translate(0, 0, 0, tmp[0]),
        Mat4.scale(1.0, 1.0, 1.0, tmp[1]),
        //Mat4.scale(10, 10, 10, tmp[1]),
        //Mat4.rotateX(time * 0.005, tmp[2]),
        //Mat4.rotateY(time * 0.005, tmp[3]),
        //Mat4.rotateZ(time * 0.0005, tmp[4]),
        //Mat4.translate(1 - (512 + 20) * factX, 1 - (512 + 20) * factY, 0),
        //Mat4.scale(512 * factX, 512 * factY, 1),
      ],
      (shader as any).uTransform.value
    );

    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

    Mat4.multiplyArray(
      [
        Mat4.perspective(fov, aspect, zNear, zFar),
        Mat4.inverse(cameraMatrix, tmp[1]),
      ],
      (shader as any).uViewProjection.value
    );
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

  id = requestAnimationFrame(handleRaf);

  onCleanup(() => {
    cancelAnimationFrame(id);
  });
}

function getCameraMatrixOverhead(time: number) {
  return [
    //Mat4.rotateX(15 * DEGTORAD),
    //Mat4.rotateY(-10 * DEGTORAD),
    //Mat4.rotateY(Math.sin(time * 0.0003) * 0.13),
    Mat4.translate(0.0, 2000.0, 0.0),
    //Mat4.translate(0, 1.5, 4.5),
    //Mat4.translate(0, 0, 1.0),
    //Mat4.rotateY(Math.sin(time * 0.0003) * 0.2),
    //Mat4.rotateY(-15 * DEGTORAD),
    Mat4.rotateX(90 * DEGTORAD),
    //Mat4.translate(0, 0, 2 * (1 - 2 * mouse.y / canvas.height)),
  ];
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

  gl.drawArrays(gl.LINE_STRIP, 0, shader.attributes.aPosition.value.length / 3);
}

function applyMatToPoints(mat: number[], points: number[], r?: number[]) {
  r = r || [];
  const v = [];
  for (let i = 0; i < points.length; i += 3) {
    v[0] = points[i + 0];
    v[1] = points[i + 1];
    v[2] = points[i + 2];
    Mat4.applyVec3(mat, v, v);
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
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
