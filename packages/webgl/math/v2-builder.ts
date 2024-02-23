import type { TypedArray, TypedArrayConstructor } from './utils/typed-array';

/**
 * A JavaScript array with 3 values or a Float32Array with 3 values.
 * When created by the library will create the default type which is `Float32Array`
 * but can be set by calling {@link Vec2Builder}.
 */
export type Vec2Tuple = [x: number, y: number] | TypedArray;

/**
 * Creates a vector builder function that generates a Vec3 class based on the provided constructor.
 * @param ctor The constructor for the underlying array type.
 * @returns The Vec3 class.
 *
 * @example
 * ```ts
 * const Vec2 = Vec2Builder(Float32Array);
 * ```
 */
export const Vec2Builder = (ctor: TypedArrayConstructor) =>
  class Vec2 extends (ctor as ArrayConstructor) {
    constructor() {
      super(2);
    }

    /**
     * Creates a new Vec3 instance with the specified initial values.
     * @param x The initial x value (default: 0).
     * @param y The initial y value (default: 0).
     * @returns The new Vec3 instance.
     */
    static create(x: number = 0, y: number = 0): Vec2 {
      const v = new Vec2();
      v[0] = x;
      v[1] = y;

      return v;
    }

    static angle = angle(Vec2);

    static splat = (v: number): Vec2 => Vec2.create(v, v);

    /** All zeroes. */
    static readonly ZERO = Vec2.splat(0);

    /** All ones. */
    static readonly ONE = Vec2.splat(1);

    /** All negative ones. */
    static readonly NEG_ONE = Vec2.splat(-1);

    /** All `NaN`. */
    static readonly NAN = Vec2.splat(NaN);

    /** All `Infinity`. */
    static readonly INFINITY = Vec2.splat(Infinity);

    /** All `-Infinity`. */
    static readonly NEG_INFINITY = Vec2.splat(-Infinity);

    /** A unit vector pointing along the positive X axis. */
    static readonly X = Vec2.create(1, 0) as Readonly<Vec2>;

    /** →  */
    static readonly RIGHT = Vec2.create(1, 0);

    /** A unit vector pointing along the positive Y axis. */
    static readonly Y = Vec2.create(0, 1);

    /** ↑ */
    static readonly UP = Vec2.create(0, 1);

    /** A unit vector pointing along the negative X axis. */
    static readonly NEG_X = Vec2.create(-1, 0);

    /** ← */
    static readonly LEFT = Vec2.create(-1, 0);

    /** A unit vector pointing along the negative Y axis. */
    static readonly NEG_Y = Vec2.create(0, -1);

    /** ↓ */
    static readonly DOWN = Vec2.create(0, -1);

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
     * Creates a new Vec3 instance with the same values as this vector.
     * @returns The new Vec3 instance.
     */
    clone() {
      return Vec2.create(this[0], this[1]);
    }

    /**
     * Sets the values of the vector.
     * @param x The x value to set (default: 0).
     * @param y The y value to set (default: 0).
     * @param z The z value to set (default: 0).
     * @returns The modified Vec3 instance.
     */
    set(x: number = 0, y: number = 0): this {
      this[0] = x;
      this[1] = y;
      return this;
    }

    /**
     * Copies the values from another vector to this vector.
     * @param rhs The vector to copy from.
     * @returns The modified Vec3 instance.
     */
    copy(rhs: Vec2Tuple): this {
      this[0] = rhs[0];
      this[1] = rhs[1];
      return this;
    }

    static add(a: Vec2Tuple, b: Vec2Tuple): Vec2 {
      return Vec2.create(a[0] + b[0], a[1] + b[1]);
    }

    /**
     * Adds another vector to this vector.
     * @param vec The vector to add.
     * @returns The modified Vec3 instance.
     */
    add(vec: Vec2Tuple): this {
      this[0] += vec[0];
      this[1] += vec[1];
      return this;
    }

    /**
     * Subtracts another vector from this vector.
     * @param rhs The vector to subtract.
     * @returns The modified Vec3 instance.
     */
    sub(rhs: Vec2Tuple): this {
      this[0] -= rhs[0];
      this[1] -= rhs[1];
      return this;
    }

    /**
     * Multiplies this vector component-wise with another vector.
     * @param vec The vector to multiply with.
     * @returns The modified Vec3 instance.
     */
    multiply(rhs: Vec2Tuple) {
      this[0] *= rhs[0];
      this[1] *= rhs[1];
      return this;
    }

    /**
     * Divides this vector component-wise by another vector.
     * @param vec The vector to divide by.
     * @param dst The destination vector to store the result (default: new VecType(3)).
     * @returns The modified Vec3 instance.
     */
    divide(rhs: Vec2Tuple) {
      this[0] /= rhs[0];
      this[1] /= rhs[1];
      return this;
    }

    /**
     * Performs linear interpolation between this vector and another vector.
     * @param vec The vector to interpolate with.
     * @param t The interpolation coefficient.
     * @returns The modified Vec3 instance.
     */
    lerp(rhs: Vec2Tuple, t: number): this {
      this[0] = this[0] + t * (rhs[0] - this[0]);
      this[1] = this[1] + t * (rhs[1] - this[1]);
      return this;
    }

    /**
     * Performs linear interpolation between this vector and another vector using vector coefficients.
     * @param vec The vector to interpolate with.
     * @param t The vector of interpolation coefficients.
     * @returns The modified Vec3 instance.
     */
    lerpV(rhs: Vec2Tuple, t: Vec2Tuple): this {
      this[0] = this[0] + t[0] * (rhs[0] - this[0]);
      this[1] = this[1] + t[1] * (rhs[1] - this[1]);
      return this;
    }

    /**
     * Returns a new vector where each component is the maximum value between the corresponding components of this vector and the given vector.
     * @param vec The vector to compare with.
     * @returns The resulting vector.
     */
    max(rhs: Vec2Tuple): Vec2 {
      const x = Math.max(this[0], rhs[0]);
      const y = Math.max(this[1], rhs[1]);
      return Vec2.create(x, y);
    }

    /**
     * Returns a new vector where each component is the minimum value between the corresponding components of this vector and the given vector.
     * @param vec The vector to compare with.
     * @returns The resulting vector.
     */
    min(rhs: Vec2Tuple): Vec2 {
      const x = Math.min(this[0], rhs[0]);
      const y = Math.min(this[1], rhs[1]);
      return Vec2.create(x, y);
    }

    /**
     * Multiplies this vector by a scalar value.
     * @param rhs The scalar value to multiply by.
     * @returns The modified Vec3 instance.
     */
    mulScalar(rhs: number) {
      this[0] *= rhs;
      this[1] *= rhs;
      return this;
    }

    /**
     * Divides this vector by a scalar value.
     * @param rhs The scalar value to divide by.
     * @returns The modified Vec3 instance.
     */
    divScalar(rhs: number): this {
      this[0] /= rhs;
      this[1] /= rhs;
      return this;
    }

    /**
     * Calculates the dot product of this vector and another vector.
     * @param vec The vector to calculate the dot product with.
     * @returns The dot product value.
     */
    dot(rhs: Vec2Tuple): number {
      return this[0] * rhs[0] + this[1] * rhs[1] + this[2] * rhs[2];
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
      return this[0] * this[0] + this[1] * this[1];
    }

    /**
     * Calculates the distance between this vector and another vector.
     * @param vec The vector to calculate the distance to.
     * @returns The distance between the vectors.
     */
    distance(rhs: Vec2Tuple): number {
      const dx = this[0] - rhs[0];
      const dy = this[1] - rhs[1];
      return Math.sqrt(dx * dx + dy * dy);
    }

    static distanceSq(a: Vec2Tuple, b: Vec2Tuple): number {
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      return dx * dx + dy * dy;
    }

    /**
     * Calculates the squared distance between this vector and another vector.
     * @param vec The vector to calculate the squared distance to.
     * @returns The squared distance between the vectors.
     */
    distanceSq(rhs: Vec2Tuple): number {
      const dx = this[0] - rhs[0];
      const dy = this[1] - rhs[1];
      return dx * dx + dy * dy;
    }

    /**
     * Normalizes this vector (scales it to have a length of 1).
     * @returns The modified Vec3 instance.
     */
    normalize(): this {
      const lenSq = this[0] * this[0] + this[1] * this[1];
      const len = Math.sqrt(lenSq);
      if (len > 0.00001) {
        this[0] = this[0] / len;
        this[1] = this[1] / len;
      } else {
        this[0] = 0;
        this[1] = 0;
      }

      return this;
    }

    /**
     * Negates this vector (flips the sign of each component).
     * @returns The modified Vec3 instance.
     */
    negate(): this {
      this[0] = -this[0];
      this[1] = -this[1];
      return this;
    }

    /**
     * Inverts this vector (1/x, 1/y, 1/z).
     * @param v The vector to invert.
     * @returns The modified Vec3 instance.
     */
    inverse(v: Vec2Tuple = this): this {
      this[0] = 1.0 / v[0];
      this[1] = 1.0 / v[1];
      return this;
    }

    /**
     * Checks if this vector is equal to another vector.
     * @param vec The vector to compare with.
     * @returns True if the vectors are equal, false otherwise.
     */
    equals(vec: Vec2Tuple): boolean {
      return this[0] === vec[0] && this[1] === vec[1];
    }

    /**
     * Returns the angle between this vector and another vector.
     * @param vec The vector to calculate the angle to.
     * @returns The angle between the vectors in radians.
     */
    angle(vec: Vec2Tuple): number {
      return Vec2.angle(this, vec);
    }

    fromAngle(angle: number): Vec2Tuple {
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      return Vec2.create(x, y);
    }

    angleTo(vec: Vec2Tuple): number {
      return Math.atan2(this[1] - vec[1], this[0] - vec[0]);
    }
  };

/**
 * Get the angle between two 2D vectors
 * @param {vec3} a The first operand
 * @param {vec3} b The second operand
 * @returns {Number} The angle in radians
 */
const angle = (ctor: ReturnType<typeof Vec2Builder>) => {
  const tempA = ctor.create();
  const tempB = ctor.create();

  return (a: Vec2Tuple, b: Vec2Tuple): number => {
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
