import { createWindowSize } from '@solid-primitives/resize-observer';
import { Show, createEffect, createSignal, onCleanup } from 'solid-js';

import { Camera, Orbit, RenderTarget, Renderer, Transform, Vec3 } from '@packages/ogl';

import { Vec2 } from '@packages/math';
import { SphereComponent } from '@packages/math-examples/camera-projection-webgl2/sphere.component';
import { createRaycast } from '@packages/math-examples/raycast';
import { GL_CAPABILITIES, GL_FUNC_SEPARATE } from '@packages/webgl/static-variables';
import { createEmitter } from '@solid-primitives/event-bus';
import { Brush1Component } from './brush-1/brush.component';
import { Brush2Component } from './brush-2/brush-2.component';
import { mouseNormalize } from './mouse-normalize';
import { TextureRenderTargetComponent } from './texture-render-target/texture-render-target.component';

export default () => {
  const canvas = (<canvas />) as HTMLCanvasElement;
  const renderer = new Renderer({ dpr: 2, canvas });
  const gl = renderer.gl;
  gl.clearColor(0.9, 0.9, 0.9, 1);
  renderer.enable(GL_CAPABILITIES.BLEND);
  renderer.setBlendFunc(GL_FUNC_SEPARATE.SRC_ALPHA, GL_FUNC_SEPARATE.ONE);

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

  const scene = new Transform();
  const brushScene = new Transform();

  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    sceenCamera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
    update();
  });

  const [brushPos, setBrushPos] = createSignal<Vec3>(new Vec3(), { equals: false });

  const mouse = new Vec2();

  const raycast = createRaycast({ camera: sceenCamera, plane: [0, 0, 1] });

  // Create render target framebuffer.
  // Uses canvas size by default and doesn't automatically resize.
  // To resize, re-create target
  const renderTarget = new RenderTarget(gl, {
    width: 1024,
    height: 1024,
    color: 1,
    depth: false,
    stencil: false
  });

  const clickHandler = (e: PointerEvent) => {
    for (const event of e.getCoalescedEvents()) {
      if (e.pressure === 0 || e.buttons !== 1) {
        continue;
      }
      const intersectPoint = raycast.cast(mouseNormalize(event, gl.canvas));
      if (intersectPoint) {
        mouse.set(intersectPoint.x, intersectPoint.y);
        setBrushPos(intersectPoint);
      }
      renderEvent.emit();
    }

    update();
    // cancelAnimationFrame(requestID);
  };

  document.addEventListener('pointermove', clickHandler);
  document.addEventListener('wheel', update);

  let requestID = requestAnimationFrame(update);
  const renderEvent = createEmitter<void>();
  function update(t?: number | any) {
    controls.update();

    renderer.render({ scene: scene, camera: sceenCamera });

    // requestID = requestAnimationFrame(update);
  }

  onCleanup(() => {
    // cancelAnimationFrame(requestID);
    document.removeEventListener('pointermove', clickHandler);
    document.removeEventListener('wheel', update);
    controls.remove();
  });

  return (
    <>
      <pre class="absolute start-0 top-0"></pre>
      {canvas}
      <TextureRenderTargetComponent
        gl={gl}
        scene={scene}
        render={renderEvent.listen}
        renderer={renderer}
        renderTarget={renderTarget}
        brushScene={brushScene}
      />
      <Show when={false}>
        <Brush1Component gl={gl} brushScene={brushScene} position={brushPos()} />
      </Show>
      <Show when={true}>
        <Brush2Component gl={gl} brushScene={brushScene} position={brushPos()} renderTarget={renderTarget} />
      </Show>
      <Show when={false}>
        <SphereComponent gl={gl} scene={brushScene} position={brushPos()} radius={0.01} />
      </Show>
    </>
  );
};
