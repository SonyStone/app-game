import { Vec2 } from './v2';
import { Tuple } from './v3';

/**
 *
 * Vec4 math math functions.
 *
 * Almost all functions take an optional `dst` argument. If it is not passed in the
 * functions will create a new Vec4. In other words you can do this
 *
 *     var v = v4.cross(v1, v2);  // Creates a new Vec4 with the cross product of v1 x v2.
 *
 * or
 *
 *     var v = v4.create();
 *     v4.cross(v1, v2, v);  // Puts the cross product of v1 x v2 in v
 *
 * The first style is often easier but depending on where it's used it generates garbage where
 * as there is almost never allocation with the second style.
 *
 * It is always save to pass any vector as the destination. So for example
 *
 *     v4.cross(v1, v2, v1);  // Puts the cross product of v1 x v2 in v1
 *
 */
let VecType = Float32Array;

/**
 * A JavaScript array with 3 values or a Float32Array with 3 values.
 * When created by the library will create the default type which is `Float32Array`
 * but can be set by calling {@link setDefaultType}.
 * @typedef {(number[]|Float32Array)} Vec4
 */
export type Vec4 = number[] | Float32Array;

/**
 * Sets the type this library creates for a Vec4
 * @param {constructor} ctor the constructor for the type. Either `Float32Array` or `Array`
 * @return {constructor} previous constructor for Vec4
 */
export function setDefaultType(ctor: typeof VecType) {
  const oldType = VecType;
  VecType = ctor;
  return oldType;
}

/**
 * Creates a Vec4; may be called with x, y, z, w to set initial values.
 * @param {number} [x] Initial x value.
 * @param {number} [y] Initial y value.
 * @param {number} [z] Initial z value.
 * @param {number} [w] Initial w value.
 * @return {Vec4} the created vector
 */
export function create(x: number = 0, y: number = 0, z: number = 0, w: number = 0): Vec4 {
  const dst = new VecType(4);

  dst[0] = x;
  dst[1] = y;
  dst[2] = z;
  dst[3] = w;

  return dst;
}

/**
 * Creates a Vec2; may be called with x, y, z to set initial values.
 * @param {number} [x] set x value.
 * @param {number} [y] set y value.
 * @param {number} [z] set z value.
 * @param {number} [w] set w value.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} the created vector
 */
export function set(x: number = 0, y: number = 0, z: number = 0, w: number = 0, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = x;
  dst[1] = y;
  dst[2] = z;
  dst[3] = w;

  return dst;
}

export function x(a: Vec4 | Tuple | Vec2): number {
  return a[0];
}

export function y(a: Vec4 | Tuple | Vec2): number {
  return a[1];
}

export function z(a: Vec4 | Tuple): number {
  return a[2];
}

export function w(a: Vec4): number {
  return a[3];
}

/**
 * Adds two vectors; assumes a and b have the same dimension.
 * @param {Vec4} a Operand vector.
 * @param {Vec4} b Operand vector.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} A vector tha tis the sum of a and b.
 */
export function add(a: Vec4, b: Vec4, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = a[0] + b[0];
  dst[1] = a[1] + b[1];
  dst[2] = a[2] + b[2];
  dst[3] = a[3] + b[3];

  return dst;
}

/**
 * Subtracts two vectors.
 * @param {Vec4} a Operand vector.
 * @param {Vec4} b Operand vector.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} A vector that is the difference of a and b.
 */
export function subtract(a: Vec4, b: Vec4, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = a[0] - b[0];
  dst[1] = a[1] - b[1];
  dst[2] = a[2] - b[2];
  dst[3] = a[3] - b[3];

  return dst;
}

/**
 * Performs linear interpolation on two vectors.
 * Given vectors a and b and interpolation coefficient t, returns
 * a + t * (b - a).
 * @param {Vec4} a Operand vector.
 * @param {Vec4} b Operand vector.
 * @param {number} t Interpolation coefficient.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} The linear interpolated result.
 */
export function lerp(a: Vec4, b: Vec4, t: number, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = a[0] + t * (b[0] - a[0]);
  dst[1] = a[1] + t * (b[1] - a[1]);
  dst[2] = a[2] + t * (b[2] - a[2]);
  dst[3] = a[3] + t * (b[3] - a[3]);

  return dst;
}

/**
 * Performs linear interpolation on two vectors.
 * Given vectors a and b and interpolation coefficient vector t, returns
 * a + t * (b - a).
 * @param {Vec4} a Operand vector.
 * @param {Vec4} b Operand vector.
 * @param {Vec4} t Interpolation coefficients vector.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} the linear interpolated result.
 */
export function lerpV(a: Vec4, b: Vec4, t: Vec4, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = a[0] + t[0] * (b[0] - a[0]);
  dst[1] = a[1] + t[1] * (b[1] - a[1]);
  dst[2] = a[2] + t[2] * (b[2] - a[2]);
  dst[3] = a[3] + t[3] * (b[3] - a[3]);

  return dst;
}

/**
 * Return max values of two vectors.
 * Given vectors a and b returns
 * [max(a[0], b[0]), max(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])].
 * @param {Vec4} a Operand vector.
 * @param {Vec4} b Operand vector.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} The max components vector.
 */
