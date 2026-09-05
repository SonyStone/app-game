import type { CameraState } from './cameraMatrices';

/** Initial camera shared by the renderer and its worker without importing UI navigation. */
export function createDefaultCamera(): CameraState {
  return {
    mode: '3d',
    roll: 0,
    target: [0, 0, 0],
    yaw: 0.68,
    pitch: 0.74,
    distance: 7.5
  };
}
