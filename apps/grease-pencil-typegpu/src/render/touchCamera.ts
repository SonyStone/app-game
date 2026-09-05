import type { TouchViewTransform } from '../features/interaction/touchGesture';
import { CAMERA_VERTICAL_FOV, getCameraBasis, type CameraState } from './cameraMatrices';
import { add3, clamp, scale3, sub3 } from './vector';

/** Keeps the point under the fingers fixed while applying pan, scale, and roll in either view. */
export function transformTouchCamera(
  camera: CameraState,
  viewport: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  gesture: TouchViewTransform
) {
  if (viewport.height <= 0 || viewport.width <= 0 || !Number.isFinite(gesture.scale) || gesture.scale <= 0) return;
  const anchor = pointOnViewPlane(camera, viewport, gesture.from);
  camera.distance = clamp(camera.distance / gesture.scale, 1.6, 48);
  camera.roll -= gesture.rotation;
  camera.roll = Math.atan2(Math.sin(camera.roll), Math.cos(camera.roll));
  const movedAnchor = pointOnViewPlane(camera, viewport, gesture.to);
  camera.target = add3(camera.target, sub3(anchor, movedAnchor));
}

/** Intersects a screen point with the plane through the orbit target, facing the camera. */
function pointOnViewPlane(
  camera: CameraState,
  viewport: Parameters<typeof transformTouchCamera>[1],
  point: TouchViewTransform['from']
) {
  const { right, up } = getCameraBasis(camera);
  const unitsPerPixel = (2 * camera.distance * Math.tan(CAMERA_VERTICAL_FOV / 2)) / viewport.height;
  const x = (point.x - viewport.left - viewport.width / 2) * unitsPerPixel;
  const y = (viewport.top + viewport.height / 2 - point.y) * unitsPerPixel;
  return add3(camera.target, add3(scale3(right, x), scale3(up, y)));
}
