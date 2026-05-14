import { createWindowSize } from '@solid-primitives/resize-observer';
import { makeEventListener } from '@solid-primitives/event-listener';
import { Show, createEffect, createSignal } from 'solid-js';

import { Camera, Renderer, Transform, Vec3 } from '@app-game/ogl';

import { SphereComponent } from '@app-game/math-examples/camera-projection-webgl2/sphere.component';
import { createRaycast } from '@app-game/math-examples/raycast';
import { GL_CAPABILITIES } from '@app-game/webgl/static-variables';
import { Brush1Component } from './brush-1/brush.component';
import { mouseNormalize } from './mouse-normalize';

export default () => {
  const canvas = (<canvas />) as HTMLCanvasElement;
  const renderer = new Renderer({ dpr: 2, canvas, stencil: true });
  const gl = renderer.gl;
  gl.clearColor(0.9, 0.9, 0.9, 1);
  renderer.enable(GL_CAPABILITIES.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  const camera = new Camera({ fov: 35 });
  camera.position.set(0, 0, 1.7);
  const scene = new Transform();

  const resize = createWindowSize();
  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
    update();
  });

  const [brushPos, setBrushPos] = createSignal<Vec3>(new Vec3(0, 0, 0), { equals: false });

  const raycast = createRaycast({ camera: camera, plane: [0, 0, 1] });

  const clickHandler = (e: PointerEvent) => {
    for (const event of e.getCoalescedEvents()) {
      if (e.pressure === 0 || e.buttons !== 1) {
        continue;
      }

      const intersectPoint = raycast.cast(mouseNormalize(event, canvas as unknown as HTMLElement));
      if (intersectPoint) {
        setBrushPos(intersectPoint);
      }
    }

    update();
  };

  makeEventListener(document, 'pointermove', clickHandler);

  function update() {
    renderer.render({ scene: scene, camera: camera, clear: false });
  }

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
