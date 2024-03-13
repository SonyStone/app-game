import { Mat3 } from '@packages/ogl';
import { TypedArray, TypedArrayConstructor } from './utils/typed-array';
import { type Vec2Tuple } from './v2';
import { Vec3, Vec3Tuple } from './v3';

/**
 *
 * A JavaScript array with 16 values or a Float32Array with 16 values.
 * When created by the library will create the default type which is `Float32Array`
 * but can be set by calling {@link setDefaultType}.
 * @typedef {(number[])} Mat3
 * @memberOf m3
 */
export type Mat4Tuple =
  | [
      m00: number,
      m01: number,
      m02: number,
      m03: number,
      m10: number,
      m11: number,
      m12: number,
      m13: number,
      m20: number,
      m21: number,
      m22: number,
      m23: number,
      m30: number,
      m31: number,
      m32: number,
      m33: number
    ]
  | number[]
  | TypedArray;

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
 */
export const Mat4Builder = (ctor: TypedArrayConstructor) =>
  class Mat4 extends (ctor as ArrayConstructor) {
    /**
     * A JavaScript array with 16 values or a Float32Array with 16 values.
     * When created by the library will create the default type which is `Float32Array`
     * but can be set by calling {@link setDefaultType}.
     * @typedef {(number[]|Float32Array)} Mat4
     * @memberOf m4
     */
    constructor() {
      super(16);
    }

    set(
      m00: number,
      m01: number,
      m02: number,
      m03: number,
      m10: number,
      m11: number,
      m12: number,
      m13: number,
      m20: number,
      m21: number,
      m22: number,
      m23: number,
      m30: number,
      m31: number,
      m32: number,
      m33: number
    ): this {
      this[0] = m00;
      this[1] = m01;
      this[2] = m02;
      this[3] = m03;
      this[4] = m10;
      this[5] = m11;
      this[6] = m12;
      this[7] = m13;
      this[8] = m20;
      this[9] = m21;
      this[10] = m22;
      this[11] = m23;
      this[12] = m30;
      this[13] = m31;
      this[14] = m32;
      this[15] = m33;

      return this;
    }

    get x() {
      return this[12];
    }

    get y() {
      return this[13];
    }

    get z() {
      return this[14];
    }

    get w() {
      return this[15];
    }

    set x(v) {
      this[12] = v;
    }

    set y(v) {
      this[13] = v;
    }

    set z(v) {
      this[14] = v;
    }

    set w(v) {
      this[15] = v;
    }

    /**
     * Negates a matrix.
     */
    negate(): this {
      this[0] = -this[0];
      this[1] = -this[1];
      this[2] = -this[2];
      this[3] = -this[3];

      this[4] = -this[4];
      this[5] = -this[5];
      this[6] = -this[6];
      this[7] = -this[7];

      this[8] = -this[8];
      this[9] = -this[9];
      this[10] = -this[10];
      this[11] = -this[11];

      this[12] = -this[12];
      this[13] = -this[13];
      this[14] = -this[14];
      this[15] = -this[15];

      return this;
    }

    /**
     * Copies a matrix.
     */
    copy(m: Mat4Tuple): this {
      this[0] = m[0];
      this[1] = m[1];
      this[2] = m[2];
      this[3] = m[3];

      this[4] = m[4];
      this[5] = m[5];
      this[6] = m[6];
      this[7] = m[7];

      this[8] = m[8];
      this[9] = m[9];
      this[10] = m[10];
      this[11] = m[11];

      this[12] = m[12];
      this[13] = m[13];
      this[14] = m[14];
      this[15] = m[15];
      return this;
    }

    static identity(): Mat4 {
      return new this().identity();
    }

    /**
     * Creates an n-by-n identity matrix.
     */
    identity(): this {
      this[0] = 1;
      this[1] = 0;
      this[2] = 0;
      this[3] = 0;

      this[4] = 0;
      this[5] = 1;
      this[6] = 0;
      this[7] = 0;

      this[8] = 0;
      this[9] = 0;
      this[10] = 1;
      this[11] = 0;

      this[12] = 0;
      this[13] = 0;
      this[14] = 0;
      this[15] = 1;

      return this;
    }

    /**
     * Make the transpose of a matrix.
     */
    transpose(): this {
      let t;

      t = this[1];
      this[1] = this[4];
      this[4] = t;

      t = this[2];
      this[2] = this[8];
      this[8] = t;

      t = this[3];
      this[3] = this[12];
      this[12] = t;

      t = this[6];
      this[6] = this[9];
      this[9] = t;

      t = this[7];
      this[7] = this[13];
      this[13] = t;

      t = this[11];
      this[11] = this[14];
      this[14] = t;

      return this;
    }

    /**
     * Computes the inverse of a 4-by-4 matrix.
     */
    invert(): this {
      const m00 = this[0];
      const m01 = this[1];
      const m02 = this[2];
      const m03 = this[3];

      const m10 = this[4];
      const m11 = this[5];
      const m12 = this[6];
      const m13 = this[7];

      const m20 = this[8];
      const m21 = this[9];
      const m22 = this[10];
      const m23 = this[11];

      const m30 = this[12];
      const m31 = this[13];
      const m32 = this[14];
      const m33 = this[15];

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

      this[0] = d * t0;
      this[1] = d * t1;
      this[2] = d * t2;
      this[3] = d * t3;

      this[4] = d * (tmp_1 * m10 + tmp_2 * m20 + tmp_5 * m30 - (tmp_0 * m10 + tmp_3 * m20 + tmp_4 * m30));
      this[5] = d * (tmp_0 * m00 + tmp_7 * m20 + tmp_8 * m30 - (tmp_1 * m00 + tmp_6 * m20 + tmp_9 * m30));
      this[6] = d * (tmp_3 * m00 + tmp_6 * m10 + tmp_11 * m30 - (tmp_2 * m00 + tmp_7 * m10 + tmp_10 * m30));
      this[7] = d * (tmp_4 * m00 + tmp_9 * m10 + tmp_10 * m20 - (tmp_5 * m00 + tmp_8 * m10 + tmp_11 * m20));

      this[8] = d * (tmp_12 * m13 + tmp_15 * m23 + tmp_16 * m33 - (tmp_13 * m13 + tmp_14 * m23 + tmp_17 * m33));
      this[9] = d * (tmp_13 * m03 + tmp_18 * m23 + tmp_21 * m33 - (tmp_12 * m03 + tmp_19 * m23 + tmp_20 * m33));
      this[10] = d * (tmp_14 * m03 + tmp_19 * m13 + tmp_22 * m33 - (tmp_15 * m03 + tmp_18 * m13 + tmp_23 * m33));
      this[11] = d * (tmp_17 * m03 + tmp_20 * m13 + tmp_23 * m23 - (tmp_16 * m03 + tmp_21 * m13 + tmp_22 * m23));

      this[12] = d * (tmp_14 * m22 + tmp_17 * m32 + tmp_13 * m12 - (tmp_16 * m32 + tmp_12 * m12 + tmp_15 * m22));
      this[13] = d * (tmp_20 * m32 + tmp_12 * m02 + tmp_19 * m22 - (tmp_18 * m22 + tmp_21 * m32 + tmp_13 * m02));
      this[14] = d * (tmp_18 * m12 + tmp_23 * m32 + tmp_15 * m02 - (tmp_22 * m32 + tmp_14 * m02 + tmp_19 * m12));
      this[15] = d * (tmp_22 * m22 + tmp_16 * m02 + tmp_21 * m12 - (tmp_20 * m12 + tmp_23 * m22 + tmp_17 * m02));
      return this;
    }

    /**
     * Multiplies two 4-by-4 matrices with a on the left and b on the right
     */
    multiply(m: Mat4Tuple): this {
      const a00 = this[0];
      const a01 = this[1];
      const a02 = this[2];
      const a03 = this[3];

      const a10 = this[4 + 0];
      const a11 = this[4 + 1];
      const a12 = this[4 + 2];
      const a13 = this[4 + 3];

      const a20 = this[8 + 0];
      const a21 = this[8 + 1];
      const a22 = this[8 + 2];
      const a23 = this[8 + 3];

      const a30 = this[12 + 0];
      const a31 = this[12 + 1];
      const a32 = this[12 + 2];
      const a33 = this[12 + 3];

      const b00 = m[0];
      const b01 = m[1];
      const b02 = m[2];
      const b03 = m[3];

      const b10 = m[4 + 0];
      const b11 = m[4 + 1];
      const b12 = m[4 + 2];
      const b13 = m[4 + 3];

      const b20 = m[8 + 0];
      const b21 = m[8 + 1];
      const b22 = m[8 + 2];
      const b23 = m[8 + 3];

      const b30 = m[12 + 0];
      const b31 = m[12 + 1];
      const b32 = m[12 + 2];
      const b33 = m[12 + 3];

      this[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
      this[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
      this[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
      this[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;

      this[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
      this[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
      this[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
      this[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;

      this[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
      this[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
      this[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
      this[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;

      this[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
      this[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
      this[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
      this[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;

      return this;
    }

    /**
     * Sets the translation component of a 3-by-3 matrix to the given
     * vector.
     * @param v The vector.
     */
    setTranslation(v: Vec3Tuple) {
      this[12] = v[0];
      this[13] = v[1];
      this[14] = v[2];
      this[15] = 1;

      return this;
    }

    /**
     * Returns the translation component of a 3-by-3 matrix as a vector with 3
     * entries.
     * @param v The vector.
     */
    getTranslation<T extends Vec3Tuple>(v: T): T {
      v[0] = this[12];
      v[1] = this[13];
      v[2] = this[14];
      return v;
    }

    /**
     * Returns an axis of a 4x4 matrix as a vector with 3 entries
     * @param m The matrix.
     * @param axis The axis 0 = x, 1 = y, 2 = z;
     * @return The axis component of m.
     */
    getAxis<T extends Vec3Tuple>(axis: number, v: T): T {
      const off = axis * 4;
      v[0] = this[off + 0];
      v[1] = this[off + 1];
      v[2] = this[off + 2];

      return v;
    }

    /**
     * Sets an axis of a 4x4 matrix as a vector with 3 entries
     * @param v the axis vector
     * @param axis The axis  0 = x, 1 = y, 2 = z;
     */
    setAxis(v: Vec3Tuple, axis: number = 0): this {
      const off = axis * 4;
      this[off + 0] = v[0];
      this[off + 1] = v[1];
      this[off + 2] = v[2];

      return this;
    }

    /**
     * Creates a 3-by-3 matrix which translates by the given vector v.
     * @param {Vec2Tuple} v The vector by
     *     which to translate.
     * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
     * @return {Mat3} The translation matrix.
     * @memberOf m3
     */
    translation(v: Vec3Tuple): this {
      return this;
    }

    /**
     * Translates the given 3-by-3 matrix by the given vector v.
     * @param {Mat3} m The matrix.
     * @param {Vec2Tuple} v The vector by
     *     which to translate.
     * @memberOf m3
     */
    translate(v: Vec2Tuple): this {
      return this;
    }

    /**
     * Rotates the given 3-by-3 matrix around the x-axis by the given
     * angle.
     * @param {Mat3} m The matrix.
     * @param {number} angleInRadians The angle by which to rotate (in radians).
     * @memberOf m3
     */
    rotate2(angleInRadians: number): this {
      return this;
    }

    setRotate(angleInRadians: number): this {
      return this;
    }

    /**
     * Creates a 3-by-3 matrix which rotates around the y-axis by the given angle.
     * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
     * @param {number} angleInRadians The angle by which to rotate (in radians).
     * @memberOf m3
     */
    rotationY(angleInRadians: number): this {
      return this;
    }

    /**
     * Rotates the given 3-by-3 matrix around the y-axis by the given
     * angle.
     * @param {Mat3} m The matrix.
     * @param {number} angleInRadians The angle by which to rotate (in radians).
     * @memberOf m3
     */
    rotateY(angleInRadians: number): this {
      return this;
    }

    /**
     * Creates a 3-by-3 matrix which rotates around the z-axis by the given angle.
     * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
     * @param {number} angleInRadians The angle by which to rotate (in radians).
     * @memberOf m3
     */
    rotationZ(angleInRadians: number): this {
      return this;
    }

    /**
     * Rotates the given 3-by-3 matrix around the z-axis by the given
     * angle.
     * @param {Mat3} m The matrix.
     * @param {number} angleInRadians The angle by which to rotate (in radians).
     * @memberOf m3
     */
    rotateZ(angleInRadians: number): this {
      return this;
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
    scaling(v: Vec2Tuple): this {
      return this;
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
    scale([v0, v1, v2]: Vec3Tuple): this {
      this[0] = v0 * this[0 * 4 + 0];
      this[1] = v0 * this[0 * 4 + 1];
      this[2] = v0 * this[0 * 4 + 2];
      this[3] = v0 * this[0 * 4 + 3];
      this[4] = v1 * this[1 * 4 + 0];
      this[5] = v1 * this[1 * 4 + 1];
      this[6] = v1 * this[1 * 4 + 2];
      this[7] = v1 * this[1 * 4 + 3];
      this[8] = v2 * this[2 * 4 + 0];
      this[9] = v2 * this[2 * 4 + 1];
      this[10] = v2 * this[2 * 4 + 2];
      this[11] = v2 * this[2 * 4 + 3];

      return this;
    }

    /**
     * Takes a 4-by-4 matrix and a vector with 3 entries,
     * interprets the vector as a point, transforms that point by the matrix, and
     * returns the result as a vector with 3 entries.
     *
     * @param v __mut__ The point to be transformed.
     */
    transformPoint<T extends Vec3Tuple>(v: T): T {
      const v0 = v[0];
      const v1 = v[1];
      const v2 = v[2];

      const d = v0 * this[0 * 4 + 3] + v1 * this[1 * 4 + 3] + v2 * this[2 * 4 + 3] + this[3 * 4 + 3];

      v[0] = (v0 * this[0 * 4 + 0] + v1 * this[1 * 4 + 0] + v2 * this[2 * 4 + 0] + this[3 * 4 + 0]) / d;
      v[1] = (v0 * this[0 * 4 + 1] + v1 * this[1 * 4 + 1] + v2 * this[2 * 4 + 1] + this[3 * 4 + 1]) / d;
      v[2] = (v0 * this[0 * 4 + 2] + v1 * this[1 * 4 + 2] + v2 * this[2 * 4 + 2] + this[3 * 4 + 2]) / d;

      return v;
    }

    /**
     * Takes a 4-by-4 matrix and a vector with 3 entries, interprets the vector as a
     * direction, transforms that direction by the matrix, and returns the result;
     * assumes the transformation of 3-dimensional space represented by the matrix
     * is parallel-preserving, i.e. any combination of rotation, scaling and
     * translation, but not a perspective distortion. Returns a vector with 3
     * entries.
     *
     * @param v The direction.
     */
    transformDirection(v: Vec3Tuple): this {
      const v0 = v[0];
      const v1 = v[1];
      const v2 = v[2];

      this[0] = v0 * this[0 * 4 + 0] + v1 * this[1 * 4 + 0] + v2 * this[2 * 4 + 0];
      this[1] = v0 * this[0 * 4 + 1] + v1 * this[1 * 4 + 1] + v2 * this[2 * 4 + 1];
      this[2] = v0 * this[0 * 4 + 2] + v1 * this[1 * 4 + 2] + v2 * this[2 * 4 + 2];
      return this;
    }

    static #mi = Mat4.identity();

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
    transformNormal<T extends Vec3Tuple>(v: T): T {
      const mi = Mat4.#mi.copy(this).invert();

      const v0 = v[0];
      const v1 = v[1];
      const v2 = v[2];

      v[0] = v0 * mi[0 * 4 + 0] + v1 * mi[0 * 4 + 1] + v2 * mi[0 * 4 + 2];
      v[1] = v0 * mi[1 * 4 + 0] + v1 * mi[1 * 4 + 1] + v2 * mi[1 * 4 + 2];
      v[2] = v0 * mi[2 * 4 + 0] + v1 * mi[2 * 4 + 1] + v2 * mi[2 * 4 + 2];

      return v;
    }

    static perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
      return new this().perspective(fovy, aspect, near, far);
    }

    perspective(fovy: number, aspect: number, near: number, far: number) {
      const f = 1.0 / Math.tan(fovy / 2);
      const nf = 1 / (near - far);

      this[0] = f / aspect;
      this[1] = 0;
      this[2] = 0;
      this[3] = 0;
      this[4] = 0;
      this[5] = f;
      this[6] = 0;
      this[7] = 0;
      this[8] = 0;
      this[9] = 0;
      this[10] = (far + near) * nf;
      this[11] = -1;
      this[12] = 0;
      this[13] = 0;
      this[14] = 2 * far * near * nf;
      this[15] = 0;

      return this;
    }

    static ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4 {
      return new this().ortho(left, right, bottom, top, near, far);
    }

    /**
     * Computes a 4-by-4 orthogonal transformation matrix given the left, right,
     * bottom, and top dimensions of the near clipping plane as well as the
     * near and far clipping plane distances.
     * @param left Left side of the near clipping plane viewport.
     * @param right Right side of the near clipping plane viewport.
     * @param bottom Bottom of the near clipping plane viewport.
     * @param top Top of the near clipping plane viewport.
     * @param near The depth (negative z coordinate)
     *     of the near clipping plane.
     * @param far The depth (negative z coordinate)
     *     of the far clipping plane.
     */
    ortho(left: number, right: number, bottom: number, top: number, near: number, far: number) {
      this[0] = 2 / (right - left);
      this[1] = 0;
      this[2] = 0;
      this[3] = 0;

      this[4] = 0;
      this[5] = 2 / (top - bottom);
      this[6] = 0;
      this[7] = 0;

      this[8] = 0;
      this[9] = 0;
      this[10] = 2 / (near - far);
      this[11] = 0;

      this[12] = (right + left) / (left - right);
      this[13] = (top + bottom) / (bottom - top);
      this[14] = (far + near) / (near - far);
      this[15] = 1;

      return this;
    }

    quatTranScale(q: number[], v: Vec3Tuple, s: Vec3Tuple) {
      // Quaternion math
      const x = q[0];
      const y = q[1];
      const z = q[2];
      const w = q[3];
      const x2 = x + x;
      const y2 = y + y;
      const z2 = z + z;
      const xx = x * x2;
      const xy = x * y2;
      const xz = x * z2;
      const yy = y * y2;
      const yz = y * z2;
      const zz = z * z2;
      const wx = w * x2;
      const wy = w * y2;
      const wz = w * z2;
      const sx = s[0];
      const sy = s[1];
      const sz = s[2];

      this[0] = (1 - (yy + zz)) * sx;
      this[1] = (xy + wz) * sx;
      this[2] = (xz - wy) * sx;
      this[3] = 0;
      this[4] = (xy - wz) * sy;
      this[5] = (1 - (xx + zz)) * sy;
      this[6] = (yz + wx) * sy;
      this[7] = 0;
      this[8] = (xz + wy) * sz;
      this[9] = (yz - wx) * sz;
      this[10] = (1 - (xx + yy)) * sz;
      this[11] = 0;
      this[12] = v[0];
      this[13] = v[1];
      this[14] = v[2];
      this[15] = 1;

      return this;
    }

    #z = new Vec3();
    #x = new Vec3();
    #y = new Vec3();
    lookAt(eye: Vec3Tuple, center: Vec3Tuple, up: Vec3Tuple) {
      const z = this.#z.subFrom(eye, center).normalize();
      const x = this.#x.crossFrom(up, z).normalize();
      const y = this.#y.crossFrom(z, x).normalize();

      this[0] = x[0];
      this[1] = x[1];
      this[2] = x[2];
      this[3] = 0;
      this[4] = y[0];
      this[5] = y[1];
      this[6] = y[2];
      this[7] = 0;
      this[8] = z[0];
      this[9] = z[1];
      this[10] = z[2];
      this[11] = 0;
      this[12] = eye[0];
      this[13] = eye[1];
      this[14] = eye[2];
      this[15] = 1;

      return this;
    }
  };
