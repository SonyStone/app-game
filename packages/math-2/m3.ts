import { NumberArray } from '@packages/math/utils/typed-array';

/**
 * 3x3 Matrix math math functions.
 *
 * Almost all functions take an optional `m` argument. If it is not passed in the
 * functions will create a new matrix. In other words you can do this
 *
 *     const mat = m3.translation([1, 2, 3]);  // Creates a new translation matrix
 *
 * or
 *
 *     const mat = m3.create();
 *     m3.translation([1, 2, 3], mat);  // Puts translation matrix in mat.
 *
 * The first style is often easier but depending on where it's used it generates garbage where
 * as there is almost never allocation with the second style.
 *
 * It is always save to pass any matrix as the destination. So for example
 *
 *     const mat = m3.identity();
 *     const trans = m3.translation([1, 2, 3]);
 *     m3.multiply(mat, trans, mat);  // Multiplies mat * trans and puts result in mat.
 *
 */

/**
 * Here is a representation of it:
 * ```
 * | 0 | 3 | 6 |
 * | 1 | 4 | 7 |
 * | 2 | 5 | 8 |
 * ```
 * ```
 * | a | c | tx|
 * | b | d | ty|
 * | 0 | 0 | 1 |
 * ```
 *
 * A JavaScript array with 16 values or a Float32Array with 16 values.
 * When created by the library will create the default type which is `Float32Array`
 * but can be set by calling {@link setDefaultType}.
 * @typedef {(number[]|Float32Array)} Mat3
 * @memberOf m3
 */
type Mat3Tuple =
  | [
      m00: number,
      m01: number,
      m02: number,
      m10: number,
      m11: number,
      m12: number,
      m20: number,
      m21: number,
      m22: number
    ]
  | NumberArray;

export const createFMat3 = () => identity(new Float32Array(9) as Mat3Tuple);

export const createMat3 = () => identity(new Array(9) as Mat3Tuple);

// Set the provided matrix values.
// prettier-ignore
export const set = <T extends NumberArray>(
  dst: T,
  m00: number, m01: number, m02: number,
  m10: number, m11: number, m12: number,
  m20: number, m21: number, m22: number
) => {
  dst[0] = m00; dst[1] = m01; dst[2] = m02;
  dst[3] = m10; dst[4] = m11; dst[5] = m12;
  dst[6] = m20; dst[7] = m21; dst[8] = m22;
  return dst;
};

/**
 * Negates a matrix.
 * @param {Mat3} m The matrix.
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} -m.
 * @memberOf m3
 */
export const negate = <T extends NumberArray>(m: Readonly<T>, dst: T) => {
  for (let i = 0; i < m.length; i++) {
    dst[i] = -m[i];
  }
};

/**
 * Copies a matrix.
 * @param {Mat3} a The matrix from.
 * @param {Mat3} m The matrix to.
 * @memberOf m3
 */
export const copy = <T extends NumberArray>(m: Readonly<T>, dst: T) => {
  for (let i = 0; i < m.length; i++) {
    dst[i] = m[i];
  }

  return dst;
};

/**
 * Creates an n-by-n identity matrix.
 *
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} An n-by-n identity matrix.
 * @memberOf m3
 */
// prettier-ignore
export const identity = <T extends NumberArray>(dst: T, offset = 0) => {
  dst[0 + offset] = 1; dst[1 + offset] = 0; dst[2 + offset] = 0;
  dst[3 + offset] = 0; dst[4 + offset] = 1; dst[5 + offset] = 0;
  dst[6 + offset] = 0; dst[7 + offset] = 0; dst[8 + offset] = 1;
  return dst;
};

/**
 * Takes the transpose of a matrix.
 * @param {Mat3} m The matrix.
 * @memberOf m3
 */
export const transpose = (m: Mat3Tuple) => {
  let t;

  t = m[1];
  m[1] = m[3];
  m[3] = t;

  t = m[2];
  m[2] = m[6];
  m[6] = t;

  t = m[5];
  m[5] = m[7];
  m[7] = t;

  return m;
};

/**
 * Computes the inverse of a 3-by-3 matrix.
 * @param {Mat3} m The matrix.
 * @memberOf m3
 */
