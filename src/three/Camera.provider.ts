import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { OrthographicCamera, PerspectiveCamera } from 'three';

import createContextProvider from '@utils/createContextProvider';
import { OrbitControls } from './controls/OrbitControls';
import { copy } from './utils/object3d';

export function createResize() {
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
  const [cameraType, setCameraType] = createSignal<
    'perspective' | 'orthographic'
  >('perspective');

  const cameras = {
    perspective: new PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      1,
      10000
    ),
    orthographic: new OrthographicCamera(
      -window.innerWidth / 2,
      window.innerWidth / 2,
      window.innerHeight / 2,
      -window.innerHeight / 2,
      -10000,
      10000
    ),
  };

  const controls = new OrbitControls();
  controls.screenSpacePanning = true;

  const camera = createMemo<PerspectiveCamera | OrthographicCamera>((prev) => {
    const type = cameraType();

    const currentCamera = cameras[type];

    if (prev) {
      copy(currentCamera, prev);
    }

    return currentCamera;
  });

  onMount(() => {
    const currentCamera = camera();

    currentCamera.position.z = 300;
  });

  const resize = createResize();

  createEffect(() => {
    const { width, height } = resize();
    const currentCamera = camera();

    controls.setCamera(currentCamera);

    if ((currentCamera as PerspectiveCamera).isPerspectiveCamera) {
      (currentCamera as PerspectiveCamera).aspect = width / height;
    } else if ((currentCamera as OrthographicCamera).isOrthographicCamera) {
      (currentCamera as OrthographicCamera).left = -width / 2;
      (currentCamera as OrthographicCamera).right = width / 2;
      (currentCamera as OrthographicCamera).top = height / 2;
      (currentCamera as OrthographicCamera).bottom = -height / 2;
    }

    currentCamera.updateProjectionMatrix();
  });

  function toggleCamera() {
    const type = cameraType();
    type === 'perspective'
      ? setCameraType('orthographic')
      : setCameraType('perspective');
  }

  return { camera, controls, resize, cameraType, toggleCamera };
});
