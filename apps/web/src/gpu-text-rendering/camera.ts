/** Camera center in page coordinates; zoom is the inverse magnification, rotation is in radians. */
export type Camera = { x: number; y: number; zoom: number; rotation: number };

/** Canvas-local CSS coordinates, with y increasing downwards. */
export type Point = { x: number; y: number };

/** Converts CSS coordinates to page coordinates, undoing rotation before page aspect scaling. */
export function screenToWorld(camera: Camera, point: Point, width: number, height: number, pageAspect: number): Point {
  const x = (2 * point.x - width) / height;
  const y = 1 - (2 * point.y) / height;
  const c = Math.cos(camera.rotation);
  const s = Math.sin(camera.rotation);
  return {
    x: camera.x + (c * x + s * y) * camera.zoom,
    y: camera.y + (-s * x + c * y) * camera.zoom * pageAspect
  };
}

/** Applies pan, pinch and rotation together, keeping the old focal point beneath the new one. */
export function moveCamera(
  camera: Camera,
  from: Point,
  to: Point,
  scale: number,
  angle: number,
  width: number,
  height: number,
  pageAspect: number
) {
  if (width <= 0 || height <= 0 || !Number.isFinite(scale) || scale <= 0) return;
  const anchor = screenToWorld(camera, from, width, height, pageAspect);
  camera.zoom = Math.min(64, Math.max(1 / 65536, camera.zoom / scale));
  camera.rotation = Math.atan2(Math.sin(camera.rotation + angle), Math.cos(camera.rotation + angle));
  const moved = screenToWorld(camera, to, width, height, pageAspect);
  camera.x += anchor.x - moved.x;
  camera.y += anchor.y - moved.y;
}

/** Column-major matrix rotating NDC coordinates without stretching a non-square canvas. */
export function rotationMatrix(angle: number, aspect: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s / aspect, -s * aspect, c];
}
