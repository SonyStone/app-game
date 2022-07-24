import { createEffect, createSignal, onMount } from 'solid-js';

import { useCamera } from '../../../three/Camera.provider';
import s from './3dWireframe.module.scss';
import { Context, main } from './main';

export default function Wireframe() {
  const canvas = (<canvas class={s.canvas}></canvas>) as HTMLCanvasElement;

  // canvas.style.imageRendering = 'pixelated';
  // canvas.imageSmoothingEnabled = false;

  function handleWindowResize(event: UIEvent) {
    canvas.width = document.documentElement.clientWidth;
    canvas.height = document.documentElement.clientHeight;
  }

  window.addEventListener('resize', handleWindowResize);

  const { cameraType } = useCamera();

  const [transition, setTransition] = createSignal(
    cameraType() === 'perspective' ? 1 : 0
  );

  createEffect(() => {
    setTransition(cameraType() === 'perspective' ? 1 : 0);
  });

  const context = {
    canvas,
    gl: canvas.getContext('webgl2')!,
    transition,
  };

  onMount(() => {
    // WebGL
    main(context as Context);
  });

  return (
    <>
      {canvas}{' '}
      <div class={s.controls}>
        <input
          type="range"
          min={0}
          max={1.25}
          step={0.01}
          value={transition()}
          onInput={(e) => setTransition(parseFloat((e.target as any).value))}
        />
      </div>
    </>
  );
}
