import * as v3 from './v3';
import * as v2 from './v2';

/**
 * 4x4 Matrix math math functions.
 *
 * Almost all functions take an optional `dst` argument. If it is not passed in the
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
 * A JavaScript array with 16 values or a Float32Array with 16 values.
 * When created by the library will create the default type which is `Float32Array`
 * but can be set by calling {@link setDefaultType}.
 * @typedef {(number[]|Float32Array)} Mat3
 * @memberOf m3
 */
type Mat3 = number[] | Float32Array;

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
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} -m.
 * @memberOf m3
 */
export function negate(m: Mat3, dst: Mat3 = new MatType(9)): Mat3 {
  dst[0] = -m[0];
  dst[1] = -m[1];
  dst[2] = -m[2];
  dst[3] = -m[3];
  dst[4] = -m[4];
  dst[5] = -m[5];
  dst[6] = -m[6];
  dst[7] = -m[7];
  dst[8] = -m[8];

  return dst;
}

/**
 * Copies a matrix.
 * @param {Mat3} m The matrix.
 * @param {Mat3} [dst] The matrix. If not passed a new one is created.
 * @return {Mat3} A copy of m.
 * @memberOf m3
 */
export function copy(m: Mat3, dst: Mat3 = new MatType(9)): Mat3 {
  dst[0] = m[0];
  dst[1] = m[1];
  dst[2] = m[2];
  dst[3] = m[3];
  dst[4] = m[4];
  dst[5] = m[5];
  dst[6] = m[6];
  dst[7] = m[7];
  dst[8] = m[8];

  return dst;
}

/**
 * Creates an n-by-n identity matrix.
 *
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} An n-by-n identity matrix.
 * @memberOf m3
 */
export function identity(dst: Mat3 = new MatType(9)): Mat3 {
  dst[0] = 1;
  dst[1] = 0;
  dst[2] = 0;
  dst[3] = 0;
  dst[4] = 1;
  dst[5] = 0;
  dst[6] = 0;
  dst[7] = 0;
  dst[8] = 1;

  return dst;
}

/**
 * Takes the transpose of a matrix.
 * @param {Mat3} m The matrix.
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The transpose of m.
 * @memberOf m3
 */
export function transpose(m: Mat3, dst: Mat3 = new MatType(9)): Mat3 {
  if (dst === m) {
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

    return dst;
  }

  const m00 = m[0 * 3 + 0];
  const m01 = m[0 * 3 + 1];
  const m02 = m[0 * 3 + 2];

  const m10 = m[1 * 3 + 0];
  const m11 = m[1 * 3 + 1];
  const m12 = m[1 * 3 + 2];

  const m20 = m[2 * 3 + 0];
  const m21 = m[2 * 3 + 1];
  const m22 = m[2 * 3 + 2];

  dst[0] = m00;
  dst[1] = m10;
  dst[2] = m20;

  dst[3] = m01;
  dst[4] = m11;
  dst[5] = m21;

  dst[6] = m02;
  dst[7] = m12;
  dst[8] = m22;

  return dst;
}

/**
 * Computes the inverse of a 3-by-3 matrix.
 * @param {Mat3} m The matrix.
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The inverse of m.
 * @memberOf m3
 */
export function inverse(m: Mat3, dst: Mat3 = new MatType(9)): Mat3 {
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

  if (det === 0) return identity(dst);

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
}

/**
 * Multiplies two 3-by-3 matrices with a on the left and b on the right
 * @param {Mat3} a The matrix on the left.
 * @param {Mat3} b The matrix on the right.
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The matrix product of a and b.
 * @memberOf m3
 */
export function multiply(a: Mat3, b: Mat3, dst: Mat3 = new MatType(9)): Mat3 {
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

  dst[0] = a00 * b00 + a10 * b01 + a20 * b02;
  dst[1] = a01 * b00 + a11 * b01 + a21 * b02;
  dst[2] = a02 * b00 + a12 * b01 + a22 * b02;

  dst[3] = a00 * b10 + a10 * b11 + a20 * b12;
  dst[4] = a01 * b10 + a11 * b11 + a21 * b12;
  dst[5] = a02 * b10 + a12 * b11 + a22 * b12;

  dst[6] = a00 * b20 + a10 * b21 + a20 * b22;
  dst[7] = a01 * b20 + a11 * b21 + a21 * b22;
  dst[8] = a02 * b20 + a12 * b21 + a22 * b22;

  return dst;
}

/**
 * Sets the translation component of a 3-by-3 matrix to the given
 * vector.
 * @param {Mat3} a The matrix.
 * @param {v3.Vec2} v The vector.
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The matrix with translation set.
 */
