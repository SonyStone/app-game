import type { DrawingWorkplane } from '../document';
import type { ViewportMode } from '../shared/viewportMode';
import type { CameraState } from './math';
import { lockCameraToWorkplane, unlockCameraFromWorkplane } from './viewportCamera';

/** Keeps independent camera poses for paper and space for the lifetime of the renderer. */
export function createViewportCameraMemory(camera: CameraState) {
  let mode = camera.mode;
  const saved: Partial<Record<ViewportMode, CameraState>> = {};
  let paperPlane: number[] | undefined;

  return {
    /** Restores a complete pose; an explicit reset or changed workplane realigns the paper view. */
    switchMode(nextMode: ViewportMode, workplane: DrawingWorkplane, resetPaper = false) {
      const changed = nextMode !== mode;
      if (!changed && !resetPaper) return;
      if (changed) saved[mode] = cloneCamera(camera);
      const plane = [...workplane.origin, ...workplane.rotation];
      const previous = saved[nextMode];
      const canRestore =
        changed &&
        previous &&
        (nextMode === '3d' || (!resetPaper && paperPlane?.every((value, index) => value === plane[index])));

      if (canRestore) Object.assign(camera, cloneCamera(previous));
      else if (nextMode === '2d') lockCameraToWorkplane(camera, workplane, true);
      else unlockCameraFromWorkplane(camera);

      if (nextMode === '2d') paperPlane = plane;
      mode = nextMode;
    }
  };
}

/** Camera vectors must not alias the live pose, which navigation can mutate in place. */
function cloneCamera(camera: CameraState): CameraState {
  return {
    ...camera,
    target: [...camera.target],
    lockedNormal: camera.lockedNormal ? [...camera.lockedNormal] : undefined,
    lockedUp: camera.lockedUp ? [...camera.lockedUp] : undefined
  };
}
