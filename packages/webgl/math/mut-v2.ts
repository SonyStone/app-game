import { DOWN, LEFT, RIGHT, setDefaultType, UP, Vec2, VecType, ZERO } from './v2';
import { Vec3 } from './v3';

export type { Vec2 };
export { UP, RIGHT, LEFT, DOWN, ZERO, setDefaultType };

/**
 * Creates a Vec2; may be called with x, y, z to set initial values.
 * @param {number} [x] Initial x value.
 * @param {number} [y] Initial y value.
 * @return {Vec2} the created vector
 */
export function create(x: number = 0, y: number = 0): Vec2 {
  const dst = new VecType(2);

  dst[0] = x;
  dst[1] = y;

  return dst;
}

/**
 * Creates a Vec2; may be called with x, y, z to set initial values.
 * @param v the created vector.
 * @param x set x value.
 * @param y set y value.
 */
export function set(v: Vec2 = new VecType(2), x: number = 0, y: number = 0) {
  v[0] = x;
  v[1] = y;
}

/**
 * Adds two vectors; assumes a and b have the same dimension.
 * @param a Operand vector → A vector tha tis the sum of a and b.
 * @param b Operand vector.
 */
export function add(a: Vec2, b: Vec2) {
  a[0] += b[0];
  a[1] += b[1];
}

/**
 * Subtracts two vectors.
 * @param a Operand vector → A vector that is the difference of a and b.
 * @param b Operand vector.
 */
export function subtract(a: Vec2, b: Vec2) {
  a[0] -= b[0];
  a[1] -= b[1];
}

/**
 * Performs linear interpolation on two vectors.
 * Given vectors a and b and interpolation coefficient t, returns
 * a + t * (b - a).
 * @param a __mut__ Operand vector → The linear interpolated result.
 * @param b Operand vector.
 * @param t Interpolation coefficient.
 */
export function lerp(a: Vec2, b: Vec2, t: number) {
  a[0] = a[0] + t * (b[0] - a[0]);
  a[1] = a[1] + t * (b[1] - a[1]);
}

/**
 * Performs linear interpolation on two vectors.
 * Given vectors a and b and interpolation coefficient vector t, returns
 * a + t * (b - a).
 * @param a __mut__ Operand vector → the linear interpolated result.
 * @param b Operand vector.
 * @param t Interpolation coefficients vector.
 */
export function lerpV(a: Vec2, b: Vec2, t: Vec2) {
  a[0] = a[0] + t[0] * (b[0] - a[0]);
  a[1] = a[1] + t[1] * (b[1] - a[1]);
}

/**
 * Return max values of two vectors.
 * Given vectors a and b returns
 * [max(a[0], b[0]), max(a[1], b[1])].
 * @param a __mut__ Operand vector → The max components vector.
 * @param b Operand vector.
 */
export function max(a: Vec2, b: Vec2) {
  a[0] = Math.max(a[0], b[0]);
  a[1] = Math.max(a[1], b[1]);
}

/**
 * Return min values of two vectors.
 * Given vectors a and b returns
 * [min(a[0], b[0]), min(a[1], b[1]), min(a[2], b[2])].
 * @param a __mut__ Operand vector → The min components vector.
 * @param b Operand vector.
 */
export function min(a: Vec2, b: Vec2) {
  a[0] = Math.min(a[0], b[0]);
  a[1] = Math.min(a[1], b[1]);
}

/**
 * Multiplies a vector by a scalar.
 * @param v __mut__ The vector → The scaled vector.
 * @param k The scalar.
 */
export function mulScalar(v: Vec2, k: number) {
  v[0] *= k;
  v[1] *= k;
}

/**
 * Divides a vector by a scalar.
 * @param v __mut__ The vector → The scaled vector.
 * @param k The scalar.
 */
export function divScalar(v: Vec2, k: number) {
  v[0] /= k;
  v[1] /= k;
}

/**
 * Computes the cross product of two vectors; assumes both vectors have
 * three entries.
 * @param v __mut__ The vector → The vector of a cross b.
 * @param a Operand vector.
 * @param b Operand vector.
 */
export function cross(v: Vec3, a: Vec2, b: Vec2) {
  const t2 = a[0] * b[1] - a[1] * b[0];

  v[0] = 0;
  v[1] = 0;
  v[2] = t2;
}

/**
 * Computes the dot product of two vectors; assumes both vectors have
 * three entries.
 * @param a Operand vector.
 * @param b Operand vector.
 * @return dot product
 */
export function dot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Computes the length of vector
 * @param v vector.
 * @return length of vector.
 */
export function length(v: Vec2): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

/**
 * Computes the square of the length of vector
 * @param v vector.
 * @return square of the length of vector.
 */
export function lengthSq(v: Vec2): number {
  return v[0] * v[0] + v[1] * v[1];
}

/**
 * Computes the distance between 2 points
 * @param a vector.
 * @param b vector.
 * @return distance between a and b
 */
export function distance(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Computes the square of the distance between 2 points
 * @param a vector.
 * @param b vector.
 * @return square of the distance between a and b
 */
export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/**
 * Divides a vector by its Euclidean length and returns the quotient.
 * @param a __mut__ The vector → The normalized vector.
 */
export function normalize(a: Vec2) {
  const lenSq = a[0] * a[0] + a[1] * a[1];
  const len = Math.sqrt(lenSq);
  if (len > 0.00001) {
    a[0] = a[0] / len;
    a[1] = a[1] / len;
  } else {
    a[0] = 0;
    a[1] = 0;
  }
}

/**
 * Negates a vector.
 * @param v __mut__ The vector → -v.
 */
export function negate(v: Vec2) {
  v[0] = -v[0];
  v[1] = -v[1];
}

/**
 * Copies a vector.
 * @param a __mut__ The vector → A copy of `b`.
 * @param b Operand vector.
 */
export function copy(a: Vec2, b: Vec2) {
  a[0] = b[0];
  a[1] = b[1];
}

/**
 * Multiplies a vector by another vector (component-wise); assumes a and
 * b have the same length.
 * @param a __mut__ Operand vector → The vector of products of entries of `a` and `b`.
 * @param b Operand vector.
 */
export function multiply(a: Vec2, b: Vec2) {
  a[0] *= b[0];
  a[1] *= b[1];
}

/**
 * Divides a vector by another vector (component-wise); assumes a and
 * b have the same length.
 * @param a __mut__ Operand vector → The vector of quotients of entries of a and b.
 * @param b Operand vector.
 */
export function divide(a: Vec2, b: Vec2) {
  a[0] /= b[0];
  a[1] /= b[1];
}

export function fromAngle(v: Vec2, angle: number): void {
  v[0] = Math.cos(angle);
  v[1] = Math.sin(angle);
}

export function angleTo(vec1: Vec2, vec2: Vec2) {
  return Math.atan2(vec1[1] - vec2[1], vec1[0] - vec2[0]);
}