export function setTranslation(
  a: Mat3,
  v: v2.Vec2,
  dst: Mat3 = new MatType(9)
): Mat3 {
  dst = dst || identity();
  if (a !== dst) {
    dst[0] = a[0];
    dst[1] = a[1];
    dst[2] = a[2];

    dst[3] = a[3];
    dst[4] = a[4];
    dst[5] = a[5];
  }
  dst[6] = v[0];
  dst[7] = v[1];
  dst[8] = 1;
  return dst;
}

/**
 * Returns the translation component of a 3-by-3 matrix as a vector with 3
 * entries.
 * @param {Mat3} m The matrix.
 * @param {v2.Vec2} [dst] vector to hold result. If not passed a new one is created.
 * @return {v2.Vec2} The translation component of m.
 */
export function getTranslation(
  m: Mat3,
  dst: v2.Vec2 = new MatType(2)
): v2.Vec2 {
  dst = dst || v3.create();
  dst[0] = m[6];
  dst[1] = m[7];
  return dst;
}

/**
 * Returns an axis of a 4x4 matrix as a vector with 3 entries
 * @param {Mat3} m The matrix.
 * @param {number} axis The axis 0 = x, 1 = y, 2 = z;
 * @return {v2.Vec2} [dst] vector.
 * @return {v2.Vec2} The axis component of m.
 */
export function getAxis(
  m: Mat3,
  axis: number,
  dst: v2.Vec2 = new MatType(2)
): v2.Vec2 {
  dst = dst || v3.create();
  const off = axis * 3;
  dst[0] = m[off + 0];
  dst[1] = m[off + 1];

  return dst;
}

/**
 * Sets an axis of a 4x4 matrix as a vector with 3 entries
 * @param {Mat3} m The matrix.
 * @param {v2.Vec2} v the axis vector
 * @param {number} axis The axis  0 = x, 1 = y, 2 = z;
 * @param {Mat3} [dst] The matrix to set. If not passed a new one is created.
 * @return {Mat3} The matrix with axis set.
 */
export function setAxis(
  a: Mat3,
  v: v2.Vec2,
  axis: number,
  dst: Mat3 = new MatType(9)
): Mat3 {
  if (dst !== a) {
    dst = copy(a, dst);
  }
  const off = axis * 3;
  dst[off + 0] = v[0];
  dst[off + 1] = v[1];
  return dst;
}

/**
 * Creates a 3-by-3 matrix which translates by the given vector v.
 * @param {v2.Vec2} v The vector by
 *     which to translate.
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The translation matrix.
 * @memberOf m3
 */
export function translation(v: v2.Vec2, dst: Mat3 = new MatType(9)): Mat3 {
  dst[0] = 1;
  dst[1] = 0;
  dst[2] = 0;

  dst[3] = 0;
  dst[4] = 1;
  dst[5] = 0;

  dst[6] = v[0];
  dst[7] = v[1];
  dst[8] = 1;

  return dst;
}

/**
 * Translates the given 3-by-3 matrix by the given vector v.
 * @param {Mat3} m The matrix.
 * @param {v2.Vec2} v The vector by
 *     which to translate.
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The translated matrix.
 * @memberOf m3
 */
export function translate(
  m: Mat3,
  v: v2.Vec2,
  dst: Mat3 = new MatType(9)
): Mat3 {
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

  if (m !== dst) {
    dst[0] = m00;
    dst[1] = m01;
    dst[2] = m02;

    dst[3] = m10;
    dst[4] = m11;
    dst[5] = m12;
  }

  dst[6] = m00 * v0 + m10 * v1 + m20;
  dst[7] = m01 * v0 + m11 * v1 + m21;
  dst[8] = m02 * v0 + m12 * v1 + m22;

  return dst;
}

/**
 * Creates a 3-by-3 matrix which rotates around the x-axis by the given angle.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The rotation matrix.
 * @memberOf m3
 */
export function rotationX(
  angleInRadians: number,
  dst: Mat3 = new MatType(9)
): Mat3 {
  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  dst[0] = 1;
  dst[1] = 0;
  dst[2] = 0;

  dst[3] = 0;
  dst[4] = c;
  dst[5] = s;

  dst[6] = 0;
  dst[7] = -s;
  dst[8] = c;

  return dst;
}

/**
 * Rotates the given 3-by-3 matrix around the x-axis by the given
 * angle.
 * @param {Mat3} m The matrix.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The rotated matrix.
 * @memberOf m3
 */
