import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, onCleanup } from 'solid-js';

import {
  Camera,
  Mesh,
  Orbit,
  Plane,
  Program,
  Raycast,
  RenderTarget,
  Renderer,
  Sphere,
  Texture,
  Transform,
  Vec3
} from '@packages/ogl';
import brushFragment from './brush-shader.frag?raw';
import brushVertex from './brush-shader.vert?raw';

import { Vec2 } from '@packages/math';
import { GL_CAPABILITIES, GL_FUNC_SEPARATE } from '@packages/webgl/static-variables';
import meshFrag from './mesh.frag?raw';
import meshVert from './mesh.vert?raw';
import postFrag from './post.frag?raw';
import postVert from './post.vert?raw';

export default () => {
  const canvas = (<canvas />) as HTMLCanvasElement;
  const renderer = new Renderer({ dpr: 2, canvas });
  const gl = renderer.gl;
  gl.clearColor(0.9, 0.9, 0.9, 1);
  renderer.enable(GL_CAPABILITIES.BLEND);
  renderer.setBlendFunc(GL_FUNC_SEPARATE.SRC_ALPHA, GL_FUNC_SEPARATE.ONE);

  const canvasCamera = new Camera({ fov: 35 });
  canvasCamera.position.set(-0.5, -0.5, 1);
  canvasCamera.lookAt([-0.5, -0.5, 0]);

  const sceenCamera = new Camera({ fov: 35 });
  sceenCamera.position.set(0, 0, 1.7);

  const controls = new Orbit(sceenCamera, {
    target: new Vec3(0, 0, 0),
    ease: 0.9,
    inertia: 0,
    panSpeed: 1,
    enableRotate: false
  });

  const resize = createWindowSize();

  const brush = (() => {
    // A little data texture with 4 colors just to keep things interesting
    const texture4colors = new Texture(gl, {
      image: new Uint8Array([191, 25, 54, 255, 96, 18, 54, 255, 96, 18, 54, 255, 37, 13, 53, 255]),
      width: 2,
      height: 2,
      magFilter: gl.NEAREST
    });

    const textureProgram = new Program(gl, {
      vertex: brushVertex,
      fragment: brushFragment,
      uniforms: {
        tMap: { value: texture4colors }
      }
    });

    const plane = new Plane(gl, { width: 0.1, height: 0.1 });
    const mesh = new Mesh(gl, { geometry: plane, program: textureProgram });
    mesh.scale.set(0.1, 0.1, 0.1);

    return { mesh };
  })();

  const scene = new Transform();

  const texture = (() => {
    // Create render target framebuffer.
    // Uses canvas size by default and doesn't automatically resize.
    // To resize, re-create target
    const target = new RenderTarget(gl, {
      width: 1024,
      height: 1024,
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

    const geometry = new Plane(gl, { width: 1, height: 1 });
    const mesh = new Mesh(gl, { geometry: geometry, program: targetProgram });
    scene.addChild(mesh);

    return { target };
  })();

  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    canvasCamera.orthographic({ left: 0, right: 1, top: 1, bottom: 0 });
    sceenCamera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  const [brushPos, setBrushPos] = createSignal<Vec3>(brush.mesh.position, { equals: false });

  const raycast = new Raycast();
  const mouse = new Vec2();

  const sphere = (() => {
    const geometry = new Sphere(gl, { radius: 0.01 });
    const program = new Program(gl, {
      vertex: meshVert,
      fragment: meshFrag
    });
    const mesh = new Mesh(gl, { geometry, program });
    scene.addChild(mesh);
    return { mesh };
  })();

  const clickHandler = (e: MouseEvent) => {
    // Normalize the mouse coordinates to the range [-1, 1]
    let mouseNormalized = new Vec3(
      (e.x / window.innerWidth) * 2 - 1,
      (1 - e.y / window.innerHeight) * 2 - 1,
      0.5 // this value is set to 0.5 as we are only interested in the direction of the ray
    );

    sceenCamera.unproject(mouseNormalized);
    mouse.set(mouseNormalized.x, mouseNormalized.y);

    raycast.castMouse(sceenCamera, mouse);

    sphere.mesh.position.set(mouseNormalized.x, mouseNormalized.y, -0.005);

    brush.mesh.scale.set(0.1, 0.1, 0.1);
    // brush.mesh.rotation.z -= 0.02;
    brush.mesh.position.set(mouseNormalized.x, mouseNormalized.y, 0);
    setBrushPos(mouseNormalized);
  };

  const emptyScene = new Transform();
  renderer.render({ scene: emptyScene, camera: canvasCamera, target: texture.target });
  gl.clearColor(1, 1, 1, 1);

  document.addEventListener('pointermove', clickHandler);

  let requestID = requestAnimationFrame(update);
  function update(t: number) {
    requestID = requestAnimationFrame(update);

    controls.update();
    renderer.render({ scene: brush.mesh, camera: canvasCamera, target: texture.target, clear: false });
    renderer.render({ scene: scene, camera: sceenCamera });
  }

  onCleanup(() => {
    cancelAnimationFrame(requestID);
    document.removeEventListener('pointermove', clickHandler);
    controls.remove();
  });

  return (
    <>
      <pre class="absolute start-0 top-0"></pre>
      {canvas}
    </>
  );
};
