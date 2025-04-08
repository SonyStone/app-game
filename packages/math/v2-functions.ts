import { Radians } from './types';
import * as Utils from './utils/round';
import { NumberArray } from './utils/typed-array';

export const X = 0;
export const Y = 1;
const Z = 2;

export const INT_MIN_VALUE = -2147483648;
export const INT_MAX_VALUE = 2147483647;

export const UINT_MIN_VALUE = 0;
export const UINT_MAX_VALUE = 4294967295;

/**
 * Sets the values of the vector.
 * @param x The x value to set (default: 0).
 * @param y The y value to set (default: 0).
 */
export function set(out: NumberArray, x: number = 0, y: number = 0): void {
  out[X] = x;
  out[Y] = y;
}

/**
 * Copies the values from another vector to this vector.
 * @param v The vector to copy from.
 */
export function copy(out: NumberArray, v: NumberArray): void {
  out[X] = v[X];
  out[Y] = v[Y];
}

/**
 * Adds two vectors
 */
export function add(out: NumberArray, a: Readonly<NumberArray>, b: Readonly<NumberArray>): void {
  out[X] = a[X] + b[X];
  out[Y] = a[Y] + b[Y];
}

/**
 * Adds two vectors
 */
export function addScalar(out: NumberArray, rhs: number): void {
  out[X] += rhs;
  out[Y] += rhs;
}

/**
 * Subtracts another vector from this vector.
 * @param v The vector to subtract.
 */
export function sub(out: NumberArray, a: Readonly<NumberArray>, b: Readonly<NumberArray>): void {
  out[X] = a[X] - b[X];
  out[Y] = a[Y] - b[Y];
}

/**
 * Multiplies this vector component-wise with another vector.
 * @param vec The vector to multiply with.
 */
export function mul(out: NumberArray, a: Readonly<NumberArray>, b: Readonly<NumberArray>): void {
  out[X] = a[X] * b[X];
  out[Y] = a[Y] * b[Y];
}

/**
 * Multiplies this vector by a scalar value.
 * @param rhs The scalar value to multiply by.
 */
export function mulScalar(out: NumberArray, rhs: number): void {
  out[X] *= rhs;
  out[Y] *= rhs;
}

/**
 * Divides this vector component-wise by another vector.
 * @param vec The vector to divide by.
 * @param dst The destination vector to store the result (default: new VecType(3)).
 */
export function div(out: NumberArray, a: Readonly<NumberArray>, b: Readonly<NumberArray>): void {
  out[X] = a[X] / b[X];
  out[Y] = a[Y] / b[Y];
}

/**
 * Divides this vector by a scalar value.
 * @param rhs The scalar value to divide by.
 */
export function divScalar(out: NumberArray, rhs: number): void {
  out[X] /= rhs;
  out[Y] /= rhs;
}

/**
 * Math.ceil the components of a vec2
 *
 * @param out the receiving vector
 * @param  a vector to ceil
 */
export function ceil(out: NumberArray, a: Readonly<NumberArray>): void {
  out[X] = Math.ceil(a[X]);
  out[Y] = Math.ceil(a[Y]);
}

/**
 * Math.floor the components of a vec2
 *
 * the receiving vector
 * a vector to floor
 */
export function floor(out: NumberArray, a: Readonly<NumberArray>) {
  out[X] = Math.floor(a[X]);
  out[Y] = Math.floor(a[Y]);
  return out;
}

/**
 * Returns a new vector where each component is the minimum value between the corresponding components of this vector and the given vector.
 * @param vec The vector to compare with.
 */
export function min(out: NumberArray, a: Readonly<NumberArray>, b: Readonly<NumberArray>): void {
  out[X] = Math.min(a[X], b[X]);
  out[Y] = Math.min(a[Y], b[Y]);
}

/**
 * Returns a new vector where each component is the maximum value between the corresponding components of this vector and the given vector.
 * @param vec The vector to compare with.
 */
export function max(out: NumberArray, a: Readonly<NumberArray>, b: Readonly<NumberArray>): void {
  out[X] = Math.max(a[X], b[X]);
  out[Y] = Math.max(a[Y], b[Y]);
}

/**
 * symmetric round the components of a vec2
 *
 * @param out the receiving vector
 * @param a vector to round
 */
export function round(out: NumberArray, a: Readonly<NumberArray>): void {
  out[0] = Utils.round(a[0]);
  out[1] = Utils.round(a[1]);
}

/**
 * Calculates the dot product of this vector and another vector.
 * @param vec The vector to calculate the dot product with.
 * @returns The dot product value.
 */
export function dot(a: Readonly<NumberArray>, b: Readonly<NumberArray>): number {
  return a[X] * b[X] + a[Y] * b[Y];
}

/**
 * Computes the cross product of two vec2's
 * Note that the cross product must by definition produce a 3D vector
 *
 * @param out the receiving vector 3
 * @param a the first operand
 * @param b the second operand
 */
export function cross(out: NumberArray, a: Readonly<NumberArray>, b: Readonly<NumberArray>) {
  const z = a[X] * b[Y] - a[Y] * b[X];
  out[X] = out[Y] = 0;
  out[Z] = z;
}

