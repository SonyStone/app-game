import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, onCleanup } from 'solid-js';

import { Camera, Mesh, Orbit, Plane, Program, RenderTarget, Renderer, Texture, Triangle } from '@packages/ogl';
import fragment from './shader.frag?raw';
import vertex from './shader.vert?raw';

import { GL_CAPABILITIES, GL_FUNC_SEPARATE } from '@packages/webgl/static-variables';
import postFrag from './post.frag?raw';
import postVert from './post.vert?raw';

export default () => {
  const canvas = (<canvas />) as HTMLCanvasElement;
  const renderer = new Renderer({ dpr: 2, canvas });
  const gl = renderer.gl;
  gl.clearColor(0.9, 0.9, 0.9, 1);
  renderer.enable(GL_CAPABILITIES.BLEND);
  renderer.setBlendFunc(GL_FUNC_SEPARATE.SRC_ALPHA, GL_FUNC_SEPARATE.ONE);

  const canvasCamera = new Camera(gl, { fov: 35 });
  canvasCamera.position.set(0, 0, 1.7);
  canvasCamera.lookAt([0, 0, 0]);
  const controls = new (Orbit as any)(canvasCamera);

  const resize = createWindowSize();

  // A little data texture with 4 colors just to keep things interesting
  const texture4colors = new Texture(gl, {
    image: new Uint8Array([191, 25, 54, 255, 96, 18, 54, 255, 96, 18, 54, 255, 37, 13, 53, 255]),
    width: 2,
    height: 2,
    magFilter: gl.NEAREST
  });

  const textureProgram = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      tMap: { value: texture4colors }
    }
  });

  // Create render target framebuffer.
  // Uses canvas size by default and doesn't automatically resize.
  // To resize, re-create target
  const target = new RenderTarget(gl, {
    width: gl.renderer.width,
    height: gl.renderer.height,
    color: 1,
    depth: false,
    stencil: false
  });

  const targetProgram = new Program(gl, {
    vertex: postVert,
    fragment: postFrag,
    uniforms: {
      tMap: { value: target.texture }
    }
  });

  const plane = new Plane(gl);
  const mesh = new Mesh(gl, { geometry: plane, program: textureProgram });

  const geometry = new Triangle(gl);
  const targetMesh = new Mesh(gl, { geometry: geometry, program: targetProgram });

  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    target.setSize(resize.width, resize.height);
    canvasCamera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  const clickHandler = (e: MouseEvent) => {
    const x = e.x;
    const y = e.y;

    mesh.scale.set(0.1, 0.1, 0.1);
    mesh.rotation.z -= 0.02;
    mesh.position.set(x / resize.width - 0.6, -y / resize.height + 0.5, 0);

    renderer.render({ scene: mesh, camera: canvasCamera, target, clear: false });
    renderer.render({ scene: targetMesh });
  };

  canvas.addEventListener('pointermove', clickHandler);

  onCleanup(() => {
    canvas.removeEventListener('click', clickHandler);
    controls.remove();
  });

  return canvas;
};