export const invert = <T extends NumberArray>(m: Readonly<T>, dst: T) => {
  const m00 = m[0 * 3 + 0];
  const m01 = m[0 * 3 + 1];
  const m02 = m[0 * 3 + 2];

  const m10 = m[1 * 3 + 0];
  const m11 = m[1 * 3 + 1];
  const m12 = m[1 * 3 + 2];

  const m20 = m[2 * 3 + 0];
  const m21 = m[2 * 3 + 1];
  const m22 = m[2 * 3 + 2];

  const t00 = m22 * m11 - m21 * m12;
  const t01 = m21 * m02 - m22 * m01;
  const t02 = m12 * m01 - m11 * m02;

  // Calculate the determinant
  const det = m00 * t00 + m10 * t01 + m20 * t02;
  if (!det) {
    return copy(m, dst);
  }
  const detInv = 1 / det;

  dst[0] = t00 * detInv;
  dst[1] = (m20 * m12 - m22 * m10) * detInv;
  dst[2] = (m21 * m10 - m20 * m11) * detInv;

  dst[3] = t01 * detInv;
  dst[4] = (m22 * m00 - m20 * m02) * detInv;
  dst[5] = (m20 * m01 - m21 * m00) * detInv;

  dst[6] = t02 * detInv;
  dst[7] = (m10 * m02 - m12 * m00) * detInv;
  dst[8] = (m11 * m00 - m10 * m01) * detInv;

  return dst;
};

/**
 * Multiplies two 3-by-3 matrices with a on the left and b on the right
 * @param {Mat3} mLeft The matrix on the left.
 * @param {Mat3} mRight The matrix on the right.
 * @memberOf m3
 */
export const multiply = <T extends NumberArray>(a: Readonly<T>, b: Readonly<T>, dst: T) => {
  dst[0] = a[0] * b[0] + a[1] * b[3] + a[2] * b[6];
  dst[1] = a[0] * b[1] + a[1] * b[4] + a[2] * b[7];
  dst[2] = a[0] * b[2] + a[1] * b[5] + a[2] * b[8];
  // Row 1
  dst[3] = a[3] * b[0] + a[4] * b[3] + a[5] * b[6];
  dst[4] = a[3] * b[1] + a[4] * b[4] + a[5] * b[7];
  dst[5] = a[3] * b[2] + a[4] * b[5] + a[5] * b[8];
  // Row 2
  dst[6] = a[6] * b[0] + a[7] * b[3] + a[8] * b[6];
  dst[7] = a[6] * b[1] + a[7] * b[4] + a[8] * b[7];
  dst[8] = a[6] * b[2] + a[7] * b[5] + a[8] * b[8];
};

// Create a 2D orthographic projection matrix as a 3x3 matrix.
// This maps [0,width]x[0,height] to NDC [-1,1].
// prettier-ignore
export const ortho2D = <T extends NumberArray>(dst: T, width: number, height: number) => {
  dst[0] = 2 / width; dst[1] = 0;          dst[2] = 0;
  dst[3] = 0;         dst[4] = 2 / height; dst[5] = 0;
  dst[6] = -1;        dst[7] = -1;         dst[8] = 1;
};

/**
 * Returns the translation component of a 3-by-3 matrix as a vector with 3
 * entries.
 * @param {Mat3} m The matrix.
 */
export const getTranslation = (m: Mat3Tuple, v: NumberArray) => {
  v[0] = m[6];
  v[1] = m[7];
  return v;
};

/**
 * Returns the translation component of a 3-by-3 matrix as a vector with 3
 * entries.
 * @param {Mat3} m The matrix.
 */
export const getX = (m: Mat3Tuple) => {
  return m[6];
};

/**
 * Returns the translation component of a 3-by-3 matrix as a vector with 3
 * entries.
 * @param {Mat3} m The matrix.
 */
export const getY = (m: Mat3Tuple) => {
  return m[7];
};

/**
 * Returns an axis of a 3x3 matrix as a vector with 2 entries
 * @param {Mat3} m The matrix.
 * @param {number} axis The axis 0 = x, 1 = y;
 */
