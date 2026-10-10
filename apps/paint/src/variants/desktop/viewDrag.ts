import { panCamera, transformAt, type Camera, type Point, type ViewSize } from '@app-game/paint-core/camera';

/**
 * The view tools of the Desktop variant, as Photoshop has them: the hand pans, the zoom tool zooms in on a click
 * (out with Alt) and scrubs the zoom by dragging sideways, and the rotate tool turns the view around its center.
 */
export type ViewMode = 'hand' | 'zoom' | 'rotate';

/**
 * The camera after a view tool's drag moved from `from` to `to` (canvas pixels). `press` is where the drag began,
 * which the zoom pivots on; rotation pivots on the view's center and Shift snaps it to 15° steps of the angle the
 * drag reached, `swept` (radians, clockwise, from the press). Returns the camera and the drag's new `swept`.
 */
export function dragView(
  mode: ViewMode,
  camera: Camera,
  size: ViewSize,
  drag: { press: Point; from: Point; to: Point; startAngle: number; swept: number; shift: boolean }
): { camera: Camera; swept: number } {
  if (mode === 'hand') {
    return { camera: panCamera(camera, size, { x: drag.to.x - drag.from.x, y: drag.to.y - drag.from.y }), swept: 0 };
  }

  if (mode === 'zoom') {
    const zoom = camera.zoom * 2 ** ((drag.to.x - drag.from.x) / zoomDoubling);
    return { camera: transformAt(camera, size, drag.press, zoom), swept: 0 };
  }

  const center = { x: size.width / 2, y: size.height / 2 };
  if (Math.hypot(drag.to.x - center.x, drag.to.y - center.y) < rotateDeadRadius) {
    return { camera, swept: drag.swept };
  }

  const before = Math.atan2(drag.from.y - center.y, drag.from.x - center.x);
  const after = Math.atan2(drag.to.y - center.y, drag.to.x - center.x);
  const step = after - before;
  const swept = drag.swept + Math.atan2(Math.sin(step), Math.cos(step));
  const raw = drag.startAngle + swept;
  const angle = drag.shift ? Math.round(raw / snapStep) * snapStep : raw;
  return { camera: transformAt(camera, size, center, camera.zoom, angle), swept };
}

/** A zoom tool click: twice the zoom around `point`, or half of it with `out`. */
export function clickZoom(camera: Camera, size: ViewSize, point: Point, out: boolean) {
  return transformAt(camera, size, point, camera.zoom * (out ? 0.5 : 2));
}

/** The camera turned by `degrees` clockwise around the view's center. */
export function rotateView(camera: Camera, size: ViewSize, degrees: number) {
  return transformAt(
    camera,
    size,
    { x: size.width / 2, y: size.height / 2 },
    camera.zoom,
    camera.angle + (degrees * Math.PI) / 180
  );
}

/** A camera angle in whole degrees from −180 to 180, as the status bar shows it. */
export function angleDegrees(angle: number) {
  const degrees = Math.round((angle * 180) / Math.PI) % 360;
  const wrapped = degrees > 180 ? degrees - 360 : degrees <= -180 ? degrees + 360 : degrees;
  // `-0` would show as "-0".
  return wrapped === 0 ? 0 : wrapped;
}

/** CSS pixels of a sideways zoom drag that double the zoom. */
const zoomDoubling = 120;
/** Rotation ignores the pointer this close to the view's center, where its direction is unstable. */
const rotateDeadRadius = 16;
/** Shift snaps the rotation to multiples of 15°. */
const snapStep = Math.PI / 12;
