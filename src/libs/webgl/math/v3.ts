/**
 *
 * Vec3 math math functions.
 *
 * Almost all functions take an optional `dst` argument. If it is not passed in the
 * functions will create a new Vec3. In other words you can do this
 *
 *     var v = v3.cross(v1, v2);  // Creates a new Vec3 with the cross product of v1 x v2.
 *
 * or
 *
 *     var v = v3.create();
 *     v3.cross(v1, v2, v);  // Puts the cross product of v1 x v2 in v
 *
 * The first style is often easier but depending on where it's used it generates garbage where
 * as there is almost never allocation with the second style.
 *
 * It is always save to pass any vector as the destination. So for example
 *
 *     v3.cross(v1, v2, v1);  // Puts the cross product of v1 x v2 in v1
 *
 * @module twgl/v3
 */
let VecType = Float32Array;

/**
 * A JavaScript array with 3 values or a Float32Array with 3 values.
 * When created by the library will create the default type which is `Float32Array`
 * but can be set by calling {@link setDefaultType}.
 * @typedef {(number[]|Float32Array)} Vec3
 */
export type Vec3 = number[] | Float32Array;

/**
 * Sets the type this library creates for a Vec3
 * @param {constructor} ctor the constructor for the type. Either `Float32Array` or `Array`
 * @return {constructor} previous constructor for Vec3
 */
export function setDefaultType(ctor: typeof VecType) {
  const oldType = VecType;
  VecType = ctor;
  return oldType;
}

/**
 * Creates a vec3; may be called with x, y, z to set initial values.
 * @param {number} [x] Initial x value.
 * @param {number} [y] Initial y value.
 * @param {number} [z] Initial z value.
 * @return {Vec3} the created vector
 */
export function create(x: number = 0, y: number = 0, z: number = 0): Vec3 {
  const dst = new VecType(3);

  dst[0] = x;
  dst[1] = y;
  dst[2] = z;

  return dst;
}

/**
 * Adds two vectors; assumes a and b have the same dimension.
 * @param {Vec3} a Operand vector.
 * @param {Vec3} b Operand vector.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} A vector tha tis the sum of a and b.
 */
export function add(a: Vec3, b: Vec3, dst: Vec3 = new VecType(3)): Vec3 {
  dst[0] = a[0] + b[0];
  dst[1] = a[1] + b[1];
  dst[2] = a[2] + b[2];

  return dst;
}

/**
 * Subtracts two vectors.
 * @param {Vec3} a Operand vector.
 * @param {Vec3} b Operand vector.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} A vector that is the difference of a and b.
 */
export function subtract(a: Vec3, b: Vec3, dst: Vec3 = new VecType(3)): Vec3 {
  dst[0] = a[0] - b[0];
  dst[1] = a[1] - b[1];
  dst[2] = a[2] - b[2];

  return dst;
}

/**
 * Performs linear interpolation on two vectors.
 * Given vectors a and b and interpolation coefficient t, returns
 * a + t * (b - a).
 * @param {Vec3} a Operand vector.
 * @param {Vec3} b Operand vector.
 * @param {number} t Interpolation coefficient.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} The linear interpolated result.
 */
export function lerp(
  a: Vec3,
  b: Vec3,
  t: number,
  dst: Vec3 = new VecType(3)
): Vec3 {
  dst[0] = a[0] + t * (b[0] - a[0]);
  dst[1] = a[1] + t * (b[1] - a[1]);
  dst[2] = a[2] + t * (b[2] - a[2]);

  return dst;
}

/**
 * Performs linear interpolation on two vectors.
 * Given vectors a and b and interpolation coefficient vector t, returns
 * a + t * (b - a).
 * @param {Vec3} a Operand vector.
 * @param {Vec3} b Operand vector.
 * @param {Vec3} t Interpolation coefficients vector.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} the linear interpolated result.
 */
export function lerpV(
  a: Vec3,
  b: Vec3,
  t: Vec3,
  dst: Vec3 = new VecType(3)
): Vec3 {
  dst[0] = a[0] + t[0] * (b[0] - a[0]);
  dst[1] = a[1] + t[1] * (b[1] - a[1]);
  dst[2] = a[2] + t[2] * (b[2] - a[2]);

  return dst;
}

/**
 * Return max values of two vectors.
 * Given vectors a and b returns
 * [max(a[0], b[0]), max(a[1], b[1]), max(a[2], b[2])].
 * @param {Vec3} a Operand vector.
 * @param {Vec3} b Operand vector.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} The max components vector.
 */
export function max(a: Vec3, b: Vec3, dst: Vec3 = new VecType(3)): Vec3 {
  dst[0] = Math.max(a[0], b[0]);
  dst[1] = Math.max(a[1], b[1]);
  dst[2] = Math.max(a[2], b[2]);

  return dst;
}

/**
 * Return min values of two vectors.
 * Given vectors a and b returns
 * [min(a[0], b[0]), min(a[1], b[1]), min(a[2], b[2])].
 * @param {Vec3} a Operand vector.
 * @param {Vec3} b Operand vector.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} The min components vector.
 */
