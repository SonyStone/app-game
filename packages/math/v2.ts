import { Radians } from './types';
import { NumberArray } from './utils/typed-array';
import * as v2 from './v2-functions';

export type Vec2Tuple = [x: number, y: number] | NumberArray;

/**
 * First of all, this class is intended as a wrapper for working with
 * `ArrayBuffers`, `TypedArrays` and `WebGL`, `WebGPU`
 */
export class Vec2<T extends NumberArray = NumberArray> {
  static ELEMENTS = 2;

  constructor(public value: T = new Float32Array(2) as unknown as T) {}

  get x(): number {
    return v2.getX(this.value);
  }

  get y(): number {
    return v2.getY(this.value);
  }

  static create(x: number = 0, y: number = x): Vec2<Float32Array> {
    return new Vec2().set(x, y) as Vec2<Float32Array>;
  }

  static crossProduct(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
    return a.value[0] * b.value[1] - a.value[1] * b.value[0];
  }

  static dotProduct(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
    return a.value[0] * b.value[0] + a.value[1] * b.value[1];
  }

  static angle(a: Readonly<Vec2>, b: Readonly<Vec2>): Radians {
    return Math.atan2(Vec2.crossProduct(a, b), Vec2.dotProduct(a, b)) as Radians;
  }

  /**
   * Copies the values from another vector to this vector.
   * @param rhs The vector to copy from.
   */
  copy(rhs: Readonly<Vec2>): this {
    v2.copy(this.value, rhs.value);
    return this;
  }

  /**
   * Sets the values of the vector.
   * @param x The x value to set (default: 0).
   * @param y The y value to set (default: 0).
   * @param z The z value to set (default: 0).
   */
  set(x: number = 0, y: number = x): this {
    v2.set(this.value, x, y);
    return this;
  }

  /**
   * Adds another vector to this vector.
   * @param vec The vector to add.
   */
  add(vec: Readonly<Vec2>): this {
    v2.add(this.value, this.value, vec.value);
    return this;
  }

  /**
   * Add to this vector a scalar value.
   * @param rhs The scalar value to add.
   */
  addScalar(rhs: number) {
    v2.addScalar(this.value, rhs);
    return this;
  }

  /**
   * Adds two vectors.
   * @param vec The vector to add.
   */
  addFrom(a: Readonly<Vec2>, b: Readonly<Vec2>): this {
    v2.add(this.value, a.value, b.value);
    return this;
  }

  /**
   * Subtracts another vector from this vector.
   * @param rhs The vector to subtract.
   */
  sub(rhs: Readonly<Vec2>): this {
    v2.sub(this.value, this.value, rhs.value);
    return this;
  }

  /**
   * Subtracts of two vectors.
   */
  subFrom(a: Readonly<Vec2>, b: Readonly<Vec2>): this {
    v2.sub(this.value, a.value, b.value);
    return this;
  }

  /**
   * Multiplies this vector component-wise with another vector.
   * @param vec The vector to multiply with.
   */
  mul(rhs: Readonly<Vec2>): this {
    v2.mul(this.value, this.value, rhs.value);
    return this;
  }

  /**
   * Multiplies this vector by a scalar value.
   * @param rhs The scalar value to multiply by.
   */
  mulScalar(rhs: number) {
    v2.mulScalar(this.value, rhs);
    return this;
  }

  /**
   * Divides this vector component-wise by another vector.
   * @param vec The vector to divide by.
   * @param dst The destination vector to store the result (default: new VecType(3)).
   */
  div(rhs: Readonly<Vec2>) {
    v2.div(this.value, this.value, rhs.value);
    return this;
  }

  /**
   * Divides this vector by a scalar value.
   * @param rhs The scalar value to divide by.
   */
  divScalar(rhs: number): this {
    v2.divScalar(this.value, rhs);
    return this;
  }

  /**
   * Performs linear interpolation between this vector and another vector.
   * @param vec The vector to interpolate with.
   * @param t The interpolation coefficient.
   */
  lerp(rhs: Readonly<Vec2>, t: number): this {
    v2.lerp(this.value, rhs.value, t);
    return this;
  }

  /**
   * Performs linear interpolation between this vector and another vector using vector coefficients.
   * @param vec The vector to interpolate with.
   * @param t The vector of interpolation coefficients.
   */
  lerpV(rhs: Readonly<Vec2>, t: Readonly<Vec2>): this {
    v2.lerpV(this.value, rhs.value, t.value);
    return this;
  }

  /**
   * Returns a new vector where each component is the maximum value between the corresponding components of this vector and the given vector.
   * @param vec The vector to compare with.
   */
  max(a: Readonly<Vec2>, b: Readonly<Vec2>): this {
    v2.max(this.value, a.value, b.value);
    return this;
  }

