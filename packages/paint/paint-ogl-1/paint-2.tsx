import { createWindowSize } from '@solid-primitives/resize-observer';
import { Show, createEffect, createSignal, onCleanup } from 'solid-js';

import { Camera, Renderer, Transform, Vec3 } from '@packages/ogl';

import { SphereComponent } from '@packages/math-examples/camera-projection-webgl2/sphere.component';
import { createRaycast } from '@packages/math-examples/raycast';
import { GL_CAPABILITIES, GL_FUNC_SEPARATE } from '@packages/webgl/static-variables';
import { createEmitter } from '@solid-primitives/event-bus';
import { Brush1Component } from './brush-1/brush.component';
import { mouseNormalize } from './mouse-normalize';

export default () => {
  const canvas = (<canvas />) as HTMLCanvasElement;
  const renderer = new Renderer({ dpr: 2, canvas, stencil: true });
  const gl = renderer.gl;
  gl.clearColor(0.9, 0.9, 0.9, 1);
  renderer.enable(GL_CAPABILITIES.BLEND);
  renderer.setBlendFunc(GL_FUNC_SEPARATE.SRC_ALPHA, GL_FUNC_SEPARATE.ONE);

  const camera = new Camera({ fov: 35 });
  camera.position.set(0, 0, 1.7);
  const scene = new Transform();

  const resize = createWindowSize();
  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
    update();
  });

  const [brushPos, setBrushPos] = createSignal<Vec3>(new Vec3(), { equals: false });

  const raycast = createRaycast({ camera: camera, plane: [0, 0, 1] });

  const clickHandler = (e: PointerEvent) => {
    for (const event of e.getCoalescedEvents()) {
      if (e.pressure === 0 || e.buttons !== 1) {
        continue;
      }

      const intersectPoint = raycast.cast(mouseNormalize(event, gl.canvas));
      if (intersectPoint) {
        setBrushPos(intersectPoint);
      }
      renderEvent.emit();
    }

    update();
  };

  document.addEventListener('pointermove', clickHandler);

  const renderEvent = createEmitter<void>();
  function update() {
    renderer.render({ scene: scene, camera: camera, clear: false });
  }

  onCleanup(() => {
    document.removeEventListener('pointermove', clickHandler);
  });

  return (
    <>
      <pre class="absolute start-0 top-0"></pre>
      {canvas}

      <Show when={false}>
        <Brush1Component gl={gl} brushScene={scene} position={brushPos()} />
      </Show>
      <Show when={true}>
        <SphereComponent gl={gl} scene={scene} position={brushPos()} radius={0.01} />
      </Show>
    </>
  );
};