export function min(a: Vec3, b: Vec3, dst: Vec3 = new VecType(3)): Vec3 {
  dst[0] = Math.min(a[0], b[0]);
  dst[1] = Math.min(a[1], b[1]);
  dst[2] = Math.min(a[2], b[2]);

  return dst;
}

/**
 * Multiplies a vector by a scalar.
 * @param {Vec3} v The vector.
 * @param {number} k The scalar.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} The scaled vector.
 */
export function mulScalar(
  v: Vec3,
  k: number,
  dst: Vec3 = new VecType(3)
): Vec3 {
  dst[0] = v[0] * k;
  dst[1] = v[1] * k;
  dst[2] = v[2] * k;

  return dst;
}

/**
 * Divides a vector by a scalar.
 * @param {Vec3} v The vector.
 * @param {number} k The scalar.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} The scaled vector.
 */
export function divScalar(
  v: Vec3,
  k: number,
  dst: Vec3 = new VecType(3)
): Vec3 {
  dst[0] = v[0] / k;
  dst[1] = v[1] / k;
  dst[2] = v[2] / k;

  return dst;
}

/**
 * Computes the cross product of two vectors; assumes both vectors have
 * three entries.
 * @param {Vec3} a Operand vector.
 * @param {Vec3} b Operand vector.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} The vector of a cross b.
 */
export function cross(a: Vec3, b: Vec3, dst: Vec3 = new VecType(3)): Vec3 {
  const t1 = a[2] * b[0] - a[0] * b[2];
  const t2 = a[0] * b[1] - a[1] * b[0];
  dst[0] = a[1] * b[2] - a[2] * b[1];
  dst[1] = t1;
  dst[2] = t2;

  return dst;
}

/**
 * Computes the dot product of two vectors; assumes both vectors have
 * three entries.
 * @param {Vec3} a Operand vector.
 * @param {Vec3} b Operand vector.
 * @return {number} dot product
 */
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Computes the length of vector
 * @param {Vec3} v vector.
 * @return {number} length of vector.
 */
export function length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/**
 * Computes the square of the length of vector
 * @param {Vec3} v vector.
 * @return {number} square of the length of vector.
 */
export function lengthSq(v: Vec3): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

/**
 * Computes the distance between 2 points
 * @param {Vec3} a vector.
 * @param {Vec3} b vector.
 * @return {number} distance between a and b
 */
export function distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Computes the square of the distance between 2 points
 * @param {Vec3} a vector.
 * @param {Vec3} b vector.
 * @return {number} square of the distance between a and b
 */
export function distanceSq(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Divides a vector by its Euclidean length and returns the quotient.
 * @param {Vec3} a The vector.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} The normalized vector.
 */
export function normalize(a: Vec3, dst: Vec3 = new VecType(3)): Vec3 {
  const lenSq = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
  const len = Math.sqrt(lenSq);
  if (len > 0.00001) {
    dst[0] = a[0] / len;
    dst[1] = a[1] / len;
    dst[2] = a[2] / len;
  } else {
    dst[0] = 0;
    dst[1] = 0;
    dst[2] = 0;
  }

  return dst;
}

/**
 * Negates a vector.
 * @param {Vec3} v The vector.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} -v.
 */
export function negate(v: Vec3, dst: Vec3 = new VecType(3)): Vec3 {
  dst[0] = -v[0];
  dst[1] = -v[1];
  dst[2] = -v[2];

  return dst;
}

/**
 * Copies a vector.
 * @param {Vec3} v The vector.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} A copy of v.
 */
export function copy(v: Vec3, dst: Vec3 = new VecType(3)): Vec3 {
  dst[0] = v[0];
  dst[1] = v[1];
  dst[2] = v[2];

  return dst;
}

/**
 * Multiplies a vector by another vector (component-wise); assumes a and
 * b have the same length.
 * @param {Vec3} a Operand vector.
 * @param {Vec3} b Operand vector.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} The vector of products of entries of a and
 *     b.
 */
export function multiply(a: Vec3, b: Vec3, dst: Vec3 = new VecType(3)): Vec3 {
  dst[0] = a[0] * b[0];
  dst[1] = a[1] * b[1];
  dst[2] = a[2] * b[2];

  return dst;
}

/**
 * Divides a vector by another vector (component-wise); assumes a and
 * b have the same length.
 * @param {Vec3} a Operand vector.
 * @param {Vec3} b Operand vector.
 * @param {Vec3} [dst] vector to hold result. If not new one is created.
 * @return {Vec3} The vector of quotients of entries of a and
 *     b.
 */
export function divide(a: Vec3, b: Vec3, dst: Vec3 = new VecType(3)): Vec3 {
  dst[0] = a[0] / b[0];
  dst[1] = a[1] / b[1];
  dst[2] = a[2] / b[2];

  return dst;
}
