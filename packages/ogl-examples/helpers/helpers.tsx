import {
  AxesHelper,
  Box,
  Camera,
  FaceNormalsHelper,
  GridHelper,
  Mesh,
  Orbit,
  Program,
  Renderer,
  Sphere,
  Transform,
  VertexNormalsHelper
} from '@packages/ogl';

import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, onCleanup } from 'solid-js';
import fragment from './helpers.frag?raw';
import vertex from './helpers.vert?raw';

export default function Helpers() {
  const renderer = new Renderer({ dpr: 2 });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera(gl, { fov: 35 });
  camera.position.set(1, 1, 7);
  camera.lookAt([0, 0, 0]);
  const controls = new (Orbit as any)(camera);

  const resize = createWindowSize();

  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  const scene = new Transform();

  const sphereGeometry = new Sphere(gl);
  const cubeGeometry = new Box(gl);

  const program = new Program(gl, { vertex, fragment });

  const sphere = new Mesh(gl, { geometry: sphereGeometry, program });
  sphere.position.set(-0.75, 0.5, 0);
  sphere.setParent(scene);

  const sphereVertNorms = new VertexNormalsHelper(sphere);
  sphereVertNorms.setParent(scene);

  const sphereFaceNorms = new FaceNormalsHelper(sphere);
  sphereFaceNorms.setParent(scene);

  const cube = new Mesh(gl, { geometry: cubeGeometry, program });
  cube.position.set(0.75, 0.5, 0);
  cube.setParent(scene);

  const cubeVertNorms = new VertexNormalsHelper(cube);
  cubeVertNorms.setParent(scene);

  const cubeFaceNorms = new FaceNormalsHelper(cube);
  cubeFaceNorms.setParent(scene);

  const grid = new GridHelper(gl, { size: 10, divisions: 10 });
  grid.position.y = -0.001; // shift down a little to avoid z-fighting with axes helper
  grid.setParent(scene);

  const axes = new AxesHelper(gl, { size: 6, symmetric: true });
  axes.setParent(scene);

  let requestID = requestAnimationFrame(update);
  function update(t: number) {
    requestID = requestAnimationFrame(update);

    sphere.scale.y = Math.cos(t * 0.001) * 2;
    cube.rotation.y -= 0.01;

    controls.update();
    renderer.render({ scene, camera });
  }

  onCleanup(() => {
    cancelAnimationFrame(requestID);
    controls.remove();
  });

  return gl.canvas;
}
