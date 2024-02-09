import { NumberArrayConstructor } from './utils/type-array';

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
export const Builder = (ctor: NumberArrayConstructor) =>
  class Vec3 extends (ctor as ArrayConstructor) {
    /**
     * Creates a new Vec3 instance with the specified initial values.
     * @param x The initial x value (default: 0).
     * @param y The initial y value (default: 0).
     * @param z The initial z value (default: 0).
     * @returns The new Vec3 instance.
     */
    static create(x: number = 0, y: number = 0, z: number = 0): Vec3 {
      const v = new Vec3(3);
      v[0] = x;
      v[1] = y;
      v[2] = z;

      return v;
    }

    static angle = angle(Vec3);

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
     * @returns The modified Vec3 instance.
     */
    set(x: number = 0, y: number = 0, z: number = 0): this {
      return set(this, x, y, z);
    }

    /**
     * Copies the values from another vector to this vector.
     * @param vec The vector to copy from.
     * @returns The modified Vec3 instance.
     */
    copy(vec: Tuple) {
      return copy(this, vec);
    }

    /**
     * Adds another vector to this vector.
     * @param vec The vector to add.
     * @returns The modified Vec3 instance.
     */
    add(vec: Tuple): this {
      return add(this, vec);
    }

    /**
     * Subtracts another vector from this vector.
     * @param vec The vector to subtract.
     * @returns The modified Vec3 instance.
     */
    sub(vec: Tuple): this {
      return sub(this, vec);
    }

    /**
     * Multiplies this vector component-wise with another vector.
     * @param vec The vector to multiply with.
     * @returns The modified Vec3 instance.
     */
    multiply(vec: Tuple) {
      return multiply(this, vec);
    }

    /**
     * Divides this vector component-wise by another vector.
     * @param vec The vector to divide by.
     * @param dst The destination vector to store the result (default: new VecType(3)).
     * @returns The modified Vec3 instance.
     */
    divide(vec: Tuple) {
      return divide(this, vec);
    }

    /**
     * Performs linear interpolation between this vector and another vector.
     * @param vec The vector to interpolate with.
     * @param t The interpolation coefficient.
     * @returns The modified Vec3 instance.
     */
    lerp(vec: Tuple, t: number): this {
      return lerp(this, vec, t);
    }

    /**
     * Performs linear interpolation between this vector and another vector using vector coefficients.
     * @param vec The vector to interpolate with.
     * @param t The vector of interpolation coefficients.
     * @returns The modified Vec3 instance.
     */
    lerpV(vec: Tuple, t: Tuple): this {
      return lerpV(this, vec, t);
    }

    /**
     * Returns a new vector where each component is the maximum value between the corresponding components of this vector and the given vector.
     * @param vec The vector to compare with.
     * @returns The resulting vector.
     */
    max(vec: Tuple): this {
      return max(this, vec);
    }

    /**
     * Returns a new vector where each component is the minimum value between the corresponding components of this vector and the given vector.
     * @param vec The vector to compare with.
     * @returns The resulting vector.
     */
    min(vec: Tuple): this {
      return min(this, vec);
    }

    /**
     * Multiplies this vector by a scalar value.
     * @param k The scalar value to multiply by.
     * @returns The modified Vec3 instance.
     */
    mulScalar(k: number) {
      return mulScalar(this, k);
    }

    /**
     * Divides this vector by a scalar value.
     * @param k The scalar value to divide by.
     * @returns The modified Vec3 instance.
     */
    divScalar(k: number): this {
      return divScalar(this, k);
    }

    /**
     * Calculates the cross product of this vector and another vector.
     * @param vec The vector to calculate the cross product with.
     * @returns The modified Vec3 instance.
     */
    cross(vec: Tuple): this {
      return cross(this, vec);
    }

    /**
     * Calculates the dot product of this vector and another vector.
     * @param vec The vector to calculate the dot product with.
     * @returns The dot product value.
     */
    dot(vec: Tuple): number {
      return dot(this, vec);
    }

    /**
     * Calculates the length (magnitude) of this vector.
     * @returns The length of the vector.
     */
    len(): number {
      return len(this);
    }

    /**
     * Calculates the squared length (magnitude) of this vector.
     * @returns The squared length of the vector.
     */
    lenSq(): number {
      return lenSq(this);
    }

    /**
     * Calculates the distance between this vector and another vector.
     * @param vec The vector to calculate the distance to.
     * @returns The distance between the vectors.
     */
    distance(vec: Tuple): number {
      return distance(this, vec);
    }

    /**
     * Calculates the squared distance between this vector and another vector.
     * @param vec The vector to calculate the squared distance to.
     * @returns The squared distance between the vectors.
     */
    distanceSq(vec: Tuple): number {
      return distanceSq(this, vec);
    }

    /**
     * Normalizes this vector (scales it to have a length of 1).
     * @returns The modified Vec3 instance.
     */
    normalize(): this {
      return normalize(this);
    }

    /**
     * Negates this vector (flips the sign of each component).
     * @returns The modified Vec3 instance.
     */
    negate(): this {
      return negate(this);
    }

    /**
     * Inverts this vector (1/x, 1/y, 1/z).
     * @param v The vector to invert.
     * @returns The modified Vec3 instance.
     */
    inverse(v: Tuple = this): this {
      return inverse(this, v);
    }

    /**
     * Checks if this vector is equal to another vector.
     * @param vec The vector to compare with.
     * @returns True if the vectors are equal, false otherwise.
     */
    equals(vec: Tuple): boolean {
      return equals(this, vec);
    }

    /**
     * Returns the angle between this vector and another vector.
     * @param vec The vector to calculate the angle to.
     * @returns The angle between the vectors in radians.
     */
    angle(vec: Tuple): number {
      return Vec3.angle(this, vec);
    }
  };

