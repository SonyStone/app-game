import * as v2 from '@packages/math/v2';
import { Camera, Flowmap, Mesh, Orbit, Program, Renderer, Texture, Triangle } from '@packages/ogl';
import createRAF from '@solid-primitives/raf';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect } from 'solid-js';
import fragment from './shader.frag?raw';
import vertex from './shader.vert?raw';
import waterSrc from './water.jpg?url';

export default () => {
  const renderer = new Renderer({ dpr: 2 });
  const gl = renderer.gl;

  const camera = new Camera({ fov: 35 });
  camera.position.set(0, 0, 1.7);
  camera.lookAt([0, 0, 0]);
  const controls = new Orbit(camera);

  const resize = createWindowSize();

  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    aspect = window.innerWidth / window.innerHeight;
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  // Variable inputs to control flowmap
  let aspect = 1;
  const mouse = FVec2.splat(-1);
  const velocity = Object.assign(v2.createFVec2(), { needsUpdate: true });

  const flowmap = new Flowmap(gl);

  // Triangle that includes -1 to 1 range for 'position', and 0 to 1 range for 'uv'.
  const geometry = new Triangle(gl);
  // const geometry = new Plane(gl);

  const texture = (() => {
    const texture = new Texture(gl, { wrapS: gl.REPEAT, wrapT: gl.REPEAT });
    const img = new Image();
    img.onload = () => (texture.image = img);
    img.src = waterSrc;
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

  // Create handlers to get mouse position and velocity
  window.addEventListener('pointerdown', updateMouse, false);
  window.addEventListener('pointermove', updateMouse, false);

  let lastTime = 0;
  const lastMouse = v2.createFVec2();
  function updateMouse(e: PointerEvent) {
    // Get mouse value in 0 to 1 range, with y flipped
    mouse.set(e.x / gl.renderer.width, 1.0 - e.y / gl.renderer.height);

    // Calculate velocity
    if (!lastTime) {
      // First frame
      lastTime = performance.now();
      v2.set(e.x, e.y, lastMouse);
    }

    const deltaX = e.x - lastMouse[v2.X];
    const deltaY = e.y - lastMouse[v2.Y];

    v2.set(e.x, e.y, lastMouse);

    let time = performance.now();

    // Avoid dividing by 0
    let delta = Math.max(14, time - lastTime);
    lastTime = time;

    velocity[v2.X] = deltaX / delta;
    velocity[v2.Y] = deltaY / delta;

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
    v2.copy(mouse, flowmap.mouse);

    // Ease velocity input, slower when fading out
    v2.lerp(flowmap.velocity, velocity, v2.length(velocity) ? 0.5 : 0.1, flowmap.velocity);

    flowmap.update();

    program.uniforms.uTime.value = t * 0.001;

    renderer.render({ scene: mesh, camera });
  }

  const [, start] = createRAF(update);
  start();

  return gl.canvas;
};
