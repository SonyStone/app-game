import type { TypedArray, TypedArrayConstructor } from './utils/typed-array';
import { Vec2Tuple } from './v2-builder';

/**
 * A JavaScript array with 3 values or a Float32Array with 3 values.
 * When created by the library will create the default type which is `Float32Array`
 * but can be set by calling {@link Vec3Builder}.
 */
export type Vec3Tuple = [x: number, y: number, z: number] | TypedArray;

/**
 * Creates a vector builder function that generates a Vec3 class based on the provided constructor.
 * @param ctor The constructor for the underlying array type.
 * @returns The Vec3 class.
 *
 * @example
 * ```ts
 * const Vec3 = Vec3Builder(Float32Array);
 * ```
 */
export const Vec3Builder = (ctor: TypedArrayConstructor) =>
  class Vec3 extends (ctor as ArrayConstructor) {
    constructor() {
      super(3);
    }

    /**
     * Creates a new Vec3 instance with the specified initial values.
     * @param x The initial x value (default: 0).
     * @param y The initial y value (default: 0).
     * @param z The initial z value (default: 0).
     * @returns The new Vec3 instance.
     */
    static create(x: number = 0, y: number = 0, z: number = 0): Vec3 {
      const v = new Vec3();
      v[0] = x;
      v[1] = y;
      v[2] = z;

      return v;
    }

    static angle = angle(Vec3);

    static splat = (v: number): Vec3 => Vec3.create(v, v, v);

    /** All zeroes. */
    static readonly ZERO = Vec3.splat(0);

    /** All ones. */
    static readonly ONE = Vec3.splat(1);

    /** A unit vector pointing along the positive X axis. */
    static readonly X = Vec3.create(1, 0, 0);

    /** A unit vector pointing along the positive Y axis. */
    static readonly Y = Vec3.create(0, 1, 0);

    /** A unit vector pointing along the positive Z axis. */
    static readonly Z = Vec3.create(0, 0, 1);

    /**
     * Gets the x component of the vector.
     */
    get x() {
      return this[0];
    }
    /**
     * Sets the x component of the vector.
     */
    set x(v: number) {
      this[0] = v;
    }

    /**
     * Gets the y component of the vector.
     */
    get y() {
      return this[1];
    }
    /**
     * Sets the y component of the vector.
     */
    set y(v: number) {
      this[1] = v;
    }

    /**
     * Gets the z component of the vector.
     */
    get z() {
      return this[2];
    }
    /**
     * Sets the z component of the vector.
     */
    set z(v: number) {
      this[2] = v;
    }

    /**
     * Creates a new Vec3 instance with the same values as this vector.
     * @returns The new Vec3 instance.
     */
    clone() {
      return Vec3.create(this[0], this[1], this[2]);
    }

    /**
     * Sets the values of the vector.
     * @param x The x value to set (default: 0).
     * @param y The y value to set (default: 0).
     * @param z The z value to set (default: 0).
     */
    set(x: number = 0, y: number = 0, z: number = 0): this {
      this[0] = x;
      this[1] = y;
      this[2] = z;
      return this;
    }

    /**
     * Copies the values from another vector to this vector.
     * @param vec The vector to copy from.
     */
    copy(vec: Vec3Tuple) {
      this[0] = vec[0];
      this[1] = vec[1];
      this[2] = vec[2];
      return this;
    }

    /**
     * Adds another vector to this vector.
     * @param vec The vector to add.
     */
    add(vec: Vec3Tuple): this {
      this[0] += vec[0];
      this[1] += vec[1];
      this[2] += vec[2];
      return this;
    }

    static sub(a: Vec3Tuple, b: Vec3Tuple): Vec3 {
      return this.create(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }

    /**
     * Subtracts another vector from this vector.
     * @param vec The vector to subtract.
     */
    sub(vec: Vec3Tuple): this {
      this[0] -= vec[0];
      this[1] -= vec[1];
      this[2] -= vec[2];
      return this;
    }

    /**
     * Subtracts another vector from this vector.
     * @param vec The vector to subtract.
     */
    subFrom(a: Vec3Tuple, b: Vec3Tuple): this {
      this[0] = a[0] - b[0];
      this[1] = a[1] - b[1];
      this[2] = a[2] - b[2];
      return this;
    }

    /**
     * Multiplies this vector component-wise with another vector.
     * @param vec The vector to multiply with.
     
     */
    multiply(vec: Vec3Tuple) {
      this[0] *= vec[0];
      this[1] *= vec[1];
      this[2] *= vec[2];
      return vec;
    }

    /**
     * Divides this vector component-wise by another vector.
     * @param vec The vector to divide by.
     * @param dst The destination vector to store the result (default: new VecType(3)).
     
     */
    divide(vec: Vec3Tuple) {
      this[0] /= vec[0];
      this[1] /= vec[1];
      this[2] /= vec[2];
      return this;
    }

    /**
     * Performs linear interpolation between this vector and another vector.
     * @param vec The vector to interpolate with.
     * @param t The interpolation coefficient.
     */
    lerp(vec: Vec3Tuple, t: number): this {
      this[0] = this[0] + t * (vec[0] - this[0]);
      this[1] = this[1] + t * (vec[1] - this[1]);
      this[2] = this[2] + t * (vec[2] - this[2]);
      return this;
    }

    /**
     * Performs linear interpolation between this vector and another vector using vector coefficients.
     * @param vec The vector to interpolate with.
     * @param t The vector of interpolation coefficients.
     */
    lerpV(vec: Vec3Tuple): this {
      this[0] = this[0] + vec[0] * (vec[0] - this[0]);
      this[1] = this[1] + vec[1] * (vec[1] - this[1]);
      this[2] = this[2] + vec[2] * (vec[2] - this[2]);
      return this;
    }

    /**
     * Returns a new vector where each component is the maximum value between the corresponding components of this vector and the given vector.
     * @param vec The vector to compare with.
     * @returns The resulting vector.
     */
    max(vec: Vec3Tuple): this {
      this[0] = Math.max(this[0], vec[0]);
      this[1] = Math.max(this[1], vec[1]);
      this[2] = Math.max(this[2], vec[2]);
      return this;
    }

    /**
     * Returns a new vector where each component is the minimum value between the corresponding components of this vector and the given vector.
     * @param vec The vector to compare with.
     * @returns The resulting vector.
     */
    min(vec: Vec3Tuple): this {
      this[0] = Math.min(this[0], vec[0]);
      this[1] = Math.min(this[1], vec[1]);
      this[2] = Math.min(this[2], vec[2]);
      return this;
    }

    /**
     * Multiplies this vector by a scalar value.
     * @param k The scalar value to multiply by.
     
     */
    mulScalar(k: number) {
      this[0] = this[0] * k;
      this[1] = this[1] * k;
      this[2] = this[2] * k;
      return this;
    }

    /**
     * Divides this vector by a scalar value.
     * @param k The scalar value to divide by.
     */
    divScalar(k: number): this {
      this[0] = this[0] / k;
      this[1] = this[1] / k;
      this[2] = this[2] / k;
      return this;
    }

    static cross(a: Vec3Tuple, b: Vec3Tuple): Vec3 {
      return this.create(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
    }

    /**
     * Calculates the cross product of this vector and another vector.
     * @param vec The vector to calculate the cross product with.
     */
    cross(vec: Readonly<Vec3Tuple>): this {
      const t1 = this[2] * vec[0] - this[0] * vec[2];
      const t2 = this[0] * vec[1] - this[1] * vec[0];
      this[0] = this[1] * vec[2] - this[2] * vec[1];
      this[1] = t1;
      this[2] = t2;
      return this;
    }

    crossFrom(a: Vec3Tuple, b: Vec3Tuple): this {
      this[0] = a[1] * b[2] - a[2] * b[1];
      this[1] = a[2] * b[0] - a[0] * b[2];
      this[2] = a[0] * b[1] - a[1] * b[0];
      return this;
    }

    /**
     * Computes the cross product of two vectors; assumes both vectors have
     * three entries.
     * The vector → The vector of a cross b.
     * @param a Operand vector.
     * @param b Operand vector.
     */
    cross2(a: Readonly<Vec2Tuple>, b: Readonly<Vec2Tuple>): this {
      const t2 = a[0] * b[1] - a[1] * b[0];

      this[0] = 0;
      this[1] = 0;
      this[2] = t2;
      return this;
    }

    /**
     * Calculates the dot product of this vector and another vector.
     * @param vec The vector to calculate the dot product with.
     * @returns The dot product value.
     */
    dot(vec: Readonly<Vec3Tuple>): number {
      return this[0] * vec[0] + this[1] * vec[1] + this[2] * vec[2];
    }

    /**
     * Calculates the length (magnitude) of this vector.
     * @returns The length of the vector.
     */
    len(): number {
      return Math.sqrt(this.lenSq());
    }

    /**
     * Calculates the squared length (magnitude) of this vector.
     * @returns The squared length of the vector.
     */
    lenSq(): number {
      return this[0] * this[0] + this[1] * this[1] + this[2] * this[2];
    }

    /**
     * Calculates the distance between this vector and another vector.
     * @param vec The vector to calculate the distance to.
     * @returns The distance between the vectors.
     */
    distance(vec: Vec3Tuple): number {
      const dx = this[0] - vec[0];
      const dy = this[1] - vec[1];
      const dz = this[2] - vec[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Calculates the squared distance between this vector and another vector.
     * @param vec The vector to calculate the squared distance to.
     * @returns The squared distance between the vectors.
     */
    distanceSq(vec: Vec3Tuple): number {
      const dx = this[0] - vec[0];
      const dy = this[1] - vec[1];
      const dz = this[2] - vec[2];
      return dx * dx + dy * dy + dz * dz;
    }

    /**
     * Normalizes this vector (scales it to have a length of 1).
     
     */
    normalize(): this {
      const lenSq = this[0] * this[0] + this[1] * this[1] + this[2] * this[2];
      const len = Math.sqrt(lenSq);
      if (len > 0.00001) {
        this[0] = this[0] / len;
        this[1] = this[1] / len;
        this[2] = this[2] / len;
      } else {
        this[0] = 0;
        this[1] = 0;
        this[2] = 0;
      }

      return this;
    }

    /**
     * Negates this vector (flips the sign of each component).
     
     */
    negate(): this {
      this[0] = -this[0];
      this[1] = -this[1];
      this[2] = -this[2];
      return this;
    }

    /**
     * Inverts this vector (1/x, 1/y, 1/z).
     * @param v The vector to invert.
     
     */
    inverse(v: Vec3Tuple = this): this {
      this[0] = 1.0 / v[0];
      this[1] = 1.0 / v[1];
      this[2] = 1.0 / v[2];
      return this;
    }

    /**
     * Checks if this vector is equal to another vector.
     * @param vec The vector to compare with.
     * @returns True if the vectors are equal, false otherwise.
     */
    equals(vec: Vec3Tuple): boolean {
      return this[0] === vec[0] && this[1] === vec[1] && this[2] === vec[2];
    }

    /**
     * Returns the angle between this vector and another vector.
     * @param vec The vector to calculate the angle to.
     * @returns The angle between the vectors in radians.
     */
    angle(vec: Vec3Tuple): number {
      return Vec3.angle(this, vec);
    }
  };

/**
 * Get the angle between two 3D vectors
 * @param {vec3} a The first operand
 * @param {vec3} b The second operand
 * @returns {Number} The angle in radians
 */
const angle = (ctor: ReturnType<typeof Vec3Builder>) => {
  const tempA = ctor.create();
  const tempB = ctor.create();

  return (a: Vec3Tuple, b: Vec3Tuple): number => {
    tempA.copy(a).normalize();
    tempB.copy(b).normalize();

    let cosine = tempA.dot(tempB);

    if (cosine > 1.0) {
      return 0;
    } else if (cosine < -1.0) {
      return Math.PI;
    } else {
      return Math.acos(cosine);
    }
  };
};
