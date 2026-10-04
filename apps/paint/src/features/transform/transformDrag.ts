import type { Point } from '@app-game/paint-core/camera';
import { applyAffine, invertAffine } from './affine';
import { boxMatrix, boxPivot, transformMatrix, type BoxState, type Quad } from './createTransform';
import { applyProjective, isConvex } from './projective';
import type { TransformBounds } from './transformEdit';

/** A box handle: -1, 0 or 1 per axis, from the left/top edge through the middle to the right/bottom edge. */
export type BoxHandle = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

/** The box after its body is dragged from `start` to `pointer`, both in document pixels. */
export function moveBox(box: BoxState, start: Point, pointer: Point): BoxState {
  const dx = pointer.x - start.x,
    dy = pointer.y - start.y;
  if (box.corners) {
    return { ...box, corners: box.corners.map(({ x, y }) => ({ x: x + dx, y: y + dy })) as unknown as Quad };
  }

  return { ...box, offset: { x: box.offset.x + dx, y: box.offset.y + dy } };
}

/**
 * A distorted box after `handle` is dragged from `start` to `pointer`, in document pixels: a corner handle moves its
 * corner, an edge handle the two corners of its edge. A drag that would fold the quad keeps the box as it was.
 */
export function distortBox(
  box: BoxState & { corners: Quad },
  handle: BoxHandle,
  start: Point,
  pointer: Point
): BoxState {
  const dx = pointer.x - start.x,
    dy = pointer.y - start.y;
  const moved = cornersOf(handle);
  const corners = box.corners.map((corner, index) =>
    moved.includes(index) ? { x: corner.x + dx, y: corner.y + dy } : corner
  ) as unknown as Quad;
  return isConvex(corners) ? { ...box, corners } : box;
}

/** Indices of the corners, clockwise from the top-left, that a handle moves. */
function cornersOf(handle: BoxHandle): number[] {
  const corner = (x: number, y: number) => (y < 0 ? (x < 0 ? 0 : 1) : x > 0 ? 2 : 3);
  if (handle.x && handle.y) {
    return [corner(handle.x, handle.y)];
  }

  return handle.y ? [corner(-1, handle.y), corner(1, handle.y)] : [corner(handle.x, -1), corner(handle.x, 1)];
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
  // A box turns about its pivot, a distorted one about its center.
  const center = applyProjective(
    transformMatrix(bounds, box),
    box.corners ? { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 } : boxPivot(bounds, box)
  );
  const delta =
    Math.atan2(pointer.y - center.y, pointer.x - center.x) - Math.atan2(start.y - center.y, start.x - center.x);
  const step = Math.PI / 12;
  if (box.corners) {
    // A distorted box turns its corners about its center, by whole 15° steps with `snap`.
    const angle = snap ? Math.round(delta / step) * step : delta;
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const corners = box.corners.map(({ x, y }) => ({
      x: center.x + (x - center.x) * cos - (y - center.y) * sin,
      y: center.y + (x - center.x) * sin + (y - center.y) * cos
    }));
    return { ...box, corners: corners as unknown as Quad };
  }

  const turned = box.angle + delta;
  return { ...box, angle: snap ? Math.round(turned / step) * step : turned };
}

/**
 * The box with its pivot moved to where `pointer` is, in document pixels, and the offset changed so that the pixels
 * stay where they are. The box then scales and turns about that point.
 */
export function movePivot(bounds: TransformBounds, box: BoxState, pointer: Point): BoxState {
  const matrix = boxMatrix(bounds, box);
  const inverse = invertAffine(matrix);
  if (!inverse) {
    return box;
  }

  const previous = boxPivot(bounds, box);
  const pivot = applyAffine(inverse, pointer);
  // Where the old pivot's offset put the pixels, the new pivot must too: offset' = offset + d - L d for d = old - new.
  const d = { x: previous.x - pivot.x, y: previous.y - pivot.y };
  const [a, b, c, e] = matrix;
  return {
    ...box,
    pivot,
    offset: { x: box.offset.x + d.x - (a * d.x + c * d.y), y: box.offset.y + d.y - (b * d.x + e * d.y) }
  };
}

/**
 * Document points of the box's handles and center for `box`, as drawn by the overlay; a distorted box places its edge
 * handles and center in perspective.
 */
export function boxPoints(bounds: TransformBounds, box: BoxState) {
  const matrix = transformMatrix(bounds, box);
  const width = bounds.right - bounds.left,
    height = bounds.bottom - bounds.top;
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  const at = (handle: BoxHandle) =>
    applyProjective(matrix, { x: center.x + (handle.x * width) / 2, y: center.y + (handle.y * height) / 2 });
  return {
    center: applyProjective(matrix, center),
    /** Where the pivot is, for a box that is not distorted. */
    pivot: applyProjective(matrix, boxPivot(bounds, box)),
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
