import { Camera, Geometry, Mesh, Program, Renderer, Transform } from '@packages/ogl';

import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { effect } from 'solid-js/web';
import fragment from './vertex.frag?raw';
import vertex from './vertex.vert?raw';

export default function PaintAppOGL() {
  const renderer = new Renderer();
  const gl = renderer.gl;

  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera({ fov: 15 });
  camera.position.z = 15;

  const size = createWindowSize();

  effect(() => {
    renderer.setSize(size.width, size.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  // Geometry is an indexed square, comprised of 4 vertices.
  const geometry = new Geometry(gl, {
    position: { size: 3, data: new Float32Array([-0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, -0.5, 0]) },
    uv: { size: 2, data: new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]) },
    index: { data: new Uint16Array([0, 1, 2, 1, 3, 2]) }
  });

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      uTime: { value: 0 }
    }
  });

  const scene = new Transform();

  // gl.POINTS: draws 4 points (actually draws 6, with 2 duplicates due to the geometry indices)
  const points = new Mesh(gl, { mode: gl.POINTS, geometry, program });
  points.setParent(scene);
  points.position.set(-1, 1, 0);

  // gl.LINES: draws 3 lines - a line between each pair of vertices.
  // Ideal use for separated lines.
  const lineStrip = new Mesh(gl, { mode: gl.LINES, geometry, program });
  lineStrip.setParent(scene);
  lineStrip.position.set(1, 1, 0);

  // gl.LINE_LOOP: draws 6 lines (1 unavoidable overlap for squares).
  const lineLoop = new Mesh(gl, { mode: gl.LINE_LOOP, geometry, program });
  lineLoop.setParent(scene);
  lineLoop.position.set(-1, -1, 0);

  // gl.TRIANGLES: draws a triangle between each set of 3 vertices.
  // Used as the default draw mode, so doesn't really need to be passed in as a param.
  const triangles = new Mesh(gl, { mode: gl.TRIANGLES, geometry, program });
  triangles.setParent(scene);
  triangles.position.set(1, -1, 0);

  // OTHER MODES NOT FEATURED:
  // gl.LINE_STRIP: Draws a straight line to the next vertex. Does not connect first and last vertices like gl.LINE_LOOP,

  // gl.TRIANGLE_STRIP: draws triangles in a criss-cross pattern. Ideal for ribbons.
  // For example, in order to draw a rectangle, only 4 vertices needed (unlike 6 with gl.TRIANGLES).
  // The 4 vertices should follow the below pattern.
  //
  // 0--2
  // | /|
  // |/ |
  // 1--3

  // gl.TRIANGLE_FAN: draws triangles in a fan pattern. Ideal for small polygons.
  // For the rectangle example, similarly to gl.TRIANGLE_STRIP, only 4 vertices needed. However the
  // pattern differs as per below.
  //
  // 1--2
  // | /|
  // |/ |
  // 0--3

  function update(t: number) {
    program.uniforms.uTime.value = t * 0.001;
    renderer.render({ scene, camera });
  }

  const [running, start, stop] = createRAF(update);
  start();

  return gl.canvas;
}
