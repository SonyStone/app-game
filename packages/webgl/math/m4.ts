import * as v3 from './v3';

/**
 * 4x4 Matrix math math functions.
 *
 * Almost all functions take an optional `dst` argument. If it is not passed in the
 * functions will create a new matrix. In other words you can do this
 *
 *     const mat = m4.translation([1, 2, 3]);  // Creates a new translation matrix
 *
 * or
 *
 *     const mat = m4.create();
 *     m4.translation([1, 2, 3], mat);  // Puts translation matrix in mat.
 *
 * The first style is often easier but depending on where it's used it generates garbage where
 * as there is almost never allocation with the second style.
 *
 * It is always save to pass any matrix as the destination. So for example
 *
 *     const mat = m4.identity();
 *     const trans = m4.translation([1, 2, 3]);
 *     m4.multiply(mat, trans, mat);  // Multiplies mat * trans and puts result in mat.
 *
 * @module twgl/m4
 */
let MatType = Float32Array;

/**
 * A JavaScript array with 16 values or a Float32Array with 16 values.
 * When created by the library will create the default type which is `Float32Array`
 * but can be set by calling {@link setDefaultType}.
 * @typedef {(number[]|Float32Array)} Mat4
 * @memberOf m4
 */
export type Mat4 = number[] | Float32Array;

/**
 * Sets the type this library creates for a Mat4
 * @param {constructor} ctor the constructor for the type. Either `Float32Array` or `Array`
 * @return {constructor} previous constructor for Mat4
 * @memberOf m4
 */
export function setDefaultType(ctor: typeof MatType) {
  const oldType = MatType;
  MatType = ctor;
  return oldType;
}

/**
 * Negates a matrix.
 * @param {Mat4} m __mut__ The matrix.
 * @param {Mat4} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat4} -m.
 * @memberOf m4
 */
export const negate = (m: Mat4): Mat4 => {
  m[0] = -m[0];
  m[1] = -m[1];
  m[2] = -m[2];
  m[3] = -m[3];

  m[4] = -m[4];
  m[5] = -m[5];
  m[6] = -m[6];
  m[7] = -m[7];

  m[8] = -m[8];
  m[9] = -m[9];
  m[10] = -m[10];
  m[11] = -m[11];

  m[12] = -m[12];
  m[13] = -m[13];
  m[14] = -m[14];
  m[15] = -m[15];

  return m;
};

/**
 * Copies from `b` to `a` matrix.
 * @param a __mut__ The matrix. If not passed a new one is created.
 * @param b The matrix.
 */
export const copy = (a: Mat4, b: Mat4): Mat4 => {
  a[0] = b[0];
  a[1] = b[1];
  a[2] = b[2];
  a[3] = b[3];

  a[4] = b[4];
  a[5] = b[5];
  a[6] = b[6];
  a[7] = b[7];

  a[8] = b[8];
  a[9] = b[9];
  a[10] = b[10];
  a[11] = b[11];

  a[12] = b[12];
  a[13] = b[13];
  a[14] = b[14];
  a[15] = b[15];

  return a;
};

/**
 * Copies a matrix.
 * @param m __mut__ The matrix.
 * @return A copy of m.
 */
export const clone = (m: Mat4): Mat4 => {
  const dst: Mat4 = new MatType(16);

  dst[0] = m[0];
  dst[1] = m[1];
  dst[2] = m[2];
  dst[3] = m[3];

  dst[4] = m[4];
  dst[5] = m[5];
  dst[6] = m[6];
  dst[7] = m[7];

  dst[8] = m[8];
  dst[9] = m[9];
  dst[10] = m[10];
  dst[11] = m[11];

  dst[12] = m[12];
  dst[13] = m[13];
  dst[14] = m[14];
  dst[15] = m[15];

  return dst;
};

/**
 * Creates an n-by-n identity matrix.
 *
 * @param m __mut__ The matrix.
 * @return An n-by-n identity matrix.
 */
