import { createEffect, createSignal, onCleanup } from 'solid-js';
import { PerspectiveCamera } from 'three';

import { createContextProvider } from '../utils/createContextProvider';
import { OrbitControls } from './controls/OrbitControls';

function createResize() {
  const [resize, setResize] = createSignal<{ width: number; height: number }>({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  function onWindowResize() {
    setResize({ width: window.innerWidth, height: window.innerHeight });
  }

  window.addEventListener('resize', onWindowResize);

  onCleanup(() => {
    window.removeEventListener('resize', onWindowResize);
  });

  return resize;
}

export const [CameraProvider, useCamera] = createContextProvider(() => {
  const camera = new PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    1,
    10000
  );

  // const camera = new OrthographicCamera(
  //   -window.innerWidth / 2,
  //   window.innerWidth / 2,
  //   window.innerHeight / 2,
  //   -window.innerHeight / 2,
  //   -1000,
  //   1000
  // );
  camera.position.z = 300;

  const resize = createResize();

  createEffect(() => {
    const { width, height } = resize();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });

  const controls = new OrbitControls(camera);

  controls.screenSpacePanning = true;

  return { camera, controls, resize };
});
