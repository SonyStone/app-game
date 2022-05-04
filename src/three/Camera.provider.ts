import { PerspectiveCamera } from 'three';

import { createContextProvider } from '../utils/createContextProvider';

export const [CameraProvider, useCamera] = createContextProvider(() => {
  const camera = new PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    1,
    10000
  );
  camera.position.z = 300;

  return camera;
});
