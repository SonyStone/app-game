import { createNavigationPuck } from '@app-game/navigation-puck/controller';
import { panCamera, transformAt, type Camera, type ViewSize } from './camera';

/** Adapts shared client-space navigation to Paint's clockwise 2D camera. */
export function createPaintNavigation(params: {
  size: () => ViewSize;
  camera: () => Camera;
  navigate: (camera: Camera) => void;
  viewport?: () => { left: number; top: number; width: number; height: number };
}) {
  const viewport = () => params.viewport?.() ?? { left: 0, top: 0, ...params.size() };
  return createNavigationPuck({
    viewport,
    mode: () => '2d',
    rotation: () => params.camera().angle,
    orbit: () => {},
    transform: (gesture) => {
      const rect = viewport(),
        camera = params.camera();
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
