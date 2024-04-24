import { FVec2 } from '@packages/math';
import { Camera, Flowmap, Mesh, Orbit, Program, Renderer, Texture, Triangle } from '@packages/ogl';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, onCleanup } from 'solid-js';
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
  const velocity = Object.assign(new FVec2(), { needsUpdate: true });

  const flowmap = new Flowmap(gl);

  // Triangle that includes -1 to 1 range for 'position', and 0 to 1 range for 'uv'.
  const geometry = new Triangle(gl);
  // const geometry = new Plane(gl);

  const texture = new Texture(gl, { wrapS: gl.REPEAT, wrapT: gl.REPEAT });
  const img = new Image();
  img.onload = () => (texture.image = img);
  img.src = waterSrc;

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
  const lastMouse = new FVec2();
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

  let requestID = requestAnimationFrame(update);
  function update(t: number) {
    requestID = requestAnimationFrame(update);

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

    renderer.render({ scene: mesh, camera });
  }

  onCleanup(() => {
    controls.remove();
    cancelAnimationFrame(requestID);
  });

  return gl.canvas;
};