export function rotateX(
  m: Mat3,
  angleInRadians: number,
  dst: Mat3 = new MatType(9)
): Mat3 {
  const m10 = m[3];
  const m11 = m[4];
  const m12 = m[5];

  const m20 = m[6];
  const m21 = m[7];
  const m22 = m[8];

  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  dst[3] = c * m10 + s * m20;
  dst[4] = c * m11 + s * m21;
  dst[5] = c * m12 + s * m22;

  dst[6] = c * m20 - s * m10;
  dst[7] = c * m21 - s * m11;
  dst[8] = c * m22 - s * m12;

  if (m !== dst) {
    dst[0] = m[0];
    dst[1] = m[1];
    dst[2] = m[2];

    dst[6] = m[6];
    dst[7] = m[7];
    dst[8] = m[8];
  }

  return dst;
}

/**
 * Creates a 3-by-3 matrix which rotates around the y-axis by the given angle.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The rotation matrix.
 * @memberOf m3
 */
export function rotationY(
  angleInRadians: number,
  dst: Mat3 = new MatType(9)
): Mat3 {
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

  return dst;
}

/**
 * Rotates the given 3-by-3 matrix around the y-axis by the given
 * angle.
 * @param {Mat3} m The matrix.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The rotated matrix.
 * @memberOf m3
 */
export function rotateY(
  m: Mat3,
  angleInRadians: number,
  dst: Mat3 = new MatType(9)
): Mat3 {
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

  if (m !== dst) {
    dst[4] = m[4];
    dst[5] = m[5];
    dst[6] = m[6];
    dst[7] = m[7];
  }

  return dst;
}

/**
 * Creates a 3-by-3 matrix which rotates around the z-axis by the given angle.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The rotation matrix.
 * @memberOf m3
 */
export function rotationZ(
  angleInRadians: number,
  dst: Mat3 = new MatType(9)
): Mat3 {
  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  dst[0] = c;
  dst[1] = s;
  dst[2] = 0;
  dst[3] = 0;
  dst[4] = -s;
  dst[5] = c;
  dst[6] = 0;
  dst[7] = 0;
  dst[8] = 0;
  dst[9] = 0;
  dst[10] = 1;
  dst[11] = 0;
  dst[12] = 0;
  dst[13] = 0;
  dst[14] = 0;
  dst[15] = 1;

  return dst;
}

/**
 * Rotates the given 3-by-3 matrix around the z-axis by the given
 * angle.
 * @param {Mat3} m The matrix.
 * @param {number} angleInRadians The angle by which to rotate (in radians).
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The rotated matrix.
 * @memberOf m3
 */
export function rotateZ(
  m: Mat3,
  angleInRadians: number,
  dst: Mat3 = new MatType(9)
): Mat3 {
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

  if (m !== dst) {
    dst[8] = m[8];
    dst[9] = m[9];
    dst[10] = m[10];
    dst[11] = m[11];
    dst[12] = m[12];
    dst[13] = m[13];
    dst[14] = m[14];
    dst[15] = m[15];
  }

  return dst;
}

/**
 * Creates a 3-by-3 matrix which scales in each dimension by an amount given by
 * the corresponding entry in the given vector; assumes the vector has three
 * entries.
 * @param {v2.Vec2} v A vector of
 *     three entries specifying the factor by which to scale in each dimension.
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The scaling matrix.
 * @memberOf m3
 */
export function scaling(v: v2.Vec2, dst: Mat3 = new MatType(9)): Mat3 {
  dst[0] = v[0];
  dst[1] = 0;
  dst[2] = 0;
  dst[3] = 0;
  dst[4] = 0;
  dst[5] = v[1];
  dst[6] = 0;
  dst[7] = 0;
  dst[8] = 0;
  dst[9] = 0;
  dst[10] = v[2];
  dst[11] = 0;
  dst[12] = 0;
  dst[13] = 0;
  dst[14] = 0;
  dst[15] = 1;

  return dst;
}

/**
 * Scales the given 3-by-3 matrix in each dimension by an amount
 * given by the corresponding entry in the given vector; assumes the vector has
 * three entries.
 * @param {Mat3} m The matrix to be modified.
 * @param {v2.Vec2} v A vector of three entries specifying the
 *     factor by which to scale in each dimension.
 * @param {Mat3} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat3} The scaled matrix.
 * @memberOf m3
 */