export function identity(m: Mat4 = new MatType(16)): Mat4 {
  m[0] = 1;
  m[1] = 0;
  m[2] = 0;
  m[3] = 0;

  m[4] = 0;
  m[5] = 1;
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
}

/**
 * Make the transpose of a matrix.
 * @param m __mut__ The matrix.
 */
export function transpose(m: Mat4) {
  let t;

  t = m[1];
  m[1] = m[4];
  m[4] = t;

  t = m[2];
  m[2] = m[8];
  m[8] = t;

  t = m[3];
  m[3] = m[12];
  m[12] = t;

  t = m[6];
  m[6] = m[9];
  m[9] = t;

  t = m[7];
  m[7] = m[13];
  m[13] = t;

  t = m[11];
  m[11] = m[14];
  m[14] = t;
}

/**
 * Computes the inverse of a 4-by-4 matrix.
 * @param m __mut__ The matrix.
 * @return The inverse of m.
 */
export function inverse(m: Mat4) {
  const m00 = m[0];
  const m01 = m[1];
  const m02 = m[2];
  const m03 = m[3];

  const m10 = m[4];
  const m11 = m[5];
  const m12 = m[6];
  const m13 = m[7];

  const m20 = m[8];
  const m21 = m[9];
  const m22 = m[10];
  const m23 = m[11];

  const m30 = m[12];
  const m31 = m[13];
  const m32 = m[14];
  const m33 = m[15];

  const tmp_0 = m22 * m33;
  const tmp_1 = m32 * m23;
  const tmp_2 = m12 * m33;
  const tmp_3 = m32 * m13;

  const tmp_4 = m12 * m23;
  const tmp_5 = m22 * m13;
  const tmp_6 = m02 * m33;
  const tmp_7 = m32 * m03;

  const tmp_8 = m02 * m23;
  const tmp_9 = m22 * m03;
  const tmp_10 = m02 * m13;
  const tmp_11 = m12 * m03;

  const tmp_12 = m20 * m31;
  const tmp_13 = m30 * m21;
  const tmp_14 = m10 * m31;
  const tmp_15 = m30 * m11;

  const tmp_16 = m10 * m21;
  const tmp_17 = m20 * m11;
  const tmp_18 = m00 * m31;
  const tmp_19 = m30 * m01;

  const tmp_20 = m00 * m21;
  const tmp_21 = m20 * m01;
  const tmp_22 = m00 * m11;
  const tmp_23 = m10 * m01;

  const t0 = tmp_0 * m11 + tmp_3 * m21 + tmp_4 * m31 - (tmp_1 * m11 + tmp_2 * m21 + tmp_5 * m31);

  const t1 = tmp_1 * m01 + tmp_6 * m21 + tmp_9 * m31 - (tmp_0 * m01 + tmp_7 * m21 + tmp_8 * m31);

  const t2 = tmp_2 * m01 + tmp_7 * m11 + tmp_10 * m31 - (tmp_3 * m01 + tmp_6 * m11 + tmp_11 * m31);

  const t3 = tmp_5 * m01 + tmp_8 * m11 + tmp_11 * m21 - (tmp_4 * m01 + tmp_9 * m11 + tmp_10 * m21);

  const d = 1.0 / (m00 * t0 + m10 * t1 + m20 * t2 + m30 * t3);

  m[0] = d * t0;
  m[1] = d * t1;
  m[2] = d * t2;
  m[3] = d * t3;

  m[4] = d * (tmp_1 * m10 + tmp_2 * m20 + tmp_5 * m30 - (tmp_0 * m10 + tmp_3 * m20 + tmp_4 * m30));
  m[5] = d * (tmp_0 * m00 + tmp_7 * m20 + tmp_8 * m30 - (tmp_1 * m00 + tmp_6 * m20 + tmp_9 * m30));
  m[6] = d * (tmp_3 * m00 + tmp_6 * m10 + tmp_11 * m30 - (tmp_2 * m00 + tmp_7 * m10 + tmp_10 * m30));
  m[7] = d * (tmp_4 * m00 + tmp_9 * m10 + tmp_10 * m20 - (tmp_5 * m00 + tmp_8 * m10 + tmp_11 * m20));

  m[8] = d * (tmp_12 * m13 + tmp_15 * m23 + tmp_16 * m33 - (tmp_13 * m13 + tmp_14 * m23 + tmp_17 * m33));
  m[9] = d * (tmp_13 * m03 + tmp_18 * m23 + tmp_21 * m33 - (tmp_12 * m03 + tmp_19 * m23 + tmp_20 * m33));
  m[10] = d * (tmp_14 * m03 + tmp_19 * m13 + tmp_22 * m33 - (tmp_15 * m03 + tmp_18 * m13 + tmp_23 * m33));
  m[11] = d * (tmp_17 * m03 + tmp_20 * m13 + tmp_23 * m23 - (tmp_16 * m03 + tmp_21 * m13 + tmp_22 * m23));

  m[12] = d * (tmp_14 * m22 + tmp_17 * m32 + tmp_13 * m12 - (tmp_16 * m32 + tmp_12 * m12 + tmp_15 * m22));
  m[13] = d * (tmp_20 * m32 + tmp_12 * m02 + tmp_19 * m22 - (tmp_18 * m22 + tmp_21 * m32 + tmp_13 * m02));
  m[14] = d * (tmp_18 * m12 + tmp_23 * m32 + tmp_15 * m02 - (tmp_22 * m32 + tmp_14 * m02 + tmp_19 * m12));
  m[15] = d * (tmp_22 * m22 + tmp_16 * m02 + tmp_21 * m12 - (tmp_20 * m12 + tmp_23 * m22 + tmp_17 * m02));
}

