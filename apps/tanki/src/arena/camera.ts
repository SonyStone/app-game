import type { Container } from 'pixi.js';

type Point = { x: number; y: number };
type Size = { width: number; height: number };

/**
 * A view onto the arena: center in world coordinates, zoom in screen pixels per world pixel,
 * and rotation in radians. A positive rotation turns the world clockwise on screen.
 */
export type Camera = ReturnType<typeof createCamera>;

/** Creates a camera centered on `center` at Godot's `Camera2D` zoom of 2. */
export function createCamera(center: Point) {
  return { x: center.x, y: center.y, zoom: DEFAULT_ZOOM, rotation: 0 };
}

/**
 * Moves the camera just enough to keep `target` inside the central drag box, as Godot's
 * `Camera2D` does with its default drag margins of 20% of the half screen.
 */
export function followTarget(camera: Camera, target: Point, screen: Size) {
  const offset = rotate({ x: target.x - camera.x, y: target.y - camera.y }, camera.rotation);
  const limitX = ((screen.width / 2) * DRAG_MARGIN) / camera.zoom;
  const limitY = ((screen.height / 2) * DRAG_MARGIN) / camera.zoom;
  const shift = {
    x: offset.x - clamp(offset.x, -limitX, limitX),
    y: offset.y - clamp(offset.y, -limitY, limitY)
  };
  const worldShift = rotate(shift, -camera.rotation);
  camera.x += worldShift.x;
  camera.y += worldShift.y;
}

/** Multiplies the zoom by `factor`, keeping it between 0.25 and 6. */
export function zoomCamera(camera: Camera, factor: number) {
  camera.zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
}

/** Places `layer`, the container holding the world, so that the camera's view fills `screen`. */
export function applyCamera(camera: Camera, layer: Container, screen: Size) {
  layer.pivot.set(camera.x, camera.y);
  layer.position.set(screen.width / 2, screen.height / 2);
  layer.scale.set(camera.zoom);
  layer.rotation = camera.rotation;
}

/** Converts a point in screen pixels to world coordinates. */
export function screenToWorld(camera: Camera, point: Point, screen: Size) {
  const local = rotate(
    { x: (point.x - screen.width / 2) / camera.zoom, y: (point.y - screen.height / 2) / camera.zoom },
    -camera.rotation
  );

  return { x: camera.x + local.x, y: camera.y + local.y };
}

/** Converts a point in world coordinates to screen pixels, the inverse of `screenToWorld`. */
export function worldToScreen(camera: Camera, point: Point, screen: Size) {
  const local = rotate({ x: point.x - camera.x, y: point.y - camera.y }, camera.rotation);

  return { x: screen.width / 2 + local.x * camera.zoom, y: screen.height / 2 + local.y * camera.zoom };
}

/** Converts a direction in screen axes to world axes, so "up" on screen stays up when the view turns. */
export function screenToWorldDirection(camera: Camera, direction: Point) {
  return rotate(direction, -camera.rotation);
}

const DEFAULT_ZOOM = 2;
/** Low enough to see the whole king of the hill map at once. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const DRAG_MARGIN = 0.2;

function rotate(point: Point, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
