import type { Point } from '@app-game/paint-core/camera';

/**
 * A 2D affine transform `[a, b, c, d, e, f]` mapping a document point `(x, y)` to `(a x + c y + e, b x + d y + f)`,
 * as in Canvas 2D and SVG.
 */
export type Affine = readonly [number, number, number, number, number, number];

/** The transform that changes nothing. */
export const identity: Affine = [1, 0, 0, 1, 0, 0];

/** Applies `matrix` to `point`. */
export function applyAffine(matrix: Affine, point: Point): Point {
  const [a, b, c, d, e, f] = matrix;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

/** `outer` after `inner`: applying the result equals applying `inner`, then `outer`. */
export function multiplyAffine(outer: Affine, inner: Affine): Affine {
  const [a, b, c, d, e, f] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
}

/** The inverse transform, or `undefined` when `matrix` collapses the plane to a line or a point. */
export function invertAffine(matrix: Affine): Affine | undefined {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9) {
    return undefined;
  }

  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant
  ];
}

/**
 * The transform of a box edited with handles: scaled by `scale` (negative values flip) and rotated by `angle` radians
 * clockwise about `pivot`, then moved by `offset`.
 */
export function boxAffine(options: { pivot: Point; scale: Point; angle: number; offset: Point }): Affine {
  const { pivot, scale, angle, offset } = options;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const linear: Affine = [cos * scale.x, sin * scale.x, -sin * scale.y, cos * scale.y, 0, 0];
  const moved = applyAffine(linear, pivot);
  return [linear[0], linear[1], linear[2], linear[3], pivot.x - moved.x + offset.x, pivot.y - moved.y + offset.y];
}