export const getAxis = (m: Mat3Tuple, axis: number, v: NumberArray) => {
  const off = axis * 3;
  v[0] = m[off + 0];
  v[1] = m[off + 1];

  return v;
};

/**
 * Sets an axis of a 3x3 matrix as a vector with 2 entries
 * @param {Mat3} m The matrix.
 * @param {Vec2Tuple} v the axis vector
 * @param {number} axis The axis  0 = x, 1 = y;
 */
export const setAxis = (m: Mat3Tuple, v: NumberArray, axis: number = 0) => {
  const off = axis * 3;
  m[off + 0] = v[0];
  m[off + 1] = v[1];
  return m;
};

/**
 * Creates a 3-by-3 matrix which translates by the given vector v.
 * @param {Vec2Tuple} v The vector by
 *     which to translate.
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The translation matrix.
 * @memberOf m3
 */
// prettier-ignore
export const setTranslation = <T extends NumberArray>(dst: T, v: NumberArray, offset = 0) => {
  dst[0 + offset] = 1;    dst[1 + offset] = 0;    dst[2 + offset] = 0;
  dst[3 + offset] = 0;    dst[4 + offset] = 1;    dst[5 + offset] = 0;
  dst[6 + offset] = v[0]; dst[7 + offset] = v[1]; dst[8 + offset] = 1;
};

/**
 * Translates the given 3-by-3 matrix by the given vector v.
 * @param {Mat3} m The matrix.
 * @param {Vec2Tuple} v The vector by
 *     which to translate.
 * @memberOf m3
 */
export const translate = <T extends NumberArray>(m: T, v: NumberArray, dst: T) => {
  const v0 = v[0];
  const v1 = v[1];

  const m00 = m[0];
  const m01 = m[1];
  const m02 = m[2];

  const m10 = m[1 * 3 + 0];
  const m11 = m[1 * 3 + 1];
  const m12 = m[1 * 3 + 2];

  const m20 = m[2 * 3 + 0];
  const m21 = m[2 * 3 + 1];
  const m22 = m[2 * 3 + 2];

  dst[6] = m00 * v0 + m10 * v1 + m20;
  dst[7] = m01 * v0 + m11 * v1 + m21;
  dst[8] = m02 * v0 + m12 * v1 + m22;
};

export const rotate = <T extends NumberArray>(m: T, angleInRadians: number, dst: T) => {
  const cos = Math.cos(angleInRadians);
  const sin = Math.sin(angleInRadians);

  const m00 = m[0]; // a
  const m01 = m[1]; // b

  const m10 = m[3]; // c
  const m11 = m[4]; // d

  const m20 = m[6]; // x
  const m21 = m[7]; // y

  dst[0] = cos * m00 - sin * m01; // a = a - b
  dst[1] = sin * m00 + cos * m01; // b = a + b

  dst[3] = cos * m10 - sin * m11; // c = c - d
  dst[4] = sin * m10 + cos * m11; // d = c + d

  dst[6] = cos * m20 - sin * m21; // x = x - y
  dst[7] = sin * m20 + cos * m21; // y = x + y
};

