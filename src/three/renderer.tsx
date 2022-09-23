import { onCleanup } from 'solid-js';
import { Scene, WebGLRenderer } from 'three';

import { useCamera } from './Camera.provider';
import { ParentProvider } from './parent.provider';

export function Renderer(props: { children?: any; class?: string }) {
  const canvas = (<canvas class={props.class}></canvas>) as HTMLCanvasElement;

  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new Scene();
  const { camera, controls, resize } = useCamera();
  controls.init(canvas);

  let id: number;

  console.log(`Renderer created!`);

  function animate() {
    id = requestAnimationFrame(animate);
    const { width, height } = resize();
    renderer.setSize(width, height);
    renderer.render(scene, camera());
  }

  animate();

  onCleanup(() => {
    renderer.dispose();
    controls.dispose();
    scene.clear();
    cancelAnimationFrame(id);
  });

  return (
    <>
      {canvas}
      <ParentProvider object3D={scene}>{props.children}</ParentProvider>
    </>
  );
}
