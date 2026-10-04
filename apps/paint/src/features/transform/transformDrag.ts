import type { Point } from '@app-game/paint-core/camera';
import { applyAffine } from './affine';
import { boxMatrix, type BoxState } from './createTransform';
import type { TransformBounds } from './transformEdit';

/** A box handle: -1, 0 or 1 per axis, from the left/top edge through the middle to the right/bottom edge. */
export type BoxHandle = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

/** The box after its body is dragged from `start` to `pointer`, both in document pixels. */
export function moveBox(box: BoxState, start: Point, pointer: Point): BoxState {
  return { ...box, offset: { x: box.offset.x + pointer.x - start.x, y: box.offset.y + pointer.y - start.y } };
}

/**
 * The box after `handle` is dragged to `pointer`, in document pixels, keeping the opposite handle in place. Edge
 * handles scale one axis; corner handles scale both, keeping the proportions unless `free`. Dragging past the opposite
 * handle flips the box; a side never shrinks below one document pixel.
 */
export function scaleBox(
  bounds: TransformBounds,
  box: BoxState,
  handle: BoxHandle,
  pointer: Point,
  free: boolean
): BoxState {
  const width = bounds.right - bounds.left,
    height = bounds.bottom - bounds.top;
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  const anchor = { x: center.x - (handle.x * width) / 2, y: center.y - (handle.y * height) / 2 };
  const fixed = applyAffine(boxMatrix(bounds, box), anchor);
  // The pointer relative to the fixed handle, in the box's unrotated axes.
  const cos = Math.cos(box.angle),
    sin = Math.sin(box.angle);
  const dx = pointer.x - fixed.x,
    dy = pointer.y - fixed.y;
  const local = { x: cos * dx + sin * dy, y: -sin * dx + cos * dy };
  let scale = {
    x: handle.x ? local.x / (handle.x * width) : box.scale.x,
    y: handle.y ? local.y / (handle.y * height) : box.scale.y
  };
  if (handle.x && handle.y && !free) {
    // Project the pointer onto the current diagonal, so both axes scale by the same factor.
    const diagonal = { x: handle.x * width * box.scale.x, y: handle.y * height * box.scale.y };
    const factor = (local.x * diagonal.x + local.y * diagonal.y) / (diagonal.x ** 2 + diagonal.y ** 2);
    scale = { x: box.scale.x * factor, y: box.scale.y * factor };
  }

  scale = { x: atLeast(scale.x, 1 / width), y: atLeast(scale.y, 1 / height) };
  const scaled = { ...box, scale };
  const moved = applyAffine(boxMatrix(bounds, scaled), anchor);
  return { ...scaled, offset: { x: box.offset.x + fixed.x - moved.x, y: box.offset.y + fixed.y - moved.y } };
}

/**
 * The box after the rotation handle is dragged from `start` to `pointer`, in document pixels, about the box's center.
 * With `snap`, the angle snaps to multiples of 15°.
 */
export function rotateBox(
  bounds: TransformBounds,
  box: BoxState,
  start: Point,
  pointer: Point,
  snap: boolean
): BoxState {
  const center = applyAffine(boxMatrix(bounds, box), {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2
  });
  const turned =
    box.angle +
    Math.atan2(pointer.y - center.y, pointer.x - center.x) -
    Math.atan2(start.y - center.y, start.x - center.x);
  const step = Math.PI / 12;
  return { ...box, angle: snap ? Math.round(turned / step) * step : turned };
}

/** Document points of the box's handles and center for `box`, as drawn by the overlay. */
export function boxPoints(bounds: TransformBounds, box: BoxState) {
  const matrix = boxMatrix(bounds, box);
  const width = bounds.right - bounds.left,
    height = bounds.bottom - bounds.top;
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  const at = (handle: BoxHandle) =>
    applyAffine(matrix, { x: center.x + (handle.x * width) / 2, y: center.y + (handle.y * height) / 2 });
  return {
    center: applyAffine(matrix, center),
    corners: [at({ x: -1, y: -1 }), at({ x: 1, y: -1 }), at({ x: 1, y: 1 }), at({ x: -1, y: 1 })],
    handles: handles.map((handle) => ({ handle, point: at(handle) }))
  };
}

/** Corner and edge handles, clockwise from the top-left corner. */
export const handles: readonly BoxHandle[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 }
];

/** `value` with a magnitude of at least `minimum`, keeping its sign. */
function atLeast(value: number, minimum: number) {
  return Math.abs(value) < minimum ? (value < 0 ? -minimum : minimum) : value;
}