/**
 * A JavaScript array with 3 values or a Float32Array with 3 values.
 * When created by the library will create the default type which is `Float32Array`
 * but can be set by calling {@link Builder}.
 */
export type Tuple =
  | [x: number, y: number, z: number]
  | number[]
  | Float32Array
  | Float64Array
  | Int16Array
  | Int32Array;

/**
 * Creates a vec3; may be called with x, y, z to set initial values.
 * @param {number} [x] Initial x value.
 * @param {number} [y] Initial y value.
 * @param {number} [z] Initial z value.
 * @return {Tuple} the created vector
 */
export function create(
  x: number = 0,
  y: number = 0,
  z: number = 0,
  ctor: NumberArrayConstructor = Float32Array
): Tuple {
  const dst = new ctor(3);

  dst[0] = x;
  dst[1] = y;
  dst[2] = z;

  return dst as Tuple;
}

/**
 * Set a vec3; may be called with x, y, z to set initial values.
 * @param x Initial x value.
 * @param y Initial y value.
 * @param z Initial z value.
 */
export const set = <T extends Tuple>(self: T, x: number = 0, y: number = 0, z: number = 0): T => {
  self[0] = x;
  self[1] = y;
  self[2] = z;
  return self;
};

/**
 * Adds two vectors; assumes a and b have the same dimension.
 * @param self __mut__ Operand vector. A vector tha tis the sum of a and b.
 * @param vec Operand vector.
 */
export const add = <T extends Tuple>(self: T, vec: Tuple): T => {
  self[0] += vec[0];
  self[1] += vec[1];
  self[2] += vec[2];
  return self;
};

/**
 * Subtracts two vectors.
 * @param self __mut__ Operand vector and vector to hold result.
 * @param vec Operand vector.
 * @return A vector that is the difference of a and b.
 */
export const sub = <T extends Tuple>(self: T, vec: Tuple): T => {
  self[0] -= vec[0];
  self[1] -= vec[1];
  self[2] -= vec[2];
  return self;
};