  /**
   * Returns a new vector where each component is the minimum value between the corresponding components of this vector and the given vector.
   * @param vec The vector to compare with.
   */
  min(a: Readonly<Vec2>, b: Readonly<Vec2>): this {
    v2.min(this.value, a.value, b.value);
    return this;
  }

  /**
   * Calculates the dot product of this vector and another vector.
   * @param vec The vector to calculate the dot product with.
   * @returns The dot product value.
   */
  dot(rhs: Readonly<Vec2>): number {
    return v2.dot(this.value, rhs.value);
  }

  /**
   * Calculates the length (magnitude) of this vector.
   * @returns The length of the vector.
   */
  len(): number {
    return v2.len(this.value);
  }

  /**
   * Calculates the squared length (magnitude) of this vector.
   * @returns The squared length of the vector.
   */
  lenSq(): number {
    return v2.lenSq(this.value);
  }

  static distance(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
    return v2.distance(a.value, b.value);
  }

  /**
   * Calculates the distance between this vector and another vector.
   * @param vec The vector to calculate the distance to.
   * @returns The distance between the vectors.
   */
  distance(rhs: Readonly<Vec2>): number {
    return v2.distance(this.value, rhs.value);
  }

  static distanceSq(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
    return v2.distanceSq(a.value, b.value);
  }

  /**
   * Calculates the squared distance between this vector and another vector.
   * @param vec The vector to calculate the squared distance to.
   * @returns The squared distance between the vectors.
   */
  distanceSq(rhs: Readonly<Vec2>): number {
    return v2.distanceSq(this.value, rhs.value);
  }

  /**
   * Normalizes this vector (scales it to have a length of 1).
   */
  normalize(): this {
    v2.normalize(this.value);
    return this;
  }

  /**
   * Negates this vector (flips the sign of each component).
   */
  negate(): this {
    v2.negate(this.value);
    return this;
  }

  /**
   * Inverts this vector (1/x, 1/y, 1/z).
   * @param v The vector to invert.
   */
  inverse(): this {
    v2.inverse(this.value, this.value);
    return this;
  }

  /**
   * Checks if this vector is equal to another vector.
   * @param vec The vector to compare with.
   * @returns True if the vectors are equal, false otherwise.
   */
  isEqual(vec: Readonly<Vec2>): boolean {
    return v2.isEqual(this.value, vec.value);
  }

  isEqualApprox(vec: Readonly<Vec2>, epsilon: number = 1e-5): boolean {
    return v2.isEqualApprox(this.value, vec.value, epsilon);
  }

  /** When values are very small, like less then 0.000001, just make it zero. */
  zeroApprox() {
    v2.zeroApprox(this.value);
    return this;
  }

  /**
   * Returns the angle between this vector and another vector.
   * @param vec The vector to calculate the angle to.
   * @returns The angle between the vectors in radians.
   */
  angle(vec: Readonly<Vec2>): number {
    return v2.angle(this.value, vec.value);
  }

  /**
   * Returns the angle of a vector in radians.
   */
  toAngle(): Radians {
    return v2.toAngle(this.value);
  }

  fromAngle(angle: number): this {
    v2.fromAngle(this.value, angle);
    return this;
  }

  fromAngleLen(ang: number, len: number): this {
    v2.fromAngleLen(this.value, ang, len);
    return this;
  }

  angleTo(vec: Vec2): number {
    return v2.angleTo(this.value, vec.value);
  }

  static angleTo(a: Vec2, b: Vec2): number {
    return v2.angleTo(a.value, b.value);
  }

  perpendicular(): this {
    v2.perpendicular(this.value, this.value);
    return this;
  }

  rotate(rad: Radians) {
    v2.rotate(this.value, this.value, this.value, rad);
    return this;
  }

  fromArray(a: NumberArray, offset: number = 0): this {
    this.value[0] = a[offset];
    this.value[1] = a[offset + 1];
    return this;
  }

  toString(): string {
    return `${this.value[0]}, ${this.value[1]}`;
  }

  toPath(): string {
    return `${this.value[0]} ${this.value[1]}`;
  }
}

export const VEC2_FLOAT32_BYTES = Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS;
export const VEC2_FLOAT64_BYTES = Float64Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS;

export const VEC2_INT8_BYTES = Int8Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS;
export const VEC2_INT16_BYTES = Int16Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS;
export const VEC2_INT32_BYTES = Int32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS;
export const VEC2_BIG_INT64_BYTES = BigInt64Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS;

export const VEC2_UINT8_BYTES = Uint8Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS;
export const VEC2_UINT16_BYTES = Uint16Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS;
export const VEC2_UINT32_BYTES = Uint32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS;
export const VEC2_BIG_UINT64_BYTES = BigUint64Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS;
