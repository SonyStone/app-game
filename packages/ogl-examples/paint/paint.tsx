import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, onCleanup } from 'solid-js';

import { Camera, Mesh, Orbit, Plane, Program, RenderTarget, Renderer, Texture } from '@packages/ogl';
import fragment from './shader.frag?raw';
import vertex from './shader.vert?raw';

export default () => {
  const renderer = new Renderer({ dpr: 2 });
  const gl = renderer.gl;
  gl.clearColor(0.9, 0.9, 0.9, 1);

  const textureCamera = new Camera(gl, { fov: 35 });
  textureCamera.position.set(0, 0, 2);
  textureCamera.lookAt([0, 0, 0]);

  const targetCamera = new Camera(gl, { fov: 35 });
  targetCamera.position.set(0, 0, 1.7);
  targetCamera.lookAt([0, 0, 0]);
  const controls = new (Orbit as any)(targetCamera);

  const resize = createWindowSize();

  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    targetCamera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  const plane = new Plane(gl);

  // A little data texture with 4 colors just to keep things interesting
  const texture = new Texture(gl, {
    image: new Uint8Array([191, 25, 54, 255, 96, 18, 54, 255, 96, 18, 54, 255, 37, 13, 53, 255]),
    width: 2,
    height: 2,
    magFilter: gl.NEAREST
  });

  const textureProgram = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      tMap: { value: texture }
    }
  });

  // Create render target framebuffer.
  // Uses canvas size by default and doesn't automatically resize.
  // To resize, re-create target
  const target = new RenderTarget(gl, {
    width: 1024,
    height: 1024
  });

  const targetProgram = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      tMap: { value: target.texture }
    }
  });

  const mesh = new Mesh(gl, { geometry: plane, program: textureProgram });
  const targetMesh = new Mesh(gl, { geometry: plane, program: targetProgram });

  let requestID = requestAnimationFrame(update);
  function update() {
    requestID = requestAnimationFrame(update);

    mesh.rotation.z -= 0.002;

    // Set background for first render to target
    // gl.clearColor(0.15, 0.05, 0.2, 1);

    // Add target property to render call
    renderer.render({ scene: mesh, camera: textureCamera, target });

    // Change to final background
    // gl.clearColor(0.15, 0.05, 0.2, 1);

    controls.update();

    // Omit target to render to canvas
    renderer.render({ scene: targetMesh, camera: targetCamera });
  }

  onCleanup(() => {
    cancelAnimationFrame(requestID);
    controls.remove();
  });

  return gl.canvas;
};
