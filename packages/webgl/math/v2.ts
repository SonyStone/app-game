import * as v3 from './v3';

/**
 *
 * Vec2 math math functions.
 *
 * Almost all functions take an optional `dst` argument. If it is not passed in the
 * functions will create a new Vec2. In other words you can do this
 *
 *     var v = v3.cross(v1, v2);  // Creates a new Vec2 with the cross product of v1 x v2.
 *
 * or
 *
 *     var v = v2.create();
 *     v3.cross(v1, v2, v);  // Puts the cross product of v1 x v2 in v
 *
 * The first style is often easier but depending on where it's used it generates garbage where
 * as there is almost never allocation with the second style.
 *
 * It is always save to pass any vector as the destination. So for example
 *
 *     v3.cross(v1, v2, v1);  // Puts the cross product of v1 x v2 in v1
 */
export let VecType = Float32Array;

/**
 * A JavaScript array with 3 values or a Float32Array with 3 values.
 * When created by the library will create the default type which is `Float32Array`
 * but can be set by calling {@link setDefaultType}.
 * @typedef {(number[]|Float32Array)} Vec2
 */
export type Vec2 = number[] | Float32Array;

/**
 * Sets the type this library creates for a Vec2
 * @param {constructor} ctor the constructor for the type. Either `Float32Array` or `Array`
 * @return {constructor} previous constructor for Vec2
 */
export function setDefaultType(ctor: typeof VecType) {
  const oldType = VecType;
  VecType = ctor;
  return oldType;
}

/**
 * Creates a Vec2; may be called with x, y, z to set initial values.
 * @param {number} [x] Initial x value.
 * @param {number} [y] Initial y value.
 * @return {Vec2} the created vector
 */
export const create = (x: number = 0, y: number = 0): Vec2 => {
  const dst = new VecType(2);

  dst[0] = x;
  dst[1] = y;

  return dst;
};

/** Creates a vector with all elements set to `v`. */
export const splat = (v: number): Vec2 => create(v, v);

/** All zeroes. */
export const ZERO: Readonly<Vec2> = splat(0);

/** All ones. */
export const ONE: Readonly<Vec2> = splat(1);

/** All negative ones. */
export const NEG_ONE: Readonly<Vec2> = splat(-1);

/** All `Number.MIN_VALUE`. */
export const MIN: Readonly<Vec2> = splat(Number.MIN_VALUE);

/** All `Number.MAX_VALUE` */
export const MAX: Readonly<Vec2> = splat(Number.MAX_VALUE);

/** All `NaN`. */
export const NAN: Readonly<Vec2> = splat(NaN);

/** All `Infinity`. */
export const INFINITY: Readonly<Vec2> = splat(Infinity);

/** All `-Infinity`. */
export const NEG_INFINITY: Readonly<Vec2> = splat(-Infinity);

/** A unit vector pointing along the positive X axis. */
export const X: Readonly<Vec2> = create(1, 0);

/** →  */
export const RIGHT: Readonly<Vec2> = X;

/** A unit vector pointing along the positive Y axis. */
export const Y: Readonly<Vec2> = create(0, 1);

/** ↑ */
export const UP: Readonly<Vec2> = Y;

/** A unit vector pointing along the negative X axis. */
export const NEG_X: Readonly<Vec2> = create(-1, 0);

/** ← */
export const LEFT: Readonly<Vec2> = NEG_X;

/** A unit vector pointing along the negative Y axis. */
export const NEG_Y: Readonly<Vec2> = create(0, -1);

/** ↓ */
export const DOWN: Readonly<Vec2> = NEG_Y;

export const extend = (v: Readonly<Vec2>, z: number): v3.Vec3 => {
  return v3.create(v[0], v[1], z);
};

/**
 * Creates a Vec2; may be called with x, y, z to set initial values.
 * @param v the created vector.
 * @param x set x value.
 * @param y set y value.
 */
export const set = (v: Vec2 = new VecType(2), x: number = 0, y: number = 0) => {
  v[0] = x;
  v[1] = y;
};

/**
 * Adds two vectors; assumes a and b have the same dimension.
 * @param a Operand vector → A vector tha tis the sum of a and b.
 * @param b Operand vector.
 */
export const add = (a: Vec2, b: Readonly<Vec2>) => {
  a[0] += b[0];
  a[1] += b[1];

  return a;
};

/**
 * Subtracts two vectors.
 * @param a Operand vector → A vector that is the difference of a and b.
 * @param b Operand vector.
 */
export const subtract = (a: Vec2, b: Readonly<Vec2>): Vec2 => {
  a[0] -= b[0];
  a[1] -= b[1];
  return a;
};

/**
 * Performs linear interpolation on two vectors.
 * Given vectors a and b and interpolation coefficient t, returns
 * a + t * (b - a).
 * @param self __mut__ Operand vector → The linear interpolated result.
 * @param rhs Operand vector.
 * @param s Interpolation coefficient.
 */
export const lerp = (self: Vec2, rhs: Readonly<Vec2>, s: number): Vec2 => {
  self[0] = self[0] + s * (rhs[0] - self[0]);
  self[1] = self[1] + s * (rhs[1] - self[1]);
  return self;
};

/**
 * Performs linear interpolation on two vectors.
 * Given vectors a and b and interpolation coefficient vector t, returns
 * a + t * (b - a).
 * @param self __mut__ Operand vector → the linear interpolated result.
 * @param rhs Operand vector.
 * @param s Interpolation coefficients vector.
 */
export const lerpV = (self: Vec2, rhs: Readonly<Vec2>, s: Readonly<Vec2>) => {
  self[0] = self[0] + s[0] * (rhs[0] - self[0]);
  self[1] = self[1] + s[1] * (rhs[1] - self[1]);
  return self;
};