/**
 * Rotates the given 3-by-3 matrix around the x-axis by the given
 * angle.
 * @param {Mat3} m The matrix.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export const rotate2 = <T extends NumberArray>(m: T, angleInRadians: number, dst: T) => {
  const cos = Math.cos(angleInRadians);
  const sin = Math.sin(angleInRadians);

  const m10 = m[0]; // a
  const m11 = m[1]; // b

  const m20 = m[3]; // c
  const m21 = m[4]; // d

  const m30 = m[6]; // x
  const m31 = m[7]; // y

  dst[0] = cos * m10 - sin * m11; // a = a - b
  dst[1] = sin * m10 + cos * m11; // b = a + b

  dst[3] = cos * m20 - sin * m21; // c = c - d
  dst[4] = sin * m20 + cos * m21; // d = c + d

  dst[6] = cos * m30 - sin * m31; // x = x - y
  dst[7] = sin * m30 + cos * m31; // y = x + y
};

// prettier-ignore
export const setRotate = <T extends NumberArray>(dst: T, angleInRadians: number) => {
  const cos = Math.cos(angleInRadians);
  const sin = Math.sin(angleInRadians);

  dst[0] = cos;  dst[1] = -sin;  dst[2] = 0;
  dst[3] = sin;  dst[4] = cos;   dst[5] = 0;
  dst[6] = 0;    dst[7] = 0;     dst[8] = 1;
};

/**
 * Creates a 3-by-3 matrix which rotates around the y-axis by the given angle.
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export const rotationY = <T extends NumberArray>(angleInRadians: number, dst: T) => {
  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  dst[0] = c;
  dst[1] = 0;
  dst[2] = -s;
  dst[3] = 0;
  dst[4] = 0;
  dst[5] = 1;
  dst[6] = 0;
  dst[7] = 0;
  dst[8] = s;
  dst[9] = 0;
  dst[10] = c;
  dst[11] = 0;
  dst[12] = 0;
  dst[13] = 0;
  dst[14] = 0;
  dst[15] = 1;
};

/**
 * Rotates the given 3-by-3 matrix around the y-axis by the given
 * angle.
 * @param {Mat3} m The matrix.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export const rotateY = <T extends NumberArray>(m: T, angleInRadians: number, dst: T) => {
  const m00 = m[0 * 3 + 0];
  const m01 = m[0 * 3 + 1];
  const m02 = m[0 * 3 + 2];

  const m20 = m[2 * 3 + 0];
  const m21 = m[2 * 3 + 1];
  const m22 = m[2 * 3 + 2];

  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  dst[0] = c * m00 - s * m20;
  dst[1] = c * m01 - s * m21;
  dst[2] = c * m02 - s * m22;

  dst[8] = c * m20 + s * m00;
};

/**
 * Creates a 3-by-3 matrix which rotates around the z-axis by the given angle.
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export const rotationZ = (m: Mat3Tuple, angleInRadians: number) => {
  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  m[0] = c;
  m[1] = s;
  m[2] = 0;
  m[3] = 0;
  m[4] = -s;
  m[5] = c;
  m[6] = 0;
  m[7] = 0;
  m[8] = 0;
  m[9] = 0;
  m[10] = 1;
  m[11] = 0;
  m[12] = 0;
  m[13] = 0;
  m[14] = 0;
  m[15] = 1;
  return m;
};

/**
 * Rotates the given 3-by-3 matrix around the z-axis by the given
 * angle.
 * @param {Mat3} m The matrix.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export const rotateZ = <T extends NumberArray>(m: T, angleInRadians: number, dst: T) => {
  const m00 = m[0 * 3 + 0];
  const m01 = m[0 * 3 + 1];
  const m02 = m[0 * 3 + 2];

  const m10 = m[1 * 3 + 0];
  const m11 = m[1 * 3 + 1];
  const m12 = m[1 * 3 + 2];

  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  dst[0] = c * m00 + s * m10;
  dst[1] = c * m01 + s * m11;
  dst[2] = c * m02 + s * m12;

  dst[4] = c * m10 - s * m00;
  dst[5] = c * m11 - s * m01;
  dst[6] = c * m12 - s * m02;
};

/**
 * Scales the given 3-by-3 matrix in each dimension by an amount
 * given by the corresponding entry in the given vector; assumes the vector has
 * three entries.
 * @param {Mat3} m The matrix to be modified.
 * @param {v2.Vec2} v A vector of three entries specifying the
 *     factor by which to scale in each dimension.
 * @memberOf m3
 */
export const scale = <T extends NumberArray>(m: Readonly<T>, v: Readonly<NumberArray>, dst: T, offset = 0) => {
  const v0 = v[0];
  const v1 = v[1];

  {
    const row = 0 * 3;
    dst[row + 0 + offset] = v0 * m[row + 0 + offset];
    dst[row + 1 + offset] = v0 * m[row + 1 + offset];
    dst[row + 2 + offset] = v0 * m[row + 2 + offset];
  }
  {
    const row = 1 * 3;
    dst[row + 0 + offset] = v1 * m[row + 0 + offset];
    dst[row + 1 + offset] = v1 * m[row + 1 + offset];
    dst[row + 2 + offset] = v1 * m[row + 2 + offset];
  }
};