export function max(a: Vec4, b: Vec4, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = Math.max(a[0], b[0]);
  dst[1] = Math.max(a[1], b[1]);
  dst[2] = Math.max(a[2], b[2]);
  dst[3] = Math.max(a[3], b[3]);

  return dst;
}

/**
 * Return min values of two vectors.
 * Given vectors a and b returns
 * [min(a[0], b[0]), min(a[1], b[1]), min(a[2], b[2]),  min(a[3], b[3])].
 * @param {Vec4} a Operand vector.
 * @param {Vec4} b Operand vector.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} The min components vector.
 */
export function min(a: Vec4, b: Vec4, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = Math.min(a[0], b[0]);
  dst[1] = Math.min(a[1], b[1]);
  dst[2] = Math.min(a[2], b[2]);
  dst[3] = Math.min(a[3], b[3]);

  return dst;
}

/**
 * Multiplies a vector by a scalar.
 * @param {Vec4} v The vector.
 * @param {number} k The scalar.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} The scaled vector.
 */
export function mulScalar(v: Vec4, k: number, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = v[0] * k;
  dst[1] = v[1] * k;
  dst[2] = v[2] * k;
  dst[3] = v[3] * k;

  return dst;
}

/**
 * Divides a vector by a scalar.
 * @param {Vec4} v The vector.
 * @param {number} k The scalar.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} The scaled vector.
 */
export function divScalar(v: Vec4, k: number, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = v[0] / k;
  dst[1] = v[1] / k;
  dst[2] = v[2] / k;
  dst[3] = v[3] / k;

  return dst;
}

/**
 * Computes the dot product of two vectors; assumes both vectors have
 * three entries.
 * @param {Vec4} a Operand vector.
 * @param {Vec4} b Operand vector.
 * @return {number} dot product
 */
export function dot(a: Vec4, b: Vec4): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

/**
 * Computes the length of vector
 * @param {Vec4} v vector.
 * @return {number} length of vector.
 */
export function length(v: Vec4): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2] + v[3] * v[3]);
}

/**
 * Computes the square of the length of vector
 * @param {Vec4} v vector.
 * @return {number} square of the length of vector.
 * @memberOf module:twgl/v4
 */
export function lengthSq(v: Vec4): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2] + v[3] * v[3];
}

/**
 * Computes the distance between 2 points
 * @param {Vec4} a vector.
 * @param {Vec4} b vector.
 * @return {number} distance between a and b
 * @memberOf module:twgl/v4
 */
export function distance(a: Vec4, b: Vec4): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  const dw = a[3] - b[3];
  return Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
}

/**
 * Computes the square of the distance between 2 points
 * @param {Vec4} a vector.
 * @param {Vec4} b vector.
 * @return {number} square of the distance between a and b
 * @memberOf module:twgl/v4
 */
export function distanceSq(a: Vec4, b: Vec4): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  const dw = a[3] - b[3];
  return dx * dx + dy * dy + dz * dz + dw * dw;
}

/**
 * Divides a vector by its Euclidean length and returns the quotient.
 * @param {Vec4} a The vector.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} The normalized vector.
 * @memberOf module:twgl/v4
 */
export function normalize(a: Vec4, dst: Vec4 = new VecType(4)): Vec4 {
  const lenSq = a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3];
  const len = Math.sqrt(lenSq);
  if (len > 0.00001) {
    dst[0] = a[0] / len;
    dst[1] = a[1] / len;
    dst[2] = a[2] / len;
    dst[3] = a[3] / len;
  } else {
    dst[0] = 0;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
  }

  return dst;
}

/**
 * Negates a vector.
 * @param {Vec4} v The vector.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} -v.
 * @memberOf module:twgl/v4
 */
export function negate(v: Vec4, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = -v[0];
  dst[1] = -v[1];
  dst[2] = -v[2];
  dst[3] = -v[3];

  return dst;
}

/**
 * Copies a vector.
 * @param {Vec4} v The vector.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} A copy of v.
 * @memberOf module:twgl/v4
 */
export function copy(v: Vec4, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = v[0];
  dst[1] = v[1];
  dst[2] = v[2];
  dst[3] = v[3];

  return dst;
}

/**
 * Multiplies a vector by another vector (component-wise); assumes a and
 * b have the same length.
 * @param {Vec4} a Operand vector.
 * @param {Vec4} b Operand vector.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} The vector of products of entries of a and
 *     b.
 * @memberOf module:twgl/v4
 */
export function multiply(a: Vec4, b: Vec4, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = a[0] * b[0];
  dst[1] = a[1] * b[1];
  dst[2] = a[2] * b[2];
  dst[3] = a[3] * b[3];

  return dst;
}

/**
 * Divides a vector by another vector (component-wise); assumes a and
 * b have the same length.
 * @param {Vec4} a Operand vector.
 * @param {Vec4} b Operand vector.
 * @param {Vec4} [dst] vector to hold result. If not new one is created.
 * @return {Vec4} The vector of quotients of entries of a and
 *     b.
 * @memberOf module:twgl/v4
 */
export function divide(a: Vec4, b: Vec4, dst: Vec4 = new VecType(4)): Vec4 {
  dst[0] = a[0] / b[0];
  dst[1] = a[1] / b[1];
  dst[2] = a[2] / b[2];
  dst[3] = a[3] / b[3];

  return dst;
}