/**
 * Multiplies two 4-by-4 matrices with a on the left and b on the right
 * @param a __mut__ The matrix on the left.
 * @param b The matrix on the right.
 */
export function multiply(a: Mat4, b: Mat4) {
  const a00 = a[0];
  const a01 = a[1];
  const a02 = a[2];
  const a03 = a[3];

  const a10 = a[4 + 0];
  const a11 = a[4 + 1];
  const a12 = a[4 + 2];
  const a13 = a[4 + 3];

  const a20 = a[8 + 0];
  const a21 = a[8 + 1];
  const a22 = a[8 + 2];
  const a23 = a[8 + 3];

  const a30 = a[12 + 0];
  const a31 = a[12 + 1];
  const a32 = a[12 + 2];
  const a33 = a[12 + 3];

  const b00 = b[0];
  const b01 = b[1];
  const b02 = b[2];
  const b03 = b[3];

  const b10 = b[4 + 0];
  const b11 = b[4 + 1];
  const b12 = b[4 + 2];
  const b13 = b[4 + 3];

  const b20 = b[8 + 0];
  const b21 = b[8 + 1];
  const b22 = b[8 + 2];
  const b23 = b[8 + 3];

  const b30 = b[12 + 0];
  const b31 = b[12 + 1];
  const b32 = b[12 + 2];
  const b33 = b[12 + 3];

  a[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
  a[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
  a[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
  a[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;

  a[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
  a[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
  a[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
  a[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;

  a[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
  a[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
  a[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
  a[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;

  a[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
  a[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
  a[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
  a[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;
}

export function multiplyArray(m: Mat4, arr: Mat4[]) {
  for (let i = 0; i < arr.length; i++) {
    multiply(m, arr[i]);
  }
}

/**
 * Sets the translation component of a 4-by-4 matrix to the given
 * vector.
 * @param a __mut__ The matrix.
 * @param v The vector.
 */
export function setTranslation(m: Mat4, v: v3.Tuple) {
  m[12] = v[0];
  m[13] = v[1];
  m[14] = v[2];
  m[15] = 1;
}

/**
 * Returns the translation component of a 4-by-4 matrix as a vector with 3
 * entries.
 * @param v __mut__ vector to hold result. If not passed a new one is created.
 * @param m The matrix.
 */
export function getTranslation(v: v3.Tuple, m: Mat4) {
  v[0] = m[12];
  v[1] = m[13];
  v[2] = m[14];
}

/**
 * Returns an axis of a 4x4 matrix as a vector with 3 entries
 * @param m The matrix.
 * @param axis The axis 0 = x, 1 = y, 2 = z;
 * @return The axis component of m.
 */
export function getAxis(m: Mat4, axis: number): v3.Tuple {
  const v = v3.create();

  const off = axis * 4;
  v[0] = m[off + 0];
  v[1] = m[off + 1];
  v[2] = m[off + 2];
  return v;
}

/**
 * Sets an axis of a 4x4 matrix as a vector with 3 entries
 * @param m __mut__ The matrix with axis to set.
 * @param v the axis vector
 * @param axis The axis  0 = x, 1 = y, 2 = z;
 */
export function setAxis(m: Mat4, v: v3.Tuple, axis: number) {
  const off = axis * 4;
  m[off + 0] = v[0];
  m[off + 1] = v[1];
  m[off + 2] = v[2];
}

/**
 * Computes a 4-by-4 perspective transformation matrix given the angular height
 * of the frustum, the aspect ratio, and the near and far clipping planes.  The
 * arguments define a frustum extending in the negative z direction.  The given
 * angle is the vertical angle of the frustum, and the horizontal angle is
 * determined to produce the given aspect ratio.  The arguments near and far are
 * the distances to the near and far clipping planes.  Note that near and far
 * are not z coordinates, but rather they are distances along the negative
 * z-axis.  The matrix generated sends the viewing frustum to the unit box.
 * We assume a unit box extending from -1 to 1 in the x and y dimensions and
 * from 0 to 1 in the z dimension.
 * @param m __mut__ matrix to hold result. If not passed a new one is created.
 * @param fieldOfViewYInRadians The camera angle from top to bottom (in radians).
 * @param aspect The aspect ratio width / height.
 * @param zNear The depth (negative z coordinate)
 *     of the near clipping plane.
 * @param zFar The depth (negative z coordinate)
 *     of the far clipping plane.
 */
export function perspective(m: Mat4, fieldOfViewYInRadians: number, aspect: number, zNear: number, zFar: number) {
  const f = Math.tan(Math.PI * 0.5 - 0.5 * fieldOfViewYInRadians);
  const rangeInv = 1.0 / (zNear - zFar);

  m[0] = f / aspect;
  m[1] = 0;
  m[2] = 0;
  m[3] = 0;

  m[4] = 0;
  m[5] = f;
  m[6] = 0;
  m[7] = 0;

  m[8] = 0;
  m[9] = 0;
  m[10] = (zNear + zFar) * rangeInv;
  m[11] = -1;

  m[12] = 0;
  m[13] = 0;
  m[14] = zNear * zFar * rangeInv * 2;
  m[15] = 0;
}

export function makePerspective(
  m: Mat4,
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number
) {
  const x = (2 * near) / (right - left);
  const y = (2 * near) / (top - bottom);

  const a = (right + left) / (right - left);
  const b = (top + bottom) / (top - bottom);
  const c = -(far + near) / (far - near);
  const d = (-2 * far * near) / (far - near);

  m[0] = x;
  m[4] = 0;
  m[8] = a;
  m[12] = 0;
  m[1] = 0;
  m[5] = y;
  m[9] = b;
  m[13] = 0;
  m[2] = 0;
  m[6] = 0;
  m[10] = c;
  m[14] = d;
  m[3] = 0;
  m[7] = 0;
  m[11] = -1;
  m[15] = 0;
}

/**
 * Computes a 4-by-4 orthogonal transformation matrix given the left, right,
 * bottom, and top dimensions of the near clipping plane as well as the
 * near and far clipping plane distances.
 * @param m __mut__ The perspective matrix.
 * @param left Left side of the near clipping plane viewport.
 * @param right Right side of the near clipping plane viewport.
 * @param bottom Bottom of the near clipping plane viewport.
 * @param top Top of the near clipping plane viewport.
 * @param near The depth (negative z coordinate)
 *     of the near clipping plane.
 * @param far The depth (negative z coordinate)
 *     of the far clipping plane.
 */
export function ortho(m: Mat4, left: number, right: number, bottom: number, top: number, near: number, far: number) {
  m[0] = 2 / (right - left);
  m[1] = 0;
  m[2] = 0;
  m[3] = 0;

  m[4] = 0;
  m[5] = 2 / (top - bottom);
  m[6] = 0;
  m[7] = 0;

  m[8] = 0;
  m[9] = 0;
  m[10] = 2 / (near - far);
  m[11] = 0;

  m[12] = (right + left) / (left - right);
  m[13] = (top + bottom) / (bottom - top);
  m[14] = (far + near) / (near - far);
  m[15] = 1;
}

/**
 * Computes a 4-by-4 perspective transformation matrix given the left, right,
 * top, bottom, near and far clipping planes. The arguments define a frustum
 * extending in the negative z direction. The arguments near and far are the
 * distances to the near and far clipping planes. Note that near and far are not
 * z coordinates, but rather they are distances along the negative z-axis. The
 * matrix generated sends the viewing frustum to the unit box. We assume a unit
 * box extending from -1 to 1 in the x and y dimensions and from 0 to 1 in the z
 * dimension.
 * @param m __mut__ The perspective projection matrix
 * @param left The x coordinate of the left plane of the box.
 * @param right The x coordinate of the right plane of the box.
 * @param bottom The y coordinate of the bottom plane of the box.
 * @param top The y coordinate of the right plane of the box.
 * @param near The negative z coordinate of the near plane of the box.
 * @param far The negative z coordinate of the far plane of the box.
 */
export function frustum(m: Mat4, left: number, right: number, bottom: number, top: number, near: number, far: number) {
  const dx = right - left;
  const dy = top - bottom;
  const dz = near - far;

  m[0] = (2 * near) / dx;
  m[1] = 0;
  m[2] = 0;
  m[3] = 0;
  m[4] = 0;
  m[5] = (2 * near) / dy;
  m[6] = 0;
  m[7] = 0;
  m[8] = (left + right) / dx;
  m[9] = (top + bottom) / dy;
  m[10] = far / dz;
  m[11] = -1;
  m[12] = 0;
  m[13] = 0;
  m[14] = (near * far) / dz;
  m[15] = 0;
}

let xAxis: v3.Tuple = v3.create();
let yAxis: v3.Tuple = v3.create();
let zAxis: v3.Tuple = v3.create();

/**
 * Computes a 4-by-4 look-at transformation.
 *
 * This is a matrix which positions the camera itself. If you want
 * a view matrix (a matrix which moves things in front of the camera)
 * take the inverse of this.
 *
 * @param m __mut__ matrix to hold result. The look-at matrix.
 * @param eye The position of the eye.
 * @param target The position meant to be viewed.
 * @param up A vector pointing up.
 */
export function lookAt(m: Mat4, eye: v3.Tuple, target: v3.Tuple, up: v3.Tuple) {
  v3.copy(zAxis, eye);
  v3.sub(zAxis, target);
  v3.normalize(zAxis);

  v3.copy(xAxis, up);
  v3.cross(xAxis, zAxis);
  v3.normalize(xAxis);

  v3.copy(yAxis, zAxis);
  v3.cross(yAxis, xAxis);
  v3.normalize(yAxis);

  m[0] = xAxis[0];
  m[1] = xAxis[1];
  m[2] = xAxis[2];
  m[3] = 0;
  m[4] = yAxis[0];
  m[5] = yAxis[1];
  m[6] = yAxis[2];
  m[7] = 0;
  m[8] = zAxis[0];
  m[9] = zAxis[1];
  m[10] = zAxis[2];
  m[11] = 0;
  m[12] = eye[0];
  m[13] = eye[1];
  m[14] = eye[2];
  m[15] = 1;
}

/**
 * Translates the given 4-by-4 matrix by the given vector v.
 *
 * @param m __mut__ The matrix to translate.
 * @param v The vector by
 *     which to translate.
 */
export function translate(m: Mat4, v: v3.Tuple): void {
  const v0 = v[0];
  const v1 = v[1];
  const v2 = v[2];

  const m00 = m[0];
  const m01 = m[1];
  const m02 = m[2];
  const m03 = m[3];

  const m10 = m[4];
  const m11 = m[5];
  const m12 = m[6];
  const m13 = m[7];

  const m20 = m[8];
  const m21 = m[9];
  const m22 = m[10];
  const m23 = m[11];

  const m30 = m[12];
  const m31 = m[13];
  const m32 = m[14];
  const m33 = m[15];

  m[12] = m00 * v0 + m10 * v1 + m20 * v2 + m30;
  m[13] = m01 * v0 + m11 * v1 + m21 * v2 + m31;
  m[14] = m02 * v0 + m12 * v1 + m22 * v2 + m32;
  m[15] = m03 * v0 + m13 * v1 + m23 * v2 + m33;
}

/**
 * Rotates the given 4-by-4 matrix around the x-axis by the given
 * angle.
 *
 * @param m __mut__ The matrix to rotate.
 * @param angleInRadians The angle by which to rotate (in radians).
 */
export function rotateX(m: Mat4, angleInRadians: number) {
  const m10 = m[4];
  const m11 = m[5];
  const m12 = m[6];
  const m13 = m[7];

  const m20 = m[8];
  const m21 = m[9];
  const m22 = m[10];
  const m23 = m[11];

  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  m[4] = c * m10 + s * m20;
  m[5] = c * m11 + s * m21;
  m[6] = c * m12 + s * m22;
  m[7] = c * m13 + s * m23;

  m[8] = c * m20 - s * m10;
  m[9] = c * m21 - s * m11;
  m[10] = c * m22 - s * m12;
  m[11] = c * m23 - s * m13;
}

/**
 * Rotates the given 4-by-4 matrix around the y-axis by the given
 * angle.
 *
 * @param m __mut__ The matrix to rotate.
 * @param angleInRadians The angle by which to rotate (in radians).
 */
export function rotateY(m: Mat4, angleInRadians: number) {
  const m00 = m[0];
  const m01 = m[1];
  const m02 = m[2];
  const m03 = m[3];

  const m20 = m[8];
  const m21 = m[9];
  const m22 = m[10];
  const m23 = m[11];
  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  m[0] = c * m00 - s * m20;
  m[1] = c * m01 - s * m21;
  m[2] = c * m02 - s * m22;
  m[3] = c * m03 - s * m23;
  m[8] = c * m20 + s * m00;
  m[9] = c * m21 + s * m01;
  m[10] = c * m22 + s * m02;
  m[11] = c * m23 + s * m03;
}

/**
 * Rotates the given 4-by-4 matrix around the z-axis by the given
 * angle.
 *
 * @param m __mut__ The matrix to rotate.
 * @param angleInRadians The angle by which to rotate (in radians).
 */
export function setRotateZ(m: Mat4, angleInRadians: number) {
  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  m[0] = c + s;
  m[1] = c + s;
  m[2] = c + s;
  m[3] = c + s;
  m[4] = c - s;
  m[5] = c - s;
  m[6] = c - s;
  m[7] = c - s;
}

/**
 * Rotates the given 4-by-4 matrix around the z-axis by the given
 * angle.
 *
 * @param m __mut__ The matrix to rotate.
 * @param angleInRadians The angle by which to rotate (in radians).
 */
export function rotateZ(m: Mat4, angleInRadians: number) {
  const m00 = m[0];
  const m01 = m[1];
  const m02 = m[2];
  const m03 = m[3];

  const m10 = m[4];
  const m11 = m[5];
  const m12 = m[6];
  const m13 = m[7];
  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);

  m[0] = c * m00 + s * m10;
  m[1] = c * m01 + s * m11;
  m[2] = c * m02 + s * m12;
  m[3] = c * m03 + s * m13;
  m[4] = c * m10 - s * m00;
  m[5] = c * m11 - s * m01;
  m[6] = c * m12 - s * m02;
  m[7] = c * m13 - s * m03;
}

/**
 * Rotates the given 4-by-4 matrix around the given axis by the
 * given angle.
 *
 * @param m __mut__ The matrix to rotate.
 * @param axis The axis
 *     about which to rotate.
 * @param angleInRadians The angle by which to rotate (in radians).
 */
export function axisRotate(m: Mat4, [x, y, z]: v3.Tuple, angleInRadians: number) {
  const n = Math.sqrt(x * x + y * y + z * z);

  x /= n;
  y /= n;
  z /= n;

  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const c = Math.cos(angleInRadians);
  const s = Math.sin(angleInRadians);
  const oneMinusCosine = 1 - c;

  const r00 = xx + (1 - xx) * c;
  const r01 = x * y * oneMinusCosine + z * s;
  const r02 = x * z * oneMinusCosine - y * s;
  const r10 = x * y * oneMinusCosine - z * s;
  const r11 = yy + (1 - yy) * c;
  const r12 = y * z * oneMinusCosine + x * s;
  const r20 = x * z * oneMinusCosine + y * s;
  const r21 = y * z * oneMinusCosine - x * s;
  const r22 = zz + (1 - zz) * c;

  const m00 = m[0];
  const m01 = m[1];
  const m02 = m[2];
  const m03 = m[3];
  const m10 = m[4];
  const m11 = m[5];
  const m12 = m[6];
  const m13 = m[7];
  const m20 = m[8];
  const m21 = m[9];
  const m22 = m[10];
  const m23 = m[11];

  m[0] = r00 * m00 + r01 * m10 + r02 * m20;
  m[1] = r00 * m01 + r01 * m11 + r02 * m21;
  m[2] = r00 * m02 + r01 * m12 + r02 * m22;
  m[3] = r00 * m03 + r01 * m13 + r02 * m23;
  m[4] = r10 * m00 + r11 * m10 + r12 * m20;
  m[5] = r10 * m01 + r11 * m11 + r12 * m21;
  m[6] = r10 * m02 + r11 * m12 + r12 * m22;
  m[7] = r10 * m03 + r11 * m13 + r12 * m23;
  m[8] = r20 * m00 + r21 * m10 + r22 * m20;
  m[9] = r20 * m01 + r21 * m11 + r22 * m21;
  m[10] = r20 * m02 + r21 * m12 + r22 * m22;
  m[11] = r20 * m03 + r21 * m13 + r22 * m23;
}

/**
 * Scales the given 4-by-4 matrix in each dimension by an amount
 * given by the corresponding entry in the given vector; assumes the vector has
 * three entries.
 *
 * @param m __mut__ The matrix to be scaled.
 * @param v A vector of three entries specifying the
 *     factor by which to scale in each dimension.
 */
export function scale(m: Mat4, [v0, v1, v2]: v3.Tuple) {
  m[0] = v0 * m[0 * 4 + 0];
  m[1] = v0 * m[0 * 4 + 1];
  m[2] = v0 * m[0 * 4 + 2];
  m[3] = v0 * m[0 * 4 + 3];
  m[4] = v1 * m[1 * 4 + 0];
  m[5] = v1 * m[1 * 4 + 1];
  m[6] = v1 * m[1 * 4 + 2];
  m[7] = v1 * m[1 * 4 + 3];
  m[8] = v2 * m[2 * 4 + 0];
  m[9] = v2 * m[2 * 4 + 1];
  m[10] = v2 * m[2 * 4 + 2];
  m[11] = v2 * m[2 * 4 + 3];
}

/**
 * Takes a 4-by-4 matrix and a vector with 3 entries,
 * interprets the vector as a point, transforms that point by the matrix, and
 * returns the result as a vector with 3 entries.
 *
 * @param v __mut__ The point to be transformed.
 * @param m The matrix.
 */
export function transformPoint(v: v3.Tuple, m: Mat4) {
  const v0 = v[0];
  const v1 = v[1];
  const v2 = v[2];

  const d = v0 * m[0 * 4 + 3] + v1 * m[1 * 4 + 3] + v2 * m[2 * 4 + 3] + m[3 * 4 + 3];

  v[0] = (v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + v2 * m[2 * 4 + 0] + m[3 * 4 + 0]) / d;
  v[1] = (v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + v2 * m[2 * 4 + 1] + m[3 * 4 + 1]) / d;
  v[2] = (v0 * m[0 * 4 + 2] + v1 * m[1 * 4 + 2] + v2 * m[2 * 4 + 2] + m[3 * 4 + 2]) / d;
}

/**
 * Takes a 4-by-4 matrix and a vector with 3 entries, interprets the vector as a
 * direction, transforms that direction by the matrix, and returns the result;
 * assumes the transformation of 3-dimensional space represented by the matrix
 * is parallel-preserving, i.e. any combination of rotation, scaling and
 * translation, but not a perspective distortion. Returns a vector with 3
 * entries.
 *
 * @param m __mut__ The matrix to be transformed.
 * @param v The direction.
 */
export function transformDirection(m: Mat4, v: v3.Tuple): void {
  const v0 = v[0];
  const v1 = v[1];
  const v2 = v[2];

  m[0] = v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + v2 * m[2 * 4 + 0];
  m[1] = v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + v2 * m[2 * 4 + 1];
  m[2] = v0 * m[0 * 4 + 2] + v1 * m[1 * 4 + 2] + v2 * m[2 * 4 + 2];
}

let mi = identity();

/**
 * Takes a 4-by-4 matrix m and a vector v with 3 entries, interprets the vector
 * as a normal to a surface, and computes a vector which is normal upon
 * transforming that surface by the matrix. The effect of this function is the
 * same as transforming v (as a direction) by the inverse-transpose of m.  This
 * function assumes the transformation of 3-dimensional space represented by the
 * matrix is parallel-preserving, i.e. any combination of rotation, scaling and
 * translation, but not a perspective distortion.  Returns a vector with 3
 * entries.
 * @param v __mut__ The normal to be transformed.
 * @param m The matrix.
 */
export function transformNormal(v: v3.Tuple, m: Mat4) {
  copy(mi, m);
  inverse(mi);

  const v0 = v[0];
  const v1 = v[1];
  const v2 = v[2];

  v[0] = v0 * mi[0 * 4 + 0] + v1 * mi[0 * 4 + 1] + v2 * mi[0 * 4 + 2];
  v[1] = v0 * mi[1 * 4 + 0] + v1 * mi[1 * 4 + 1] + v2 * mi[1 * 4 + 2];
  v[2] = v0 * mi[2 * 4 + 0] + v1 * mi[2 * 4 + 1] + v2 * mi[2 * 4 + 2];
}

/**
 *
 * @param m __mut__
 * @param a
 * @param b
 * @param value
 */
export function transition(m: Mat4, a: Mat4, b: Mat4, value: number) {
  const start = 1 - value;
  const end = value;
  m[0] = a[0] * start + b[0] * end;
  m[1] = a[1] * start + b[1] * end;
  m[2] = a[2] * start + b[2] * end;
  m[3] = a[3] * start + b[3] * end;

  m[4] = a[4] * start + b[4] * end;
  m[5] = a[5] * start + b[5] * end;
  m[6] = a[6] * start + b[6] * end;
  m[7] = a[7] * start + b[7] * end;

  m[8] = a[8] * start + b[8] * end;
  m[9] = a[9] * start + b[9] * end;
  m[10] = a[10] * start + b[10] * end;
  m[11] = a[11] * start + b[11] * end;

  m[12] = a[12] * start + b[12] * end;
  m[13] = a[13] * start + b[13] * end;
  m[14] = a[14] * start + b[14] * end;
  m[15] = a[15] * start + b[15] * end;
}
