import * as v3 from "./v3";
import * as v2 from "./v2";

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
 * @module twgl/m3
 */
let MatType = Float32Array;

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
export type Mat3 = number[] | Float32Array;

/**
 * Sets the type this library creates for a Mat3
 * @param {constructor} ctor the constructor for the type. Either `Float32Array` or `Array`
 * @return {constructor} previous constructor for Mat3
 * @memberOf m3
 */
export function setDefaultType(ctor: typeof MatType) {
  const oldType = MatType;
  MatType = ctor;
  return oldType;
}

/**
 * Negates a matrix.
 * @param {Mat3} m The matrix.
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} -m.
 * @memberOf m3
 */
export function negate(m: Mat3): void {
  m[0] = -m[0];
  m[1] = -m[1];
  m[2] = -m[2];

  m[3] = -m[3];
  m[4] = -m[4];
  m[5] = -m[5];

  m[6] = -m[6];
  m[7] = -m[7];
  m[8] = -m[8];
}

/**
 * Copies a matrix.
 * @param {Mat3} a The matrix.
 * @param {Mat3} b The matrix.
 * @memberOf m3
 */
export function copy(a: Mat3, b: Mat3): void {
  a[0] = b[0];
  a[1] = b[1];
  a[2] = b[2];
  a[3] = b[3];
  a[4] = b[4];
  a[5] = b[5];
  a[6] = b[6];
  a[7] = b[7];
  a[8] = b[8];
}

/**
 * Creates an n-by-n identity matrix.
 *
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} An n-by-n identity matrix.
 * @memberOf m3
 */
export function identity(m: Mat3 = new MatType(9)): Mat3 {
  m[0] = 1;
  m[1] = 0;
  m[2] = 0;

  m[3] = 0;
  m[4] = 1;
  m[5] = 0;

  m[6] = 0;
  m[7] = 0;
  m[8] = 1;

  return m;
}

/**
 * Takes the transpose of a matrix.
 * @param {Mat3} m The matrix.
 * @memberOf m3
 */
export function transpose(m: Mat3): void {
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
}

/**
 * Computes the inverse of a 3-by-3 matrix.
 * @param {Mat3} m The matrix.
 * @memberOf m3
 */
export function inverse(m: Mat3): void {
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
  const det = m00 * t00 + m10 * t01 + m20 * t02;

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
}

/**
 * Multiplies two 3-by-3 matrices with a on the left and b on the right
 * @param {Mat3} a The matrix on the left.
 * @param {Mat3} b The matrix on the right.
 * @memberOf m3
 */
export function multiply(a: Mat3, b: Mat3): void {
  const a00 = a[0];
  const a01 = a[1];
  const a02 = a[2];

  const a10 = a[4 + 0];
  const a11 = a[4 + 1];
  const a12 = a[4 + 2];

  const a20 = a[8 + 0];
  const a21 = a[8 + 1];
  const a22 = a[8 + 2];

  const b00 = b[0];
  const b01 = b[1];
  const b02 = b[2];

  const b10 = b[4 + 0];
  const b11 = b[4 + 1];
  const b12 = b[4 + 2];

  const b20 = b[8 + 0];
  const b21 = b[8 + 1];
  const b22 = b[8 + 2];

  a[0] = a00 * b00 + a10 * b01 + a20 * b02;
  a[1] = a01 * b00 + a11 * b01 + a21 * b02;
  a[2] = a02 * b00 + a12 * b01 + a22 * b02;

  a[3] = a00 * b10 + a10 * b11 + a20 * b12;
  a[4] = a01 * b10 + a11 * b11 + a21 * b12;
  a[5] = a02 * b10 + a12 * b11 + a22 * b12;

  a[6] = a00 * b20 + a10 * b21 + a20 * b22;
  a[7] = a01 * b20 + a11 * b21 + a21 * b22;
  a[8] = a02 * b20 + a12 * b21 + a22 * b22;
}

/**
 * Sets the translation component of a 3-by-3 matrix to the given
 * vector.
 * @param a _mut_ The matrix.
 * @param v The vector.
 */
export function setTranslation(m: Mat3, v: v2.Vec2) {
  m[6] = v[0];
  m[7] = v[1];
  m[8] = 1;
}

/**
 * Returns the translation component of a 3-by-3 matrix as a vector with 3
 * entries.
 * @param {Mat3} m The matrix.
 */
export function getTranslation(v: v2.Vec2, m: Mat3): void {
  v[0] = m[6];
  v[1] = m[7];
}

/**
 * Returns the translation component of a 3-by-3 matrix as a vector with 3
 * entries.
 * @param {Mat3} m The matrix.
 */
export function getX(m: Mat3): number {
  return m[6];
}

/**
 * Returns the translation component of a 3-by-3 matrix as a vector with 3
 * entries.
 * @param {Mat3} m The matrix.
 */
export function getY(m: Mat3): number {
  return m[7];
}

/**
 * Returns an axis of a 3x3 matrix as a vector with 2 entries
 * @param {Mat3} m The matrix.
 * @param {number} axis The axis 0 = x, 1 = y;
 */
export function getAxis(m: Mat3, axis: number): v2.Vec2 {
  const v = v2.create();

  const off = axis * 3;
  v[0] = m[off + 0];
  v[1] = m[off + 1];

  return v;
}

/**
 * Sets an axis of a 3x3 matrix as a vector with 2 entries
 * @param {Mat3} m The matrix.
 * @param {v2.Vec2} v the axis vector
 * @param {number} axis The axis  0 = x, 1 = y;
 */
