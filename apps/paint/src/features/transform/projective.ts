import type { Point } from '@app-game/paint-core/camera';
import type { Affine } from './affine';
import type { TransformBounds } from './transformEdit';

/**
 * A projective transform (homography) `[a, b, c, d, e, f, g, h, i]`, row by row, mapping a document point `(x, y)` to
 * `((a x + b y + c) / w, (d x + e y + f) / w)` with `w = g x + h y + i`. Affine transforms are the case `g = h = 0`,
 * `i = 1`; perspective distortions of the transform box need the rest.
 */
export type Projective = readonly [number, number, number, number, number, number, number, number, number];

/** The projective form of an affine transform. */
export function fromAffine([a, b, c, d, e, f]: Affine): Projective {
  return [a, c, e, b, d, f, 0, 0, 1];
}

/** Applies `matrix` to `point`. */
export function applyProjective(matrix: Projective, point: Point): Point {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const w = g * point.x + h * point.y + i;
  return { x: (a * point.x + b * point.y + c) / w, y: (d * point.x + e * point.y + f) / w };
}

/** `outer` after `inner`. */
export function multiplyProjective(outer: Projective, inner: Projective): Projective {
  const result: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += outer[row * 3 + k]! * inner[k * 3 + column]!;
      }

      result.push(sum);
    }
  }

  return result as unknown as Projective;
}

/** The inverse transform, or `undefined` when `matrix` collapses the plane. */
export function invertProjective(matrix: Projective): Projective | undefined {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const cofactors = [
    e * i - f * h,
    c * h - b * i,
    b * f - c * e,
    f * g - d * i,
    a * i - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d
  ];
  const determinant = a * cofactors[0]! + b * cofactors[3]! + c * cofactors[6]!;
  if (Math.abs(determinant) < 1e-12) {
    return undefined;
  }

  return cofactors.map((value) => value / determinant) as unknown as Projective;
}

/**
 * The transform that takes the corners of `bounds` (top-left, top-right, bottom-right, bottom-left) to `quad`, after
 * Heckbert's square-to-quad mapping. `quad` must be convex; see `isConvex`.
 */
export function rectToQuad(bounds: TransformBounds, quad: readonly [Point, Point, Point, Point]): Projective {
  const [p0, p1, p2, p3] = quad;
  const sx = p0.x - p1.x + p2.x - p3.x,
    sy = p0.y - p1.y + p2.y - p3.y;
  let square: Projective;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    square = [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0, 1];
  } else {
    const dx1 = p1.x - p2.x,
      dx2 = p3.x - p2.x,
      dy1 = p1.y - p2.y,
      dy2 = p3.y - p2.y;
    const denominator = dx1 * dy2 - dx2 * dy1;
    const g = (sx * dy2 - dx2 * sy) / denominator,
      h = (dx1 * sy - sx * dy1) / denominator;
    square = [
      p1.x - p0.x + g * p1.x,
      p3.x - p0.x + h * p3.x,
      p0.x,
      p1.y - p0.y + g * p1.y,
      p3.y - p0.y + h * p3.y,
      p0.y,
      g,
      h,
      1
    ];
  }

  const width = bounds.right - bounds.left,
    height = bounds.bottom - bounds.top;
  // From the bounds to the unit square, then to the quad.
  return multiplyProjective(square, [1 / width, 0, -bounds.left / width, 0, 1 / height, -bounds.top / height, 0, 0, 1]);
}

/** Whether the quad's corners, in order, make a convex shape that does not fold over itself. */
export function isConvex(quad: readonly Point[]): boolean {
  let sign = 0;
  for (let index = 0; index < quad.length; index++) {
    const a = quad[index]!,
      b = quad[(index + 1) % quad.length]!,
      c = quad[(index + 2) % quad.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) {
      return false;
    }

    if (sign === 0) {
      sign = Math.sign(cross);
    } else if (Math.sign(cross) !== sign) {
      return false;
    }
  }

  return true;
}
