import { Camera, Flowmap, Mesh, Orbit, Program, Renderer, Texture, Triangle } from '@packages/ogl';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect } from 'solid-js';

import { Vec2 } from '@packages/ogl/math/vec-2_old';
import fragment from './mouse-flowmap.frag?raw';
import vertex from './mouse-flowmap.vert?raw';

import { GL_TEXTURE_WRAP_MODE } from '@packages/webgl/static-variables/textures';
import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF, { targetFPS } from '@solid-primitives/raf';
import waterUrl from './water.jpg?url';

/**
 *
 * createFBOs with swap:
 * * read RenderTarget
 * * write RenderTarget
 *
 * texture `tFlow` is updated with the write RenderTarget
 */
export default function MouseFlowmap() {
  const renderer = new Renderer({ dpr: 2 });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera({ fov: 45 });
  camera.position.set(0, 0, 7);

  const controls = new Orbit(camera);

  const resize = createWindowSize();

  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  let aspect = 1;
  const mouse = new Vec2(-1);
  const velocity = new Vec2() as Vec2 & { needsUpdate?: boolean };

  const flowmap = new Flowmap(gl);

  // Triangle that includes -1 to 1 range for 'position', and 0 to 1 range for 'uv'.
  const geometry = new Triangle(gl);

  const texture = (() => {
    const texture = new Texture(gl, { wrapS: GL_TEXTURE_WRAP_MODE.REPEAT, wrapT: GL_TEXTURE_WRAP_MODE.REPEAT });
    const img = new Image();
    img.onload = () => (texture.image = img);
    img.src = waterUrl;
    return texture;
  })();

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      uTime: { value: 0 },
      tWater: { value: texture },

      // Note that the uniform is applied without using an object and value property
      // This is because the class alternates this texture between two render targets
      // and updates the value property after each render.
      tFlow: flowmap.uniform
    }
  });

  const mesh = new Mesh(gl, { geometry, program });

  makeEventListener(window, 'pointermove', updateMouse, false);

  let lastTime: number;
  const lastMouse = new Vec2();
  function updateMouse(e: PointerEvent) {
    // Get mouse value in 0 to 1 range, with y flipped
    mouse.set(e.x / gl.renderer.width, 1.0 - e.y / gl.renderer.height);

    // Calculate velocity
    if (!lastTime) {
      // First frame
      lastTime = performance.now();
      lastMouse.set(e.x, e.y);
    }

    const deltaX = e.x - lastMouse.x;
    const deltaY = e.y - lastMouse.y;

    lastMouse.set(e.x, e.y);

    let time = performance.now();

    // Avoid dividing by 0
    let delta = Math.max(14, time - lastTime);
    lastTime = time;

    velocity.x = deltaX / delta;
    velocity.y = deltaY / delta;

    // Flag update to prevent hanging velocity values when not moving
    velocity.needsUpdate = true;
  }

  function update(t: number) {
    // Reset velocity when mouse not moving
    if (!velocity.needsUpdate) {
      mouse.set(-1);
      velocity.set(0);
    }
    velocity.needsUpdate = false;

    // Update flowmap inputs
    flowmap.aspect = aspect;
    flowmap.mouse.copy(mouse);

    // Ease velocity input, slower when fading out
    flowmap.velocity.lerp(velocity, velocity.len() ? 0.5 : 0.1);

    flowmap.update();

    program.uniforms.uTime.value = t * 0.001;

    renderer.render({ scene: mesh });
  }

  const [, start] = createRAF(targetFPS(update, 240));

  start();

  return <>{gl.canvas}</>;
}
