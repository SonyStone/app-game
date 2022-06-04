/**
 * 2x2 Matrix math math functions.
 *
 * Almost all functions take an optional `dst` argument. If it is not passed in the
 * functions will create a new matrix. In other words you can do this
 *
 *     const mat = m2.translation([1, 2, 3]);  // Creates a new translation matrix
 *
 * or
 *
 *     const mat = m2.create();
 *     m2.translation([1, 2, 3], mat);  // Puts translation matrix in mat.
 *
 * The first style is often easier but depending on where it's used it generates garbage where
 * as there is almost never allocation with the second style.
 *
 * It is always save to pass any matrix as the destination. So for example
 *
 *     const mat = m2.identity();
 *     const trans = m2.translation([1, 2, 3]);
 *     m2.multiply(mat, trans, mat);  // Multiplies mat * trans and puts result in mat.
 *
 * @module twgl/m2
 */
let MatType = Float32Array;

/**
 * A JavaScript array with 16 values or a Float32Array with 16 values.
 * When created by the library will create the default type which is `Float32Array`
 * but can be set by calling {@link setDefaultType}.
 * @typedef {(number[]|Float32Array)} Mat2
 * @memberOf m2
 */
type Mat2 = number[] | Float32Array;

/**
 * Sets the type this library creates for a Mat2
 * @param {constructor} ctor the constructor for the type. Either `Float32Array` or `Array`
 * @return {constructor} previous constructor for Mat2
 * @memberOf m2
 */
export function setDefaultType(ctor: typeof MatType) {
  const oldType = MatType;
  MatType = ctor;
  return oldType;
}

/**
 * Negates a matrix.
 * @param {Mat2} m The matrix.
 * @param {Mat2} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat2} -m.
 * @memberOf m2
 */
export function negate(m: Mat2, dst: Mat2 = new MatType(4)): Mat2 {
  dst[0] = -m[0];
  dst[1] = -m[1];
  dst[2] = -m[2];
  dst[3] = -m[3];

  return dst;
}

/**
 * Copies a matrix.
 * @param {Mat2} m The matrix.
 * @param {Mat2} [dst] The matrix. If not passed a new one is created.
 * @return {Mat2} A copy of m.
 * @memberOf m2
 */
export function copy(m: Mat2, dst: Mat2 = new MatType(4)): Mat2 {
  dst[0] = m[0];
  dst[1] = m[1];
  dst[2] = m[2];
  dst[3] = m[3];

  return dst;
}

/**
 * Creates an n-by-n identity matrix.
 *
 * @param {Mat2} [dst] matrix to hold result. If not passed a new one is created.
 * @return {Mat2} An n-by-n identity matrix.
 * @memberOf m4
 */
export function identity(dst: Mat2 = new MatType(4)): Mat2 {
  dst[0] = 1;
  dst[1] = 0;
  dst[2] = 0;
  dst[3] = 1;

  return dst;
}
