import { createNavigationPuck } from '@app-game/navigation-puck/controller';
import { panCamera, transformAt, type Camera, type ViewSize } from '@app-game/paint-core/camera';

/** Adapts shared client-space navigation to Paint's clockwise 2D camera. */
export function createPaintNavigation(params: {
  /** Canvas size in CSS pixels; gestures transform the camera within it. */
  size: () => ViewSize;
  /** Current camera, read untracked from gesture handlers. */
  camera: () => Camera;
  /** Receives the camera produced by a gesture. */
  navigate: (camera: Camera) => void;
  /** Client-space bounds of the canvas; the puck is clamped to it and gesture points are offset by its corner. */
  viewport: () => { left: number; top: number; width: number; height: number };
  /** Largest puck diameter and the reach of controls around it that stays in view; see `createNavigationPuck`. */
  puck?: { size: number; reach: number };
}) {
  return createNavigationPuck({
    ...params.puck,
    viewport: params.viewport,
    mode: () => '2d',
    rotation: () => params.camera().angle,
    orbit: () => {},
    transform: (gesture) => {
      const rect = params.viewport();
      const camera = params.camera();
      const next = transformAt(
        camera,
        params.size(),
        { x: gesture.from.x - rect.left, y: gesture.from.y - rect.top },
        camera.zoom * gesture.scale,
        camera.angle + gesture.rotation
      );
      params.navigate(
        panCamera(next, params.size(), { x: gesture.to.x - gesture.from.x, y: gesture.to.y - gesture.from.y })
      );
    }
  });
}
