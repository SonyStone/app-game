import { TypedArrayConstructor } from './utils/typed-array';
import { type Vec2Tuple } from './v2';

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
export type Mat3Tuple =
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
export const Mat3Builder = (ctor: TypedArrayConstructor) =>
  class Mat3 extends (ctor as ArrayConstructor) {
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
    constructor() {
      super(9);
    }

    set(
      m00: number,
      m01: number,
      m02: number,
      m10: number,
      m11: number,
      m12: number,
      m20: number,
      m21: number,
      m22: number
    ): this {
      this[0] = m00;
      this[1] = m01;
      this[2] = m02;
      this[3] = m10;
      this[4] = m11;
      this[5] = m12;
      this[6] = m20;
      this[7] = m21;
      this[8] = m22;
      return this;
    }

    /**
     * Negates a matrix.
     * @param {Mat3} m The matrix.
     * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
     * @return {Mat3} -m.
     * @memberOf m3
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

      return this;
    }

    /**
     * Copies a matrix.
     * @param {Mat3} a The matrix.
     * @param {Mat3} m The matrix.
     * @memberOf m3
     */
    copy(m: Mat3Tuple): this {
      this[0] = m[0];
      this[1] = m[1];
      this[2] = m[2];
      this[3] = m[3];
      this[4] = m[4];
      this[5] = m[5];
      this[6] = m[6];
      this[7] = m[7];
      this[8] = m[8];
      return this;
    }

    static identity(): Mat3 {
      return new this().identity();
    }

    /**
     * Creates an n-by-n identity matrix.
     *
     * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
     * @return {Mat3} An n-by-n identity matrix.
     * @memberOf m3
     */
    identity(): this {
      this[0] = 1;
      this[1] = 0;
      this[2] = 0;

      this[3] = 0;
      this[4] = 1;
      this[5] = 0;

      this[6] = 0;
      this[7] = 0;
      this[8] = 1;

      return this;
    }

    /**
     * Takes the transpose of a matrix.
     * @param {Mat3} m The matrix.
     * @memberOf m3
     */
    transpose(): this {
      let t;

      t = this[1];
      this[1] = this[3];
      this[3] = t;

      t = this[2];
      this[2] = this[6];
      this[6] = t;

      t = this[5];
      this[5] = this[7];
      this[7] = t;

      return this;
    }

    /**
     * Computes the inverse of a 3-by-3 matrix.
     * @param {Mat3} m The matrix.
     * @memberOf m3
     */
    invert(): this {
      const m00 = this[0 * 3 + 0];
      const m01 = this[0 * 3 + 1];
      const m02 = this[0 * 3 + 2];

      const m10 = this[1 * 3 + 0];
      const m11 = this[1 * 3 + 1];
      const m12 = this[1 * 3 + 2];

      const m20 = this[2 * 3 + 0];
      const m21 = this[2 * 3 + 1];
      const m22 = this[2 * 3 + 2];

      const t00 = m22 * m11 - m21 * m12;
      const t01 = m21 * m02 - m22 * m01;
      const t02 = m12 * m01 - m11 * m02;

      // Calculate the determinant
      const det = m00 * t00 + m10 * t01 + m20 * t02;
      if (!det) {
        return this;
      }
      const detInv = 1 / det;

      this[0] = t00 * detInv;
      this[1] = (m20 * m12 - m22 * m10) * detInv;
      this[2] = (m21 * m10 - m20 * m11) * detInv;

      this[3] = t01 * detInv;
      this[4] = (m22 * m00 - m20 * m02) * detInv;
      this[5] = (m20 * m01 - m21 * m00) * detInv;

      this[6] = t02 * detInv;
      this[7] = (m10 * m02 - m12 * m00) * detInv;
      this[8] = (m11 * m00 - m10 * m01) * detInv;
      return this;
    }

    /**
     * Multiplies two 3-by-3 matrices with a on the left and b on the right
     * @param {Mat3} this The matrix on the left.
     * @param {Mat3} m The matrix on the right.
     * @memberOf m3
     */
    multiply(m: Mat3): this {
      const a00 = this[0];
      const a01 = this[1];
      const a02 = this[2];

      const a10 = this[4 + 0];
      const a11 = this[4 + 1];
      const a12 = this[4 + 2];

      const a20 = this[8 + 0];
      const a21 = this[8 + 1];
      const a22 = this[8 + 2];

      const b00 = m[0];
      const b01 = m[1];
      const b02 = m[2];

      const b10 = m[4 + 0];
      const b11 = m[4 + 1];
      const b12 = m[4 + 2];

      const b20 = m[8 + 0];
      const b21 = m[8 + 1];
      const b22 = m[8 + 2];

      this[0] = a00 * b00 + a10 * b01 + a20 * b02;
      this[1] = a01 * b00 + a11 * b01 + a21 * b02;
      this[2] = a02 * b00 + a12 * b01 + a22 * b02;

      this[3] = a00 * b10 + a10 * b11 + a20 * b12;
      this[4] = a01 * b10 + a11 * b11 + a21 * b12;
      this[5] = a02 * b10 + a12 * b11 + a22 * b12;

      this[6] = a00 * b20 + a10 * b21 + a20 * b22;
      this[7] = a01 * b20 + a11 * b21 + a21 * b22;
      this[8] = a02 * b20 + a12 * b21 + a22 * b22;

      return this;
    }

    /**
     * Sets the translation component of a 3-by-3 matrix to the given
     * vector.
     * @param a _mut_ The matrix.
     * @param v The vector.
     */
    setTranslation(v: Vec2Tuple) {
      this[6] = v[0];
      this[7] = v[1];
      this[8] = 1;

      return this;
    }

    /**
     * Returns the translation component of a 3-by-3 matrix as a vector with 3
     * entries.
     * @param {Mat3} m The matrix.
     */
    getTranslation<T extends Vec2Tuple>(v: T): T {
      v[0] = this[6];
      v[1] = this[7];
      return v;
    }

    /**
     * Returns the translation component of a 3-by-3 matrix as a vector with 3
     * entries.
     * @param {Mat3} m The matrix.
     */
    getX(): number {
      return this[6];
    }

    /**
     * Returns the translation component of a 3-by-3 matrix as a vector with 3
     * entries.
     * @param {Mat3} m The matrix.
     */
    getY(): number {
      return this[7];
    }

    /**
     * Returns an axis of a 3x3 matrix as a vector with 2 entries
     * @param {Mat3} m The matrix.
     * @param {number} axis The axis 0 = x, 1 = y;
     */
    getAxis<T extends Vec2Tuple>(axis: number, v: T): T {
      const off = axis * 3;
      v[0] = this[off + 0];
      v[1] = this[off + 1];

      return v;
    }

    /**
     * Sets an axis of a 3x3 matrix as a vector with 2 entries
     * @param {Mat3} m The matrix.
     * @param {Vec2Tuple} v the axis vector
     * @param {number} axis The axis  0 = x, 1 = y;
     */
    setAxis(v: Vec2Tuple, axis: number = 0): this {
      const off = axis * 3;
      this[off + 0] = v[0];
      this[off + 1] = v[1];
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
    translation(v: Vec2Tuple): this {
      this[0] = 1;
      this[1] = 0;
      this[2] = 0;

      this[3] = 0;
      this[4] = 1;
      this[5] = 0;

      this[6] = v[0];
      this[7] = v[1];
      this[8] = 1;

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
      const v0 = v[0];
      const v1 = v[1];

      const m00 = this[0];
      const m01 = this[1];
      const m02 = this[2];

      const m10 = this[1 * 3 + 0];
      const m11 = this[1 * 3 + 1];
      const m12 = this[1 * 3 + 2];

      const m20 = this[2 * 3 + 0];
      const m21 = this[2 * 3 + 1];
      const m22 = this[2 * 3 + 2];

      this[6] = m00 * v0 + m10 * v1 + m20;
      this[7] = m01 * v0 + m11 * v1 + m21;
      this[8] = m02 * v0 + m12 * v1 + m22;
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
      const cos = Math.cos(angleInRadians);
      const sin = Math.sin(angleInRadians);

      const m10 = this[0]; // a
      const m11 = this[1]; // b

      const m20 = this[3]; // c
      const m21 = this[4]; // d

      const m30 = this[6]; // x
      const m31 = this[7]; // y

      this[0] = cos * m10 - sin * m11; // a = a - b
      this[1] = sin * m10 + cos * m11; // b = a + b

      this[3] = cos * m20 - sin * m21; // c = c - d
      this[4] = sin * m20 + cos * m21; // d = c + d

      this[6] = cos * m30 - sin * m31; // x = x - y
      this[7] = sin * m30 + cos * m31; // y = x + y
      return this;
    }

    setRotate(angleInRadians: number): this {
      const cos = Math.cos(angleInRadians);
      const sin = Math.sin(angleInRadians);

      this[0] = cos;
      this[1] = sin;
      this[3] = -sin;
      this[4] = cos;
      return this;
    }

    /**
     * Creates a 3-by-3 matrix which rotates around the y-axis by the given angle.
     * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
     * @param {number} angleInRadians The angle by which to rotate (in radians).
     * @memberOf m3
     */
    rotationY(angleInRadians: number): this {
      const c = Math.cos(angleInRadians);
      const s = Math.sin(angleInRadians);

      this[0] = c;
      this[1] = 0;
      this[2] = -s;
      this[3] = 0;
      this[4] = 0;
      this[5] = 1;
      this[6] = 0;
      this[7] = 0;
      this[8] = s;
      this[9] = 0;
      this[10] = c;
      this[11] = 0;
      this[12] = 0;
      this[13] = 0;
      this[14] = 0;
      this[15] = 1;
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
      const m00 = this[0 * 3 + 0];
      const m01 = this[0 * 3 + 1];
      const m02 = this[0 * 3 + 2];

      const m20 = this[2 * 3 + 0];
      const m21 = this[2 * 3 + 1];
      const m22 = this[2 * 3 + 2];

      const c = Math.cos(angleInRadians);
      const s = Math.sin(angleInRadians);

      this[0] = c * m00 - s * m20;
      this[1] = c * m01 - s * m21;
      this[2] = c * m02 - s * m22;

      this[8] = c * m20 + s * m00;
      return this;
    }

    /**
     * Creates a 3-by-3 matrix which rotates around the z-axis by the given angle.
     * @param {Mat3} [m] matrix to hold result. If not passed a new one is created.
     * @param {number} angleInRadians The angle by which to rotate (in radians).
     * @memberOf m3
     */
    rotationZ(angleInRadians: number): this {
      const c = Math.cos(angleInRadians);
      const s = Math.sin(angleInRadians);

      this[0] = c;
      this[1] = s;
      this[2] = 0;
      this[3] = 0;
      this[4] = -s;
      this[5] = c;
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
     * Rotates the given 3-by-3 matrix around the z-axis by the given
     * angle.
     * @param {Mat3} m The matrix.
     * @param {number} angleInRadians The angle by which to rotate (in radians).
     * @memberOf m3
     */
    rotateZ(angleInRadians: number): this {
      const m00 = this[0 * 3 + 0];
      const m01 = this[0 * 3 + 1];
      const m02 = this[0 * 3 + 2];

      const m10 = this[1 * 3 + 0];
      const m11 = this[1 * 3 + 1];
      const m12 = this[1 * 3 + 2];

      const c = Math.cos(angleInRadians);
      const s = Math.sin(angleInRadians);

      this[0] = c * m00 + s * m10;
      this[1] = c * m01 + s * m11;
      this[2] = c * m02 + s * m12;

      this[4] = c * m10 - s * m00;
      this[5] = c * m11 - s * m01;
      this[6] = c * m12 - s * m02;
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
      this[0] = v[0];
      this[1] = 0;
      this[2] = 0;
      this[3] = 0;
      this[4] = 0;
      this[5] = v[1];
      this[6] = 0;
      this[7] = 0;
      this[8] = 0;
      this[9] = 0;
      this[10] = v[2];
      this[11] = 0;
      this[12] = 0;
      this[13] = 0;
      this[14] = 0;
      this[15] = 1;
      return this;
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
    scale(v: Vec2Tuple): this {
      const v0 = v[0];
      const v1 = v[1];

      this[0] = v0 * this[0 * 3 + 0];
      this[1] = v0 * this[0 * 3 + 1];
      this[2] = v0 * this[0 * 3 + 2];

      this[3] = v1 * this[1 * 3 + 0];
      this[4] = v1 * this[1 * 3 + 1];
      this[5] = v1 * this[1 * 3 + 2];
      return this;
    }

    /**
     * Takes a 3-by-3 matrix and a vector with 2 entries,
     * interprets the vector as a point, transforms that point by the matrix, and
     * returns the result as a vector with 2 entries.
     *
     * @param v __mut__ The point.
     * @param m The matrix.
     */
    transformPoint(v: Vec2Tuple): this {
      const v0 = v[0];
      const v1 = v[1];
      const d = v0 * this[0 * 4 + 3] + v1 * this[1 * 4 + 3] + this[3 * 4 + 3];

      v[0] = (v0 * this[0 * 4 + 0] + v1 * this[1 * 4 + 0] + this[3 * 4 + 0]) / d;
      v[1] = (v0 * this[0 * 4 + 1] + v1 * this[1 * 4 + 1] + this[3 * 4 + 1]) / d;
      return this;
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
    transformDirection(v: Vec2Tuple): this {
      const v0 = v[0];
      const v1 = v[1];
      const v2 = v[2];

      this[0] = v0 * this[0 * 4 + 0] + v1 * this[1 * 4 + 0] + v2 * this[2 * 4 + 0];
      this[1] = v0 * this[0 * 4 + 1] + v1 * this[1 * 4 + 1] + v2 * this[2 * 4 + 1];
      this[2] = v0 * this[0 * 4 + 2] + v1 * this[1 * 4 + 2] + v2 * this[2 * 4 + 2];
      return this;
    }

    static #mi = Mat3.identity();

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
    transformNormal<T extends Vec2Tuple>(v: T): T {
      const mi = Mat3.#mi.copy(this).invert();

      const v0 = v[0];
      const v1 = v[1];

      v[0] = v0 * mi[0 * 4 + 0] + v1 * mi[0 * 4 + 1];
      v[1] = v0 * mi[1 * 4 + 0] + v1 * mi[1 * 4 + 1];
      return v;
    }
  };
