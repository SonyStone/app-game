import { Camera, Orbit, Renderer, Transform, Vec3 } from '@packages/ogl';
import { Ripple } from '@packages/ui-components/ripple/Ripple';
import { createEmitter } from '@solid-primitives/event-bus';
import { onCleanup, onMount } from 'solid-js';
import { GridHelperComponent } from '../grid-helper.component';
import { NormalBox } from './normal-box.component';
import { ScreenBox } from './screen-box';
import { ScreenPointIntersection } from './screen-point-intersection';

export default function CameraProjectionWebGL2() {
  const click = createEmitter<MouseEvent>();
  const updateScreenBox = createEmitter<void>();
  const canvas = (<canvas class="w-400px h-400px border-t" onClick={click.emit} />) as HTMLCanvasElement;
  const renderer = new Renderer({ dpr: 2, canvas, height: 400, width: 400 });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera({ fov: 35 });
  camera.position.set(2, 4, 4);
  const controls = new Orbit(camera, { element: canvas, target: new Vec3(1, 1, 0) });

  const scene = new Transform();

  let requestID: number;
  function update(t: number) {
    requestID = requestAnimationFrame(update);

    controls.update();
    renderer.render({ scene, camera });
  }

  update(0);

  onMount(() => {
    updateScreenBox.emit();
  });

  onCleanup(() => {
    cancelAnimationFrame(requestID);
    controls.remove();
  });

  return (
    <div class="flex flex-col gap-2">
      <div>Camera Projection in WebGL2</div>
      {canvas}
      <button class="bg-blue relative rounded px-4 py-2 text-white" onClick={() => updateScreenBox.emit()}>
        Update Screen Box
        <Ripple class="text-white/20" />
      </button>
      <ScreenPointIntersection gl={gl} scene={scene} camera={camera} click={click.listen} />
      <GridHelperComponent gl={gl} scene={scene} />
      <NormalBox gl={gl} scene={scene} position={[0.5, 0.5, 0.5]} />
      <ScreenBox gl={gl} scene={scene} camera={camera} update={updateScreenBox.listen} />
    </div>
  );
}
