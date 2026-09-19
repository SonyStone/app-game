/** View center in document pixels; zoom is CSS pixels per document pixel. */
export type Camera = { x: number; y: number; zoom: number; angle: number; mirrored: boolean };
/** A point in either CSS screen pixels or document pixels, as specified by its caller. */
export type Point = { x: number; y: number };
/** Canvas bounds in CSS pixels. */
export type ViewSize = { width: number; height: number };

/** Creates a camera looking at the document origin. */
export function defaultCamera(): Camera {
  return { x: 0, y: 0, zoom: 1, angle: 0, mirrored: false };
}

/** Converts local canvas coordinates to document coordinates, including rotation and mirror. */
export function screenToWorld(point: Point, camera: Camera, view: ViewSize): Point {
  const x = (point.x - view.width / 2) / camera.zoom;
  const y = (point.y - view.height / 2) / camera.zoom;
  const c = Math.cos(camera.angle),
    s = Math.sin(camera.angle);
  return { x: camera.x + (x * c + y * s) * (camera.mirrored ? -1 : 1), y: camera.y - x * s + y * c };
}

/** Converts document coordinates to local CSS canvas pixels. */
export function worldToScreen(point: Point, camera: Camera, view: ViewSize): Point {
  const x = (point.x - camera.x) * (camera.mirrored ? -1 : 1);
  const y = point.y - camera.y;
  const c = Math.cos(camera.angle),
    s = Math.sin(camera.angle);
  return { x: view.width / 2 + (x * c - y * s) * camera.zoom, y: view.height / 2 + (x * s + y * c) * camera.zoom };
}

/** Changes zoom/rotation while keeping the document point under the anchor stationary. */
export function transformAt(camera: Camera, view: ViewSize, anchor: Point, zoom: number, angle = camera.angle): Camera {
  const before = screenToWorld(anchor, camera, view);
  const next = { ...camera, zoom: Math.max(0.05, Math.min(32, zoom)), angle };
  const after = screenToWorld(anchor, next, view);
  return { ...next, x: next.x + before.x - after.x, y: next.y + before.y - after.y };
}

/** Translates the view by a screen-space drag without modifying document pixels. */
export function panCamera(camera: Camera, view: ViewSize, delta: Point): Camera {
  const a = screenToWorld({ x: 0, y: 0 }, camera, view);
  const b = screenToWorld(delta, camera, view);
  return { ...camera, x: camera.x + a.x - b.x, y: camera.y + a.y - b.y };
}