/**
 * Return max values of two vectors.
 * Given vectors a and b returns
 * [max(a[0], b[0]), max(a[1], b[1])].
 * @param a __mut__ Operand vector → The max components vector.
 * @param b Operand vector.
 */
export const max = (self: Readonly<Vec2>, rhs: Readonly<Vec2>): Vec2 => {
  const x = Math.max(self[0], rhs[0]);
  const y = Math.max(self[1], rhs[1]);
  return create(x, y);
};

/**
 * Return min values of two vectors.
 * Given vectors a and b returns
 * [min(a[0], b[0]), min(a[1], b[1]), min(a[2], b[2])].
 * @param a __mut__ Operand vector → The min components vector.
 * @param b Operand vector.
 */
export const min = (self: Readonly<Vec2>, rhs: Readonly<Vec2>): Vec2 => {
  const x = Math.min(self[0], rhs[0]);
  const y = Math.min(self[1], rhs[1]);
  return create(x, y);
};

/**
 * Multiplies a vector by a scalar.
 * @param self __mut__ The vector → The scaled vector.
 * @param rhs The scalar.
 */
export const mulScalar = (self: Vec2, rhs: number): Vec2 => {
  self[0] *= rhs;
  self[1] *= rhs;
  return self;
};

/**
 * Divides a vector by a scalar.
 * @param self __mut__ The vector → The scaled vector.
 * @param rhs The scalar.
 */
export const divScalar = (self: Vec2, rhs: number): Vec2 => {
  self[0] /= rhs;
  self[1] /= rhs;
  return self;
};

/**
 * Computes the cross product of two vectors; assumes both vectors have
 * three entries.
 * @param self __mut__ The vector → The vector of a cross b.
 * @param a Operand vector.
 * @param b Operand vector.
 */
export const cross = (self: v3.Vec3, a: Readonly<Vec2>, b: Readonly<Vec2>): v3.Vec3 => {
  const t2 = a[0] * b[1] - a[1] * b[0];

  self[0] = 0;
  self[1] = 0;
  self[2] = t2;

  return self;
};

/**
 * Computes the dot product of two vectors; assumes both vectors have
 * three entries.
 * @param self Operand vector.
 * @param rhs Operand vector.
 * @return dot product
 */
export const dot = (self: Readonly<Vec2>, rhs: Readonly<Vec2>): number => {
  return self[0] * rhs[0] + self[1] * rhs[1] + self[2] * rhs[2];
};

/**
 * Computes the length of vector
 * @param self vector.
 * @return length of vector.
 */
export const length = (self: Readonly<Vec2>): number => {
  return Math.sqrt(self[0] * self[0] + self[1] * self[1]);
};

/**
 * Computes the square of the length of vector
 * @param self vector.
 * @return square of the length of vector.
 */
export const lengthSquared = (self: Readonly<Vec2>): number => {
  return self[0] * self[0] + self[1] * self[1];
};

/**
 * Computes the distance between 2 points
 * @param self vector.
 * @param rhs vector.
 * @return distance between a and b
 */
export const distance = (self: Readonly<Vec2>, rhs: Readonly<Vec2>): number => {
  const dx = self[0] - rhs[0];
  const dy = self[1] - rhs[1];
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Computes the square of the distance between 2 points
 * @param self vector.
 * @param rhs vector.
 * @return square of the distance between a and b
 */
export const distanceSquared = (self: Readonly<Vec2>, rhs: Readonly<Vec2>): number => {
  const dx = self[0] - rhs[0];
  const dy = self[1] - rhs[1];
  return dx * dx + dy * dy;
};

/**
 * Divides a vector by its Euclidean length and returns the quotient.
 * @param self __mut__ The vector → The normalized vector.
 */
export const normalize = (self: Vec2): Vec2 => {
  const lenSq = self[0] * self[0] + self[1] * self[1];
  const len = Math.sqrt(lenSq);
  if (len > 0.00001) {
    self[0] = self[0] / len;
    self[1] = self[1] / len;
  } else {
    self[0] = 0;
    self[1] = 0;
  }

  return self;
};

/**
 * Negates a vector.
 * @param self __mut__ The vector → -v.
 */
export const negate = (self: Vec2): Vec2 => {
  self[0] = -self[0];
  self[1] = -self[1];
  return self;
};

/**
 * Copies a vector.
 * @param self __mut__ The vector → A copy of `b`.
 * @param rhs Operand vector.
 */
export const copy = (self: Vec2, rhs: Readonly<Vec2>): Vec2 => {
  self[0] = rhs[0];
  self[1] = rhs[1];
  return self;
};

/**
 * Multiplies a vector by another vector (component-wise); assumes a and
 * b have the same length.
 * @param self __mut__ Operand vector → The vector of products of entries of `a` and `b`.
 * @param rhs Operand vector.
 */
export const multiply = (self: Vec2, rhs: Readonly<Vec2>): Vec2 => {
  self[0] *= rhs[0];
  self[1] *= rhs[1];
  return self;
};

/**
 * Divides a vector by another vector (component-wise); assumes a and
 * b have the same length.
 * @param self __mut__ Operand vector → The vector of quotients of entries of a and b.
 * @param rhs Operand vector.
 */
export const divide = (self: Vec2, rhs: Readonly<Vec2>): Vec2 => {
  self[0] /= rhs[0];
  self[1] /= rhs[1];
  return self;
};

export const fromAngle = (angle: number): Vec2 => {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  return create(x, y);
};

export const angleTo = (vec1: Readonly<Vec2>, vec2: Readonly<Vec2>): number => {
  return Math.atan2(vec1[1] - vec2[1], vec1[0] - vec2[0]);
};
