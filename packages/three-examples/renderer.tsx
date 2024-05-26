import { onCleanup } from 'solid-js';
import { Scene, WebGLRenderer } from 'three';

import createRAF from '@solid-primitives/raf';
import { useCamera } from './Camera.provider';
import { ParentProvider } from './parent.provider';

export function Renderer(props: { children?: any; class?: string }) {
  const canvas = (<canvas class={props.class}></canvas>) as HTMLCanvasElement;

  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new Scene();
  const { camera, controls, resize } = useCamera();
  controls.init(canvas);

  console.log(`Renderer created!`);

  function animate() {
    const { width, height } = resize();
    renderer.setSize(width, height);
    renderer.render(scene, camera());
  }

  const [running, start, stop] = createRAF(animate);
  start();

  onCleanup(() => {
    renderer.dispose();
    controls.dispose();
    scene.clear();
  });

  return (
    <>
      {canvas}
      <ParentProvider object3D={scene}>{props.children}</ParentProvider>
    </>
  );
}
