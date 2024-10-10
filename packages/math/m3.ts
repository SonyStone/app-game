import { type Vec2Tuple } from './v2';

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
  | number[]
  | Float32Array;

export const createFMat3 = () => identity(new Float32Array(9) as Mat3Tuple);

export const createMat3 = () => identity(new Array(9) as Mat3Tuple);

export const set = (
  m: Mat3Tuple,
  m00: number,
  m01: number,
  m02: number,
  m10: number,
  m11: number,
  m12: number,
  m20: number,
  m21: number,
  m22: number
) => {
  m[0] = m00;
  m[1] = m01;
  m[2] = m02;
  m[3] = m10;
  m[4] = m11;
  m[5] = m12;
  m[6] = m20;
  m[7] = m21;
  m[8] = m22;
  return m;
};

/**
 * Negates a matrix.
 * @param {Mat3} m The matrix.
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} -m.
 * @memberOf m3
 */
export const negate = (m: Mat3Tuple): Mat3Tuple => {
  m[0] = -m[0];
  m[1] = -m[1];
  m[2] = -m[2];

  m[3] = -m[3];
  m[4] = -m[4];
  m[5] = -m[5];

  m[6] = -m[6];
  m[7] = -m[7];
  m[8] = -m[8];

  return m;
};

/**
 * Copies a matrix.
 * @param {Mat3} a The matrix from.
 * @param {Mat3} m The matrix to.
 * @memberOf m3
 */
export const copy = (source: Mat3Tuple, target: Mat3Tuple) => {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
  target[3] = source[3];
  target[4] = source[4];
  target[5] = source[5];
  target[6] = source[6];
  target[7] = source[7];
  target[8] = source[8];
  return target;
};

/**
 * Creates an n-by-n identity matrix.
 *
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} An n-by-n identity matrix.
 * @memberOf m3
 */
export const identity = (source: Mat3Tuple) => {
  source[0] = 1;
  source[1] = 0;
  source[2] = 0;

  source[3] = 0;
  source[4] = 1;
  source[5] = 0;

  source[6] = 0;
  source[7] = 0;
  source[8] = 1;

  return source;
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
export const invert = (m: Mat3Tuple) => {
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
    return m;
  }
  const detInv = 1 / det;

  m[0] = t00 * detInv;
  m[1] = (m20 * m12 - m22 * m10) * detInv;
  m[2] = (m21 * m10 - m20 * m11) * detInv;

  m[3] = t01 * detInv;
  m[4] = (m22 * m00 - m20 * m02) * detInv;
  m[5] = (m20 * m01 - m21 * m00) * detInv;

  m[6] = t02 * detInv;
  m[7] = (m10 * m02 - m12 * m00) * detInv;
  m[8] = (m11 * m00 - m10 * m01) * detInv;
  return m;
};

/**
 * Multiplies two 3-by-3 matrices with a on the left and b on the right
 * @param {Mat3} mLeft The matrix on the left.
 * @param {Mat3} mRight The matrix on the right.
 * @memberOf m3
 */
export const multiply = (mLeft: Mat3Tuple, mRight: Mat3Tuple) => {
  const a00 = mLeft[0];
  const a01 = mLeft[1];
  const a02 = mLeft[2];

  const a10 = mLeft[4 + 0];
  const a11 = mLeft[4 + 1];
  const a12 = mLeft[4 + 2];

  const a20 = mLeft[8 + 0];
  const a21 = mLeft[8 + 1];
  const a22 = mLeft[8 + 2];

  const b00 = mRight[0];
  const b01 = mRight[1];
  const b02 = mRight[2];

  const b10 = mRight[4 + 0];
  const b11 = mRight[4 + 1];
  const b12 = mRight[4 + 2];

  const b20 = mRight[8 + 0];
  const b21 = mRight[8 + 1];
  const b22 = mRight[8 + 2];

  mLeft[0] = a00 * b00 + a10 * b01 + a20 * b02;
  mLeft[1] = a01 * b00 + a11 * b01 + a21 * b02;
  mLeft[2] = a02 * b00 + a12 * b01 + a22 * b02;

  mLeft[3] = a00 * b10 + a10 * b11 + a20 * b12;
  mLeft[4] = a01 * b10 + a11 * b11 + a21 * b12;
  mLeft[5] = a02 * b10 + a12 * b11 + a22 * b12;

  mLeft[6] = a00 * b20 + a10 * b21 + a20 * b22;
  mLeft[7] = a01 * b20 + a11 * b21 + a21 * b22;
  mLeft[8] = a02 * b20 + a12 * b21 + a22 * b22;

  return mLeft;
};