export function setAxis(m: Mat3, v: v2.Vec2, axis: number = 0): void {
  const off = axis * 3;
  m[off + 0] = v[0];
  m[off + 1] = v[1];
}

/**
 * Creates a 3-by-3 matrix which translates by the given vector v.
 * @param {v2.Vec2} v The vector by
 *     which to translate.
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The translation matrix.
 * @memberOf m3
 */
export function translation(v: v2.Vec2, m: Mat3 = new MatType(9)): Mat3 {
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
}

/**
 * Translates the given 3-by-3 matrix by the given vector v.
 * @param {Mat3} m The matrix.
 * @param {v2.Vec2} v The vector by
 *     which to translate.
 * @memberOf m3
 */
export function translate(m: Mat3, v: v2.Vec2): void {
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
}

/**
 * Rotates the given 3-by-3 matrix around the x-axis by the given
 * angle.
 * @param {Mat3} m The matrix.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export function rotate2(m: Mat3, angleInRadians: number): void {
  const cos = Math.cos(angleInRadians);
  const sin = Math.sin(angleInRadians);

  const m10 = m[0]; // a
  const m11 = m[1]; // b

  const m20 = m[3]; // c
  const m21 = m[4]; // d

  const m30 = m[6]; // x
  const m31 = m[7]; // y

  m[0] = cos * m10 - sin * m11; // a - b
  m[1] = cos * m11 + sin * m10; // a + b

  m[3] = cos * m20 - sin * m21; // c - d
  m[4] = cos * m21 + sin * m20; // d + c

  m[6] = cos * m30 - sin * m31; // x - y
  m[7] = cos * m31 + sin * m30; // y + x
}

export function setRotate(m: Mat3, angleInRadians: number): void {
  const cos = Math.cos(angleInRadians);
  const sin = Math.sin(angleInRadians);

  m[0] = cos;
  m[1] = sin;
  m[3] = -sin;
  m[4] = cos;
}

/**
 * Creates a 3-by-3 matrix which rotates around the y-axis by the given angle.
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export function rotationY(m: Mat3, angleInRadians: number): void {
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
}

/**
 * Rotates the given 3-by-3 matrix around the y-axis by the given
 * angle.
 * @param {Mat3} m The matrix.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export function rotateY(m: Mat3, angleInRadians: number): void {
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
}

/**
 * Creates a 3-by-3 matrix which rotates around the z-axis by the given angle.
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export function rotationZ(m: Mat3, angleInRadians: number): void {
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
}

/**
 * Rotates the given 3-by-3 matrix around the z-axis by the given
 * angle.
 * @param {Mat3} m The matrix.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @memberOf m3
 */
export function rotateZ(m: Mat3, angleInRadians: number): void {
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
}

/**
 * Creates a 3-by-3 matrix which scales in each dimension by an amount given by
 * the corresponding entry in the given vector; assumes the vector has three
 * entries.
 * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
 * @param {v2.Vec2} v A vector of
 *     three entries specifying the factor by which to scale in each dimension.
 * @memberOf m3
 */
export function scaling(m: Mat3 = new MatType(9), v: v2.Vec2): void {
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
}

/**
 * Scales the given 3-by-3 matrix in each dimension by an amount
 * given by the corresponding entry in the given vector; assumes the vector has
 * three entries.
 * @param {Mat3} m The matrix to be modified.
 * @param {v2.Vec2} v A vector of three entries specifying the
 *     factor by which to scale in each dimension.
 * @memberOf m3
 */
export function scale(m: Mat3, v: v2.Vec2): void {
  const v0 = v[0];
  const v1 = v[1];

  m[0] = v0 * m[0 * 3 + 0];
  m[1] = v0 * m[0 * 3 + 1];
  m[2] = v0 * m[0 * 3 + 2];

  m[3] = v1 * m[1 * 3 + 0];
  m[4] = v1 * m[1 * 3 + 1];
  m[5] = v1 * m[1 * 3 + 2];
}

/**
 * Takes a 3-by-3 matrix and a vector with 2 entries,
 * interprets the vector as a point, transforms that point by the matrix, and
 * returns the result as a vector with 2 entries.
 *
 * @param v __mut__ The point.
 * @param m The matrix.
 */
export function transformPoint(v: v2.Vec2, m: Mat3): void {
  m = m || v3.create();
  const v0 = v[0];
  const v1 = v[1];
  const d = v0 * m[0 * 4 + 3] + v1 * m[1 * 4 + 3] + m[3 * 4 + 3];

  v[0] = (v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + m[3 * 4 + 0]) / d;
  v[1] = (v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + m[3 * 4 + 1]) / d;
}

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
export function transformDirection(m: Mat3, v: v2.Vec2): void {
  const v0 = v[0];
  const v1 = v[1];
  const v2 = v[2];

  m[0] = v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + v2 * m[2 * 4 + 0];
  m[1] = v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + v2 * m[2 * 4 + 1];
  m[2] = v0 * m[0 * 4 + 2] + v1 * m[1 * 4 + 2] + v2 * m[2 * 4 + 2];
}

let mi = identity();

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
export function transformNormal(v: v2.Vec2, m: Mat3): void {
  copy(mi, m);
  inverse(mi);

  const v0 = v[0];
  const v1 = v[1];

  v[0] = v0 * mi[0 * 4 + 0] + v1 * mi[0 * 4 + 1];
  v[1] = v0 * mi[1 * 4 + 0] + v1 * mi[1 * 4 + 1];
}