/**
 * Performs linear interpolation between this vector and another vector.
 *
 * @param vec The vector to interpolate with.
 * @param t The interpolation coefficient.
 */
export function lerp(out: NumberArray, rhs: Readonly<NumberArray>, t: number): void {
  out[X] = out[X] + t * (rhs[X] - out[X]);
  out[Y] = out[Y] + t * (rhs[Y] - out[Y]);
}

/**
 * Performs linear interpolation between this vector and another vector using vector coefficients.
 *
 * @param vec The vector to interpolate with.
 * @param t The vector of interpolation coefficients.
 */
export function lerpV(out: NumberArray, rhs: Readonly<NumberArray>, t: Readonly<NumberArray>): void {
  out[X] = out[X] + t[X] * (rhs[X] - out[X]);
  out[Y] = out[Y] + t[Y] * (rhs[Y] - out[Y]);
}

/**
 * Calculates the distance between this vector and another vector.
 *
 * @param a the first operand
 * @param b the second operand
 * @returns distance between a and b
 */
export function distance(a: Readonly<NumberArray>, b: Readonly<NumberArray>): number {
  const dx = a[X] - b[X];
  const dy = a[Y] - b[Y];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates the squared distance between this vector and another vector.
 *
 * @param a the first operand
 * @param b the second operand
 * @returns squared distance between a and b
 */
export function distanceSq(a: Readonly<NumberArray>, b: Readonly<NumberArray>): number {
  const dx = a[X] - b[X];
  const dy = a[Y] - b[Y];
  return dx * dx + dy * dy;
}

/**
 * Calculates the length (magnitude) of this vector.
 *
 * @returns The length of the vector.
 */
export function len(out: Readonly<NumberArray>): number {
  return Math.sqrt(lenSq(out));
}

/**
 * Calculates the squared length (magnitude) of this vector.
 *
 * @returns The squared length of the vector.
 */
export function lenSq(out: Readonly<NumberArray>): number {
  return out[X] * out[X] + out[Y] * out[Y];
}

/**
 * Normalizes this vector (scales it to have a length of 1).
 */
export function normalize(out: NumberArray): void {
  const lenSq = out[X] * out[X] + out[Y] * out[Y];
  const len = Math.sqrt(lenSq);
  if (len > 0.00001) {
    out[X] = out[X] / len;
    out[Y] = out[Y] / len;
  } else {
    out[X] = 0;
    out[Y] = 0;
  }
}

/**
 * Negates this vector (flips the sign of each component).
 */
export function negate(out: NumberArray): void {
  out[X] = -out[X];
  out[Y] = -out[Y];
}

/**
 * Inverts this vector (1/x, 1/y, 1/z).
 * @param v The vector to invert.
 */
export function inverse(out: NumberArray, v: Readonly<NumberArray>): void {
  out[X] = 1.0 / v[X];
  out[Y] = 1.0 / v[Y];
}

/**
 * Generates a random vector with the given scale
 *
 * @param {vec2} out the receiving vector
 * @param {Number} [scale] Length of the resulting vector. If omitted, a unit vector will be returned
 * @returns {vec2} out
 */
export function random(out: NumberArray, scale: number = 1): void {
  const r = Math.random() * 2.0 * Math.PI;
  out[X] = Math.cos(r) * scale;
  out[Y] = Math.sin(r) * scale;
}

/**
 * Returns whether or not the vectors exactly have the same elements in the same position (when compared with ===)
 *
 * @param a The first vector.
 * @param b The second vector.
 * @returns True if the vectors are equal, false otherwise.
 */
export function isEquals(a: Readonly<NumberArray>, b: Readonly<NumberArray>): boolean {
  return a[X] === b[X] && a[Y] === b[Y];
}

/**
 * Returns whether or not the vectors have approximately the same elements in the same position.
 *
 * @param a The first vector.
 * @param b The second vector.
 * @returns True if the vectors are equal, false otherwise.
 */
export function isEqualApprox(a: Readonly<NumberArray>, b: Readonly<NumberArray>, epsilon = 0.00001): boolean {
  return Math.abs(a[X] - b[X]) < epsilon && Math.abs(a[Y] - b[Y]) < epsilon;
}

/**
 * Checks if a vector is zero (all components are 0).
 */
export const isZero = (v: Readonly<NumberArray>): boolean => {
  return v[X] === 0 && v[Y] === 0;
};

/** When values are very small, like less then 0.000001, just make it zero. */
export function zeroApprox(out: NumberArray, epsilon = 1e-6): void {
  if (Math.abs(out[X]) <= epsilon) {
    out[X] = 0;
  }
  if (Math.abs(out[Y]) <= epsilon) {
    out[Y] = 0;
  }
}

/**
 * Get the angle between two 2D vectors
 *
 * @param a The first operand
 * @param b The second operand
 * @returns The angle in radians
 */
export function angle(a: Readonly<NumberArray>, b: Readonly<NumberArray>): number {
  const x1 = a[X];
  const y1 = a[Y];
  const x2 = b[X];
  const y2 = b[Y];
  // mag is the product of the magnitudes of a and b
  const mag = Math.sqrt((x1 * x1 + y1 * y1) * (x2 * x2 + y2 * y2));
  // mag &&.. short circuits if mag == 0
  const cosine = mag && (x1 * x2 + y1 * y2) / mag;
  // Math.min(Math.max(cosine, -1), 1) clamps the cosine between -1 and 1
  return Math.acos(Math.min(Math.max(cosine, -1), 1));
}

export function fromAngle(out: NumberArray, angle: number): void {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  return set(out, x, y);
}

export function fromAngleLen(out: NumberArray, ang: number, len: number): void {
  const x = len * Math.cos(ang);
  const y = len * Math.sin(ang);
  return set(out, x, y);
}

export function angleTo(out: NumberArray, vec: NumberArray): number {
  return Math.atan2(out[1] - vec[1], out[0] - vec[0]);
}

/**
 * Rotate a 2D vector
 *
 * @param out The receiving vec2
 * @param a The vec2 point to rotate
 * @param b The origin of the rotation
 * @param rad The angle of rotation in radians
 */
export function rotate(out: NumberArray, a: Readonly<NumberArray>, b: Readonly<NumberArray>, rad: Radians): void {
  const p0 = a[X] - b[X];
  const p1 = a[Y] - b[Y];
  const sinC = Math.sin(rad);
  const cos = Math.cos(rad);

  //perform rotation and translate to correct position
  out[X] = p0 * cos - p1 * sinC + b[X];
  out[Y] = p0 * sinC + p1 * cos + b[Y];
}

/**
 * Reflects a vector across a normal.
 */
export function reflect(out: NumberArray, v: Readonly<NumberArray>, normal: Readonly<NumberArray>): void {
  const dotProduct = 2 * dot(v, normal);
  out[X] = v[X] - dotProduct * normal[X];
  out[Y] = v[Y] - dotProduct * normal[Y];
}

/**
 * Returns a vector perpendicular to the input (rotated 90 degrees counterclockwise).
 */
export function perpendicular(out: NumberArray, v: Readonly<NumberArray>): void {
  out[X] = -v[Y];
  out[Y] = v[X];
}

/**
 * Returns the angle of a vector in radians.
 */
export const toAngle = (v: Readonly<NumberArray>): Radians => {
  return Math.atan2(v[Y], v[X]) as Radians;
};

// --

export function splat(out: NumberArray, v: number): void {
  return set(out, v, v);
}

/** All zeroes. */
export function zero(out: NumberArray): void {
  out[X] = 0;
  out[Y] = 0;
}

/**
 * Converts a vector to a string.
 */
export function toString(v: Readonly<NumberArray>): string {
  return `${v[X]}, ${v[Y]}`;
}

/** All ones. */
export function one(out: NumberArray): void {
  out[X] = 1;
  out[Y] = 1;
}

/** All negative ones. */
export function negOne(out: NumberArray): void {
  splat(out, -1);
  out[X] = -1;
  out[Y] = -1;
}

/** All `NaN`. */
export function nan(out: NumberArray): void {
  out[X] = NaN;
  out[Y] = NaN;
}

/** All `Infinity`. */
export function infinity(out: NumberArray): void {
  out[X] = Infinity;
  out[Y] = Infinity;
}

/** All `-Infinity`. */
export function negInfinity(out: NumberArray): void {
  out[X] = -Infinity;
  out[Y] = -Infinity;
}

/** ← */
export function left(out: NumberArray): void {
  out[X] = -1;
  out[Y] = 0;
}

/** →  */
export function right(out: NumberArray): void {
  out[X] = 1;
  out[Y] = 0;
}

/** ↑ */
export function up(out: NumberArray): void {
  out[X] = 0;
  out[Y] = 1;
}

/** ↓ */
export function down(out: NumberArray): void {
  out[X] = 0;
  out[Y] = -1;
}

/** A unit vector pointing along the positive X axis. */
export function x(out: NumberArray): void {
  out[X] = 1;
  out[Y] = 0;
}

/** A unit vector pointing along the positive Y axis. */
export function y(out: NumberArray): void {
  out[X] = 0;
  out[Y] = 1;
}

/** A unit vector pointing along the negative X axis. */
export function negX(out: NumberArray): void {
  out[X] = -1;
  out[Y] = 0;
}

/** A unit vector pointing along the negative Y axis. */
export function negY(out: NumberArray): void {
  out[X] = 0;
  out[Y] = -1;
}

/**
 * Gets the x component of the vector.
 */
export function getX(out: NumberArray): number {
  return out[X];
}

/**
 * Sets the x component of the vector.
 */
export function setX(out: NumberArray, v: number) {
  out[X] = v;
}

/**
 * Gets the y component of the vector.
 */
export function getY(out: NumberArray) {
  return out[Y];
}
/**
 * Sets the y component of the vector.
 */
export function setY(out: NumberArray, v: number) {
  out[Y] = v;
}