/**
 * Performs linear interpolation on two vectors.
 * Given vectors a and b and interpolation coefficient t, returns
 * a + t * (b - a).
 * @param self __mut__ Operand vector. The linear interpolated result.
 * @param vec Operand vector.
 * @param t Interpolation coefficient.
 */
export const lerp = <T extends Tuple>(self: T, vec: Tuple, t: number): T => {
  self[0] = self[0] + t * (vec[0] - self[0]);
  self[1] = self[1] + t * (vec[1] - self[1]);
  self[2] = self[2] + t * (vec[2] - self[2]);
  return self;
};

/**
 * Performs linear interpolation on two vectors.
 * Given vectors a and b and interpolation coefficient vector t, returns
 * a + t * (b - a).
 * @param self __mut__ Operand vector. the linear interpolated result.
 * @param b Operand vector.
 * @param b Interpolation coefficients vector.
 */
export const lerpV = <T extends Tuple>(self: T, b: Tuple, t: Tuple): T => {
  self[0] = self[0] + b[0] * (b[0] - self[0]);
  self[1] = self[1] + b[1] * (b[1] - self[1]);
  self[2] = self[2] + b[2] * (b[2] - self[2]);
  return self;
};

/**
 * Return max values of two vectors.
 * Given vectors a and b returns
 * [max(a[0], b[0]), max(a[1], b[1]), max(a[2], b[2])].
 * @param self Operand vector. The max components vector.
 * @param vec Operand vector.
 */
export const max = <T extends Tuple>(self: T, vec: Tuple): T => {
  self[0] = Math.max(self[0], vec[0]);
  self[1] = Math.max(self[1], vec[1]);
  self[2] = Math.max(self[2], vec[2]);
  return self;
};

/**
 * Return min values of two vectors.
 * Given vectors a and b returns
 * [min(a[0], b[0]), min(a[1], b[1]), min(a[2], b[2])].
 * @param self Operand vector. The min components vector.
 * @param vec Operand vector.
 */
export const min = <T extends Tuple>(self: T, vec: Tuple): T => {
  self[0] = Math.min(self[0], vec[0]);
  self[1] = Math.min(self[1], vec[1]);
  self[2] = Math.min(self[2], vec[2]);
  return self;
};

/**
 * Multiplies a vector by a scalar.
 * @param self The vector. The scaled vector.
 * @param k The scalar.
 */
export const mulScalar = <T extends Tuple>(self: T, k: number): T => {
  self[0] = self[0] * k;
  self[1] = self[1] * k;
  self[2] = self[2] * k;
  return self;
};

/**
 * Divides a vector by a scalar.
 * @param self __mut__ The vector.  The scaled vector.
 * @param k The scalar.
 */
export const divScalar = <T extends Tuple>(self: T, k: number): T => {
  self[0] = self[0] / k;
  self[1] = self[1] / k;
  self[2] = self[2] / k;
  return self;
};

/**
 * Computes the cross product of two vectors; assumes both vectors have
 * three entries.
 * @param self __mut__ Operand vector. The vector of a cross b.
 * @param vec Operand vector.
 */
export const cross = <T extends Tuple>(self: T, vec: Tuple): T => {
  const t1 = self[2] * vec[0] - self[0] * vec[2];
  const t2 = self[0] * vec[1] - self[1] * vec[0];
  self[0] = self[1] * vec[2] - self[2] * vec[1];
  self[1] = t1;
  self[2] = t2;
  return self;
};

/**
 * Computes the dot product of two vectors; assumes both vectors have
 * three entries.
 * @param self Operand vector.
 * @param b Operand vector.
 * @return dot product
 */
export const dot = <T extends Tuple>(self: T, b: Tuple): number => {
  return self[0] * b[0] + self[1] * b[1] + self[2] * b[2];
};

/**
 * Computes the length of vector
 * @param self vector.
 * @return length of vector.
 */
export const len = <T extends Tuple>(self: T): number => {
  return Math.sqrt(self[0] * self[0] + self[1] * self[1] + self[2] * self[2]);
};