export function scale(m: Mat3, v: v2.Vec2, dst: Mat3 = new MatType(9)): Mat3 {
  const v0 = v[0];
  const v1 = v[1];
  const v2 = v[2];

  dst[0] = v0 * m[0 * 3 + 0];
  dst[1] = v0 * m[0 * 3 + 1];
  dst[2] = v0 * m[0 * 3 + 2];

  dst[3] = v1 * m[1 * 3 + 0];
  dst[4] = v1 * m[1 * 3 + 1];
  dst[5] = v1 * m[1 * 3 + 2];

  if (m !== dst) {
    dst[6] = m[6];
    dst[7] = m[7];
    dst[8] = m[8];
  }

  return dst;
}

/**
 * Takes a 3-by-3 matrix and a vector with 3 entries,
 * interprets the vector as a point, transforms that point by the matrix, and
 * returns the result as a vector with 3 entries.
 * @param {Mat3} m The matrix.
 * @param {v2.Vec2} v The point.
 * @param {v2.Vec2} [dst] optional vec3 to store result. If not passed a new one is created.
 * @return {v2.Vec2} The transformed point.
 * @memberOf m3
 */
export function transformPoint(
  m: Mat3,
  v: v2.Vec2,
  dst: Mat3 = new MatType(9)
): Mat3 {
  dst = dst || v3.create();
  const v0 = v[0];
  const v1 = v[1];
  const v2 = v[2];
  const d =
    v0 * m[0 * 4 + 3] + v1 * m[1 * 4 + 3] + v2 * m[2 * 4 + 3] + m[3 * 4 + 3];

  dst[0] =
    (v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + v2 * m[2 * 4 + 0] + m[3 * 4 + 0]) /
    d;
  dst[1] =
    (v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + v2 * m[2 * 4 + 1] + m[3 * 4 + 1]) /
    d;
  dst[2] =
    (v0 * m[0 * 4 + 2] + v1 * m[1 * 4 + 2] + v2 * m[2 * 4 + 2] + m[3 * 4 + 2]) /
    d;

  return dst;
}

/**
 * Takes a 3-by-3 matrix and a vector with 3 entries, interprets the vector as a
 * direction, transforms that direction by the matrix, and returns the result;
 * assumes the transformation of 3-dimensional space represented by the matrix
 * is parallel-preserving, i.e. any combination of rotation, scaling and
 * translation, but not a perspective distortion. Returns a vector with 3
 * entries.
 * @param {Mat3} m The matrix.
 * @param {v2.Vec2} v The direction.
 * @param {v2.Vec2} [dst] optional Vec3 to store result. If not passed a new one is created.
 * @return {v2.Vec2} The transformed direction.
 * @memberOf m3
 */
export function transformDirection(
  m: Mat3,
  v: v2.Vec2,
  dst: Mat3 = new MatType(9)
): Mat3 {
  dst = dst || v3.create();

  const v0 = v[0];
  const v1 = v[1];
  const v2 = v[2];

  dst[0] = v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + v2 * m[2 * 4 + 0];
  dst[1] = v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + v2 * m[2 * 4 + 1];
  dst[2] = v0 * m[0 * 4 + 2] + v1 * m[1 * 4 + 2] + v2 * m[2 * 4 + 2];

  return dst;
}

/**
 * Takes a 3-by-3 matrix m and a vector v with 3 entries, interprets the vector
 * as a normal to a surface, and computes a vector which is normal upon
 * transforming that surface by the matrix. The effect of this function is the
 * same as transforming v (as a direction) by the inverse-transpose of m.  This
 * function assumes the transformation of 3-dimensional space represented by the
 * matrix is parallel-preserving, i.e. any combination of rotation, scaling and
 * translation, but not a perspective distortion.  Returns a vector with 3
 * entries.
 * @param {Mat3} m The matrix.
 * @param {v2.Vec2} v The normal.
 * @param {v2.Vec2} [dst] The direction. If not passed a new one is created.
 * @return {v2.Vec2} The transformed normal.
 * @memberOf m3
 */
export function transformNormal(
  m: Mat3,
  v: v2.Vec2,
  dst: Mat3 = new MatType(9)
): Mat3 {
  dst = dst || v3.create();
  const mi = inverse(m);
  const v0 = v[0];
  const v1 = v[1];
  const v2 = v[2];

  dst[0] = v0 * mi[0 * 4 + 0] + v1 * mi[0 * 4 + 1] + v2 * mi[0 * 4 + 2];
  dst[1] = v0 * mi[1 * 4 + 0] + v1 * mi[1 * 4 + 1] + v2 * mi[1 * 4 + 2];
  dst[2] = v0 * mi[2 * 4 + 0] + v1 * mi[2 * 4 + 1] + v2 * mi[2 * 4 + 2];

  return dst;
}