// prettier-ignore
export const setScale = <T extends NumberArray>(dst: T, v: Readonly<NumberArray>, offset = 0) => {
  dst[0 + offset] = v[0]; dst[1 + offset] = 0;    dst[2 + offset] = 0;
  dst[3 + offset] = 0;    dst[4 + offset] = v[1]; dst[5 + offset] = 0;
  dst[6 + offset] = 0;    dst[7 + offset] = 0;    dst[8 + offset] = 1;
}

/**
 * Takes a 3-by-3 matrix and a vector with 2 entries,
 * interprets the vector as a point, transforms that point by the matrix, and
 * returns the result as a vector with 2 entries.
 *
 * @param v __mut__ The point.
 * @param m The matrix.
 */
export const transformPoint = (m: Mat3Tuple, v: NumberArray) => {
  const v0 = v[0];
  const v1 = v[1];
  const d = v0 * m[0 * 4 + 3] + v1 * m[1 * 4 + 3] + m[3 * 4 + 3];

  v[0] = (v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + m[3 * 4 + 0]) / d;
  v[1] = (v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + m[3 * 4 + 1]) / d;
  return m;
};

/**
 * Takes a 3-by-3 matrix and a vector with 3 entries, interprets the vector as a
 * direction, transforms that direction by the matrix, and returns the result;
 * assumes the transformation of 3-dimensional space represented by the matrix
 * is parallel-preserving, i.e. any combination of rotation, scaling and
 * translation, but not a perspective distortion. Returns a vector with 3
 * entries.
 * @param m __mut__ The matrix.
 * @param v The direction.
 */
export const transformDirection = (m: Mat3Tuple, v: NumberArray) => {
  const v0 = v[0];
  const v1 = v[1];
  const v2 = v[2];

  m[0] = v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + v2 * m[2 * 4 + 0];
  m[1] = v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + v2 * m[2 * 4 + 1];
  m[2] = v0 * m[0 * 4 + 2] + v1 * m[1 * 4 + 2] + v2 * m[2 * 4 + 2];
  return this;
};

const MI = identity([]);

/**
 * Takes a 3-by-3 matrix m and a vector v with 2 entries, interprets the vector
 * as a normal to a surface, and computes a vector which is normal upon
 * transforming that surface by the matrix. The effect of this function is the
 * same as transforming v (as a direction) by the inverse-transpose of m.  This
 * function assumes the transformation of 3-dimensional space represented by the
 * matrix is parallel-preserving, i.e. any combination of rotation, scaling and
 * translation, but not a perspective distortion.  Returns a vector with 3
 * entries.
 * @param v __mut__ The normal.
 * @param m The matrix.
 */
export const transformNormal = (m: Mat3Tuple, v: NumberArray) => {
  const mi = invert(copy(MI, m), createMat3());

  const v0 = v[0];
  const v1 = v[1];

  v[0] = v0 * mi[0 * 4 + 0] + v1 * mi[0 * 4 + 1];
  v[1] = v0 * mi[1 * 4 + 0] + v1 * mi[1 * 4 + 1];
  return v;
};

// prettier-ignore
export const camera2D = (
  zoom: number,
  rotation: number,
  translationVec: NumberArray,
  width: number,
  height: number,
  dst: Mat3Tuple
) => {

  const transX = translationVec[0];
  const transY = translationVec[1];

  const a = 2 / width;
  const b = 2 / height;
  const tx = -1;
  const ty = -1;

  const invScale = 1 / zoom;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);

  const m00 = a * cosR * invScale;
  const m10 = b * -sinR * invScale;
  const m01 = a * sinR * invScale;
  const m11 = b * cosR * invScale;
  const m02 = a * -transX + tx;
  const m12 = b * -transY + ty;

  dst[0] = m00; dst[1] = m10; dst[2] = 0; dst[3] = 0
  dst[4] = m01; dst[5] = m11; dst[6] = 0; dst[7] = 0
  dst[8] = m02; dst[9] = m12; dst[10] = 1; dst[11] = 0
}