/**
 * Computes the square of the length of vector
 * @param self vector.
 * @return square of the length of vector.
 */
export const lenSq = <T extends Tuple>(self: T): number => {
  return self[0] * self[0] + self[1] * self[1] + self[2] * self[2];
};

/**
 * Computes the distance between 2 points
 * @param self vector.
 * @param b vector.
 * @return distance between a and b
 */
export const distance = <T extends Tuple>(self: T, b: Tuple): number => {
  const dx = self[0] - b[0];
  const dy = self[1] - b[1];
  const dz = self[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * Computes the square of the distance between 2 points
 * @param self vector.
 * @param b vector.
 * @return square of the distance between a and b
 */
export const distanceSq = <T extends Tuple>(self: T, b: Tuple): number => {
  const dx = self[0] - b[0];
  const dy = self[1] - b[1];
  const dz = self[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
};

/**
 * Divides a vector by its Euclidean length and returns the quotient.
 * @param self The vector → The normalized vector.
 */
export const normalize = <T extends Tuple>(self: T): T => {
  const lenSq = self[0] * self[0] + self[1] * self[1] + self[2] * self[2];
  const len = Math.sqrt(lenSq);
  if (len > 0.00001) {
    self[0] = self[0] / len;
    self[1] = self[1] / len;
    self[2] = self[2] / len;
  } else {
    self[0] = 0;
    self[1] = 0;
    self[2] = 0;
  }

  return self;
};

/**
 * Negates a vector.
 * @param self The vector → -v.
 */
export const negate = <T extends Tuple>(self: T): T => {
  self[0] = -self[0];
  self[1] = -self[1];
  self[2] = -self[2];
  return self;
};

/**
 * Inverts a vector.
 * @param self The vector → 1/v.
 * @param v The vector to invert.
 */
export const inverse = <T extends Tuple>(self: T, v: Tuple): T => {
  self[0] = 1.0 / v[0];
  self[1] = 1.0 / v[1];
  self[2] = 1.0 / v[2];
  return self;
};

/**
 * Copies a vector.
 * @param v The vector.
 * @return A copy of v.
 */
export const copy = <T extends Tuple>(self: T, b: Tuple): T => {
  self[0] = b[0];
  self[1] = b[1];
  self[2] = b[2];
  return self;
};

/**
 * Multiplies a vector by another vector (component-wise); assumes a and
 * b have the same length.
 * @param self Operand vector → The vector of products of entries of a and b.
 * @param vec Operand vector.
 */
export const multiply = <T extends Tuple>(self: T, vec: Tuple): T => {
  self[0] *= vec[0];
  self[1] *= vec[1];
  self[2] *= vec[2];
  return self;
};

/**
 * Divides a vector by another vector (component-wise); assumes a and
 * b have the same length.
 * @param self Operand vector → The vector of quotients of entries of a and b.
 * @param b Operand vector.
 */
export const divide = <T extends Tuple>(self: T, b: Tuple): T => {
  self[0] /= b[0];
  self[1] /= b[1];
  self[2] /= b[2];
  return self;
};

/**
 * Get the angle between two 3D vectors
 * @param {vec3} a The first operand
 * @param {vec3} b The second operand
 * @returns {Number} The angle in radians
 */
export const angle = (ctor: ReturnType<typeof Builder>) => {
  const tempA = ctor.create();
  const tempB = ctor.create();

  return (a: Tuple, b: Tuple): number => {
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

/**
 * Returns whether or not the vectors have exactly the same elements in the same position (when compared with ===)
 *
 * @param {vec3} self The first vector.
 * @param {vec3} vec The second vector.
 * @returns {Boolean} True if the vectors are equal, false otherwise.
 */
export const equals = <T extends Tuple>(self: T, vec: Tuple): boolean => {
  return self[0] === vec[0] && self[1] === vec[1] && self[2] === vec[2];
};
