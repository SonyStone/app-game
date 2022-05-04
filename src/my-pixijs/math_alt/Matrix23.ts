import { Vector2 } from './Vector2';

export const PI_2 = Math.PI * 2;

/**
 * Transformation matrix
 * The Matrix class as an object
 *  [a, b, tx],
 *  [c, d, ty],
 *  [0, 0, 1]
 *
 *  [ x cos(), x sin(), translateX]
 *  [-y sin(), y cos(), translateY]
 *  [     0,     0,          1]
 */
export type Matrix2x3 = [number, number, number, number, number, number];

/**
 * Applies a scale transformation to the matrix.
 *
 * @param scale - The amount to scale horizontally and vertically
 */
export function scale(scale: Vector2): Matrix3 {
  return [scale[0], 0, 0, scale[1], 0, 0];
}

/**
 * Translates the matrix on the x and y.
 *
 * @param translate - How much to translate by
 */
export function translate(translate: Vector2): Matrix3 {
  return [1, 0, 0, 1, translate[0], translate[1]];
}

/**
 * Applies a rotation transformation to the matrix.
 *
 * @param angle - The angle in radians.
 */
export function rotate(angle: number): Matrix3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return [cos, sin, -sin, cos, 0, 0];
}

export function angleTo(matrix: Matrix3): Matrix3 {
  const angle = Math.atan2(matrix[5], matrix[4]);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return [cos, sin, -sin, cos, 0, 0];
}

export function scaleTo(matrix: Matrix3): Matrix3 {
  return [matrix[0], 0, 0, matrix[3], 0, 0];
}

/**
 * Inverts this matrix
 */
export function invert(mat: Matrix3): Matrix3 {
  const a1 = mat[0];
  const b1 = mat[1];
  const c1 = mat[2];
  const d1 = mat[3];
  const tx1 = mat[4];
  const ty1 = mat[5];
  const n = a1 * d1 - b1 * c1;

  return [
    d1 / n,
    -b1 / n,
    -c1 / n,
    a1 / n,
    (c1 * ty1 - d1 * tx1) / n,
    -(a1 * ty1 - b1 * tx1) / n,
  ];
}

/**
 * Prepends the given Matrix to this Matrix.
 *
 * @param matrix - The matrices to prepend
 */
export function prepend(matrices: Matrix3[]): Matrix3 {
  const m1: Matrix3 = [1, 0, 0, 1, 0, 0];

  for (const m2 of matrices) {
    const a1 = m1[0];
    const b1 = m1[1];
    const c1 = m1[2];
    const d1 = m1[3];
    const tx1 = m1[4];
    const ty1 = m1[5];

    if (m2[0] !== 1 || m2[1] !== 0 || m2[2] !== 0 || m2[3] !== 1) {
      m1[0] = a1 * m2[0] + b1 * m2[2];
      m1[1] = a1 * m2[1] + b1 * m2[3];
      m1[2] = c1 * m2[0] + d1 * m2[2];
      m1[3] = c1 * m2[1] + d1 * m2[3];
    }

    m1[4] = tx1 * m2[0] + ty1 * m2[2] + m2[4];
    m1[5] = tx1 * m2[1] + ty1 * m2[3] + m2[5];
  }

  return m1;
}

/**
 * Appends the Matrix to Matrix.
 *
 * @param matrix - The matrices to append
 */
export function append(matrices: Matrix3[]): Matrix3 {
  const m1: Matrix3 = [1, 0, 0, 1, 0, 0];

  for (const m2 of matrices) {
    const a1 = m1[0];
    const b1 = m1[1];
    const c1 = m1[2];
    const d1 = m1[3];
    const tx1 = m1[4];
    const ty1 = m1[5];

    m1[0] = m2[0] * a1 + m2[1] * c1;
    m1[1] = m2[0] * b1 + m2[1] * d1;
    m1[2] = m2[2] * a1 + m2[3] * c1;
    m1[3] = m2[2] * b1 + m2[3] * d1;
    m1[4] = m2[4] * a1 + m2[5] * c1 + tx1;
    m1[5] = m2[4] * b1 + m2[5] * d1 + ty1;
  }

  return m1;
}

export function create(): Matrix3 {
  return [1, 0, 0, 1, 0, 0];
}

/**
 * Get a new position with the current transformation applied.
 * Can be used to go from a child's coordinate space to the world coordinate space. (e.g. rendering)
 *
 * @param pos - The origin
 * @param {PIXI.Point} [newPos] - The point that the new position is assigned to (allowed to be same as input)
 * @return {PIXI.Point} The new point, transformed through this matrix
 */
export function apply<P extends Vector2>(
  mat: Matrix3,
  pos: Vector2,
  newPos?: P
): P {
  newPos = (newPos || []) as P;

  const x = pos[0];
  const y = pos[1];

  newPos[0] = mat[0] * x + mat[2] * y + mat[4];
  newPos[1] = mat[1] * x + mat[3] * y + mat[5];

  return newPos;
}

/**
 * Get a new position with the inverse of the current transformation applied.
 * Can be used to go from the world coordinate space to a child's coordinate space. (e.g. input)
 *
 * @param pos - The origin
 * @param {PIXI.Point} [newPos] - The point that the new position is assigned to (allowed to be same as input)
 * @return {PIXI.Point} The new point, inverse-transformed through this matrix
 */