/**
 * Returns the translation component of a 3-by-3 matrix as a vector with 3
 * entries.
 * @param {Mat3} m The matrix.
 */
export const getTranslation = (m: Mat3Tuple, v: Vec2Tuple) => {
  v[0] = m[6];
  v[1] = m[7];
  return v;
};

/**
 * Sets the translation component of a 3-by-3 matrix to the given
 * vector.
 * @param a _mut_ The matrix.
 * @param v The vector.
 */
export const setTranslation = (m: Mat3Tuple, v: Vec2Tuple) => {
  m[6] = v[0];
  m[7] = v[1];
  m[8] = 1;

  return m;
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
export const getAxis = (m: Mat3Tuple, axis: number, v: Vec2Tuple) => {
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
export const setAxis = (m: Mat3Tuple, v: Vec2Tuple, axis: number = 0) => {
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
export const translation = (m: Mat3Tuple, v: Vec2Tuple) => {
  m[0] = 1;
  m[1] = 0;
  m[2] = 0;

  m[3] = 0;
  m[4] = 1;
  m[5] = 0;

  m[6] = v[0];
  m[7] = v[1];
  m[8] = 1;

  return m;
};

/**
 * Translates the given 3-by-3 matrix by the given vector v.
 * @param {Mat3} m The matrix.
 * @param {Vec2Tuple} v The vector by
 *     which to translate.
 * @memberOf m3
 */
export const translate = (m: Mat3Tuple, v: Vec2Tuple) => {
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

  m[6] = m00 * v0 + m10 * v1 + m20;
  m[7] = m01 * v0 + m11 * v1 + m21;
  m[8] = m02 * v0 + m12 * v1 + m22;
  return m;
};

/**
 * Rotates the given 3-by-3 matrix around the x-axis by the given
 * angle.
 * @param {Mat3} m The matrix.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export const rotate2 = (m: Mat3Tuple, angleInRadians: number) => {
  const cos = Math.cos(angleInRadians);
  const sin = Math.sin(angleInRadians);

  const m10 = m[0]; // a
  const m11 = m[1]; // b

  const m20 = m[3]; // c
  const m21 = m[4]; // d

  const m30 = m[6]; // x
  const m31 = m[7]; // y

  m[0] = cos * m10 - sin * m11; // a = a - b
  m[1] = sin * m10 + cos * m11; // b = a + b

  m[3] = cos * m20 - sin * m21; // c = c - d
  m[4] = sin * m20 + cos * m21; // d = c + d

  m[6] = cos * m30 - sin * m31; // x = x - y
  m[7] = sin * m30 + cos * m31; // y = x + y
  return m;
};

export const setRotate = (m: Mat3Tuple, angleInRadians: number) => {
  const cos = Math.cos(angleInRadians);
  const sin = Math.sin(angleInRadians);

  m[0] = cos;
  m[1] = sin;
  m[3] = -sin;
  m[4] = cos;
  return m;
};

/**
 * Creates a 3-by-3 matrix which rotates around the y-axis by the given angle.
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export const rotationY = (m: Mat3Tuple, angleInRadians: number) => {
  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  m[0] = c;
  m[1] = 0;
  m[2] = -s;
  m[3] = 0;
  m[4] = 0;
  m[5] = 1;
  m[6] = 0;
  m[7] = 0;
  m[8] = s;
  m[9] = 0;
  m[10] = c;
  m[11] = 0;
  m[12] = 0;
  m[13] = 0;
  m[14] = 0;
  m[15] = 1;
  return m;
};

/**
 * Rotates the given 3-by-3 matrix around the y-axis by the given
 * angle.
 * @param {Mat3} m The matrix.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export const rotateY = (m: Mat3Tuple, angleInRadians: number) => {
  const m00 = m[0 * 3 + 0];
  const m01 = m[0 * 3 + 1];
  const m02 = m[0 * 3 + 2];

  const m20 = m[2 * 3 + 0];
  const m21 = m[2 * 3 + 1];
  const m22 = m[2 * 3 + 2];

  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  m[0] = c * m00 - s * m20;
  m[1] = c * m01 - s * m21;
  m[2] = c * m02 - s * m22;

  m[8] = c * m20 + s * m00;
  return m;
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
export const rotateZ = (m: Mat3Tuple, angleInRadians: number) => {
  const m00 = m[0 * 3 + 0];
  const m01 = m[0 * 3 + 1];
  const m02 = m[0 * 3 + 2];

  const m10 = m[1 * 3 + 0];
  const m11 = m[1 * 3 + 1];
  const m12 = m[1 * 3 + 2];

  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  m[0] = c * m00 + s * m10;
  m[1] = c * m01 + s * m11;
  m[2] = c * m02 + s * m12;

  m[4] = c * m10 - s * m00;
  m[5] = c * m11 - s * m01;
  m[6] = c * m12 - s * m02;
  return m;
};

/**
 * Creates a 3-by-3 matrix which scales in each dimension by an amount given by
 * the corresponding entry in the given vector; assumes the vector has three
 * entries.
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @param {v2.Vec2} v A vector of
 *     three entries specifying the factor by which to scale in each dimension.
 * @memberOf m3
 */
export const scaling = (m: Mat3Tuple, v: Vec2Tuple) => {
  m[0] = v[0];
  m[1] = 0;
  m[2] = 0;
  m[3] = 0;
  m[4] = 0;
  m[5] = v[1];
  m[6] = 0;
  m[7] = 0;
  m[8] = 0;
  m[9] = 0;
  m[10] = v[2];
  m[11] = 0;
  m[12] = 0;
  m[13] = 0;
  m[14] = 0;
  m[15] = 1;
  return m;
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
export const scale = (m: Mat3Tuple, v: Vec2Tuple) => {
  const v0 = v[0];
  const v1 = v[1];

  m[0] = v0 * m[0 * 3 + 0];
  m[1] = v0 * m[0 * 3 + 1];
  m[2] = v0 * m[0 * 3 + 2];

  m[3] = v1 * m[1 * 3 + 0];
  m[4] = v1 * m[1 * 3 + 1];
  m[5] = v1 * m[1 * 3 + 2];
  return m;
};

/**
 * Takes a 3-by-3 matrix and a vector with 2 entries,
 * interprets the vector as a point, transforms that point by the matrix, and
 * returns the result as a vector with 2 entries.
 *
 * @param v __mut__ The point.
 * @param m The matrix.
 */
export const transformPoint = (m: Mat3Tuple, v: Vec2Tuple) => {
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
export const transformDirection = (m: Mat3Tuple, v: Vec2Tuple) => {
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
export const transformNormal = (m: Mat3Tuple, v: Vec2Tuple) => {
  const mi = invert(copy(MI, m));

  const v0 = v[0];
  const v1 = v[1];

  v[0] = v0 * mi[0 * 4 + 0] + v1 * mi[0 * 4 + 1];
  v[1] = v0 * mi[1 * 4 + 0] + v1 * mi[1 * 4 + 1];
  return v;
};