export function applyInverse<P extends Vector2>(
  mat: Matrix3,
  pos: Vector2,
  newPos?: P
): P {
  newPos = (newPos || []) as P;

  const id = 1 / (mat[0] * mat[3] + mat[2] * -mat[1]);

  const x = pos[0];
  const y = pos[1];

  newPos[0] =
    mat[3] * id * x +
    -mat[2] * id * y +
    (mat[5] * mat[2] - mat[4] * mat[3]) * id;
  newPos[0] =
    mat[0] * id * y +
    -mat[1] * id * x +
    (-mat[5] * mat[0] + mat[4] * mat[1]) * id;

  return newPos;
}

/**
 * Sets the matrix based on all the available properties
 *
 * @param x - Position on the x axis
 * @param y - Position on the y axis
 * @param pivotX - Pivot on the x axis
 * @param pivotY - Pivot on the y axis
 * @param scaleX - Scale on the x axis
 * @param scaleY - Scale on the y axis
 * @param rotation - Rotation in radians
 * @param skewX - Skew on the x axis
 * @param skewY - Skew on the y axis
 * @return This matrix. Good for chaining method calls.
 */
export function setTransform(
  mat: Matrix3,
  x: number,
  y: number,
  pivotX: number,
  pivotY: number,
  scaleX: number,
  scaleY: number,
  rotation: number,
  skewX: number,
  skewY: number
): Matrix3 {
  mat[0] = Math.cos(rotation + skewY) * scaleX;
  mat[1] = Math.sin(rotation + skewY) * scaleX;
  mat[2] = -Math.sin(rotation - skewX) * scaleY;
  mat[3] = Math.cos(rotation - skewX) * scaleY;

  mat[4] = x - (pivotX * mat[0] + pivotY * mat[2]);
  mat[5] = y - (pivotX * mat[1] + pivotY * mat[3]);

  return mat;
}

interface Transform {
  rotation: number;
  skew: Vector2;
  scale: Vector2;
  position: Vector2;
  pivot: Vector2;
}

/**
 * Decomposes the matrix (x, y, scaleX, scaleY, and rotation) and sets the properties on to a transform.
 *
 * @param transform - The transform to apply the properties to.
 * @return The transform with the newly applied properties
 */
export function decompose(mat: Matrix3, transform: Transform): Transform {
  // sort out rotation / skew..
  const a = mat[0];
  const b = mat[1];
  const c = mat[2];
  const d = mat[3];
  const pivot = transform.pivot;

  const skewX = -Math.atan2(-c, d);
  const skewY = Math.atan2(b, a);

  const delta = Math.abs(skewX + skewY);

  if (delta < 0.00001 || Math.abs(PI_2 - delta) < 0.00001) {
    transform.rotation = skewY;
    transform.skew[0] = transform.skew[1] = 0;
  } else {
    transform.rotation = 0;
    transform.skew[0] = skewX;
    transform.skew[1] = skewY;
  }

  // next set scale
  transform.scale[0] = Math.sqrt(a * a + b * b);
  transform.scale[1] = Math.sqrt(c * c + d * d);

  // next set position
  transform.position[0] = mat[4] + (pivot[0] * a + pivot[1] * c);
  transform.position[1] = mat[5] + (pivot[0] * b + pivot[1] * d);

  return transform;
}

/**
 * Resets this Matrix to an identity (default) matrix.
 *
 * @return This matrix. Good for chaining method calls.
 */
export function identity(mat: Matrix3): Matrix3 {
  mat[0] = 1;
  mat[1] = 0;
  mat[2] = 0;
  mat[3] = 1;
  mat[4] = 0;
  mat[5] = 0;

  return mat;
}

/**
 * Creates a new Matrix object with the same values as this one.
 *
 * @return A copy of this matrix. Good for chaining method calls.
 */
export function clone(mat: Matrix3): Matrix3 {
  const matrix: Matrix3 = [mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]];

  return matrix;
}

/**
 * Changes the values of the given matrix to be the same as the ones in this matrix
 *
 * @param matrix - The matrix to copy to.
 * @return The matrix given in parameter with its values updated.
 */
export function copyTo(mat: Matrix3, matrix: Matrix3): Matrix3 {
  matrix[0] = mat[0];
  matrix[1] = mat[1];
  matrix[2] = mat[2];
  matrix[3] = mat[3];
  matrix[4] = mat[4];
  matrix[5] = mat[5];

  return matrix;
}

/**
 * Changes the values of the matrix to be the same as the ones in given matrix
 *
 * @param {Matrix3} matrix - The matrix to copy from.
 * @return {Matrix3} this
 */
export function copyFrom(mat: Matrix3, matrix: Matrix3): Matrix3 {
  mat[0] = matrix[0];
  mat[1] = matrix[1];
  mat[2] = matrix[2];
  mat[3] = matrix[3];
  mat[4] = matrix[4];
  mat[5] = matrix[5];

  return mat;
}

// #if _DEBUG
export function toString(mat: Matrix3): string {
  return `[math:Matrix a${mat[0]} b${mat[1]} c${mat[2]} d${mat[3]} tx${mat[4]} ty${mat[5]}]`;
}

export function toCSSString(mat: Matrix3): string {
  return `matrix(${mat[0]}, ${mat[1]}, ${mat[2]}, ${mat[3]}, ${mat[4]}, ${mat[5]})`;
}

/**
 * A default (identity) matrix
 */
export const IDENTITY = (): Matrix3 => [1, 0, 0, 1, 0, 0];

/**
 * A temp matrix
 */
export const TEMP_MATRIX = (): Matrix3 => [1, 0, 0, 1, 0, 0];
