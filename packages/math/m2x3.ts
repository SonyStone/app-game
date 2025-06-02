import * as m2x3 from './m2x3-functions';
import type { Transform } from './transform';
import type { Radians } from './types';
import { createStruct } from './utils/create-struct';
import type { NumberArray } from './utils/typed-array';
import { Vec2 } from './v2';

/**
 * First of all, this class is intended as a wrapper for working with
 * `ArrayBuffers`, `TypedArrays` and `WebGL`, `WebGPU`
 */
export class Mat2x3<T extends NumberArray = NumberArray> {
  static M00 = m2x3.M00;
  static M01 = m2x3.M01;
  /** X */
  static M02 = m2x3.M02;
  static M10 = m2x3.M10;
  static M11 = m2x3.M11;
  /** Y */
  static M12 = m2x3.M12;

  static ELEMENTS = 6;

  constructor(public value: T = new Float32Array(6) as unknown as T) {}

  static create(): Mat2x3 {
    return new Mat2x3().identity();
  }

  set(m00: number, m01: number, m02: number, m10: number, m11: number, m12: number): this {
    m2x3.set(this.value, m00, m01, m02, m10, m11, m12);
    return this;
  }

  copy(m: Readonly<Mat2x3>): this {
    m2x3.copy(this.value, m.value);
    return this;
  }

  static identity(): Mat2x3 {
    return new Mat2x3();
  }

  identity(): this {
    m2x3.identity(this.value);
    return this;
  }

  multiply(m: Readonly<Mat2x3>): this {
    m2x3.multiply(this.value, this.value, m.value);
    return this;
  }

  /**
   * this = a * b
   * @param a
   * @param b
   * @returns
   */
  multiplyFrom(a: Readonly<Mat2x3>, b: Readonly<Mat2x3>): Mat2x3 {
    m2x3.multiply(this.value, a.value, b.value);
    return this;
  }

  createTranslation(v: Readonly<Vec2>): Mat2x3 {
    m2x3.setTranslation(this.value, v.value);
    return this;
  }

  // prettier-ignore
  createRotation(angle: Radians): Mat2x3 {
    m2x3.setRotation(this.value, angle);
    return this;
  }

  createScale(scale: Readonly<Vec2>): Mat2x3 {
    m2x3.setScale(this.value, scale.value);
    return this;
  }

  scale(scale: Readonly<Vec2>): this {
    m2x3.scale(this.value, this.value, scale.value);
    return this;
  }

  scaleScalar(scale: number): this {
    m2x3.scaleScalar(this.value, this.value, scale);
    return this;
  }

  scaleOrigin(scale: Readonly<Vec2>, origin: Readonly<Vec2>): this {
    scaleOrigin(this, scale, origin);
    return this;
  }

  translate(v: Readonly<Vec2>): this {
    m2x3.translate(this.value, this.value, v.value);
    return this;
  }

  rotate(angle: Radians): this {
    m2x3.rotate(this.value, this.value, angle);
    return this;
  }

  /**
   * Rotates a matrix around a specific point
   *
   * @param angle The rotation angle in radians
   * @param point The point to rotate around
   */
  rotateOrigin(angle: Radians, point: Readonly<Vec2>): this {
    rotateOrigin(this, angle, point);
    return this;
  }

  inverse(): this {
    m2x3.inverse(this.value);
    return this;
  }

  getTranslation(dst: Vec2): Vec2 {
    dst.value[0] = this.value[Mat2x3.M02];
    dst.value[1] = this.value[Mat2x3.M12];
    return dst;
  }

  getRotation(): Radians {
    return Math.atan2(this.value[Mat2x3.M01], this.value[Mat2x3.M00]) as Radians;
  }

  getScale(dst: Vec2): Vec2 {
    dst.value[0] = Math.hypot(this.value[Mat2x3.M00], this.value[Mat2x3.M10]);
    dst.value[1] = Math.hypot(this.value[Mat2x3.M01], this.value[Mat2x3.M11]);
    return dst;
  }

  isEqual(m: Readonly<Mat2x3>): boolean {
    return m2x3.isEqual(this.value, m.value);
  }

  getTransformMatrixBetweenPointPairs(p1Start: Vec2, p2Start: Vec2, p1End: Vec2, p2End: Vec2) {
    return getTransformMatrixBetweenPointPairs(this, p1Start, p2Start, p1End, p2End);
  }

  transformPoint(v: Vec2): Vec2 {
    m2x3.transformPoint(v.value, this.value, v.value);
    return v;
  }

  decompose(t: Readonly<Transform>): Readonly<Transform> {
    m2x3.decompose(this.value, t.position.value, t.rotation.value, t.scale.value);
    return t;
  }

  compose(t: Readonly<Transform>): this {
    m2x3.compose(this.value, t.position.value, t.rotation.value, t.scale.value);
    return this;
  }

  /**
   * Converts a 2x3 matrix to a CSS matrix() string.
   * ```
   * [ a c tx
   *   b d ty ]
   * ```
   * @example
   * ```
   * `matrix(1, 0, 0, 1, 0, 0)`
   * ```
   */
  toCssMatrix(): string {
    return m2x3.toCssMatrix(this.value);
  }

  /**
   * Converts a 2x3 matrix to a CSS matrix3d() string.
   */
  toCssMatrix3d(): string {
    return m2x3.toCssMatrix3d(this.value);
  }
}

export const MAT2X3_FLOAT32_BYTES = Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS;
export const MAT2X3_FLOAT64_BYTES = Float64Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS;

//
//
// --- EXTRA ---
//
//

export const getAngleBetweenPointPairs = (() => {
  const [{ v1Start, v1End }] = createStruct({
    v1Start: [Vec2, Float32Array],
    v1End: [Vec2, Float32Array]
  });

  return (p1Start: Vec2, p2Start: Vec2, p1End: Vec2, p2End: Vec2) => {
    // Calculate vectors between points
    v1Start.subFrom(p2Start, p1Start);
    v1End.subFrom(p2End, p1End);

    // Calculate the angles of these vectors
    const angleStart = v1Start.toAngle();
    const angleEnd = v1End.toAngle();

    // Calculate angle difference
    return (angleEnd - angleStart) as Radians;
  };
})();

/**
 * Calculate rotation matrix between two pairs of points
 * @param p1Start First point (pivot)
 * @param p2Start Second point (pointer start)
 * @param p1End First point (same pivot)
 * @param p2End Second point (pointer end)
 * @returns A 2x3 transformation matrix
 */
export const getRotationMatrixBetweenPointPairs = (() => {
  const [{ toOriginMat, rotationMat, fromOriginMat }] = createStruct({
    toOriginMat: [Mat2x3, Float32Array],
    rotationMat: [Mat2x3, Float32Array],
    fromOriginMat: [Mat2x3, Float32Array]
  });

  return (point: Vec2, angleChange: Radians, dst: Mat2x3): Mat2x3 => {
    // 1. Translate to the pivot point
    toOriginMat.createTranslation(Vec2.create(-point.x, -point.y));

    // 2. Apply rotation
    rotationMat.createRotation(angleChange);

    // 3. Translate back
    fromOriginMat.createTranslation(Vec2.create(point.x, point.y));

    dst.identity().multiply(fromOriginMat).multiply(rotationMat).multiply(toOriginMat);

    return dst;
  };
})();

export const getTransformMatrixBetweenPointPairs = (() => {
  const [{ backFromOrigin, rotationMat, toOrigin, midpointStart, midpointEnd }] = createStruct({
    toOrigin: [Mat2x3, Float32Array],
    rotationMat: [Mat2x3, Float32Array],
    backFromOrigin: [Mat2x3, Float32Array],
    midpointStart: [Vec2, Float32Array],
    midpointEnd: [Vec2, Float32Array]
  });

  return (out: Mat2x3, p1Start: Vec2, p2Start: Vec2, p1End: Vec2, p2End: Vec2): Mat2x3 => {
    // Calculate the midpoint between the end points
    toOrigin.createTranslation(midpointEnd.addFrom(p1End, p2End).divScalar(2));

    // Calculate rotation angle
    rotationMat.createRotation(getAngleBetweenPointPairs(p1End, p2End, p1Start, p2Start));

    // Calculate the midpoint between the start points
    backFromOrigin.createTranslation(midpointStart.addFrom(p1Start, p2Start).divScalar(2).negate());

    out.identity().multiply(toOrigin).multiply(rotationMat).multiply(backFromOrigin);

    return out;
  };
})();

/**
 * Rotates a matrix around a specific point
 *
 * @param m The input matrix to rotate
 * @param angle The rotation angle in radians
 * @param point The point to rotate around
 * @param dst The destination matrix (or a new matrix if not provided)
 * @returns The rotated matrix
 */
export const rotateOrigin = (() => {
  const [{ position, localOrigin, rotate, toOrigin }] = createStruct({
    position: [Vec2, Float32Array],
    localOrigin: [Vec2, Float32Array],
    toOrigin: [Mat2x3, Float32Array],
    rotate: [Mat2x3, Float32Array]
  });

  return (out: Mat2x3, angle: Radians, origin: Readonly<Vec2>): Mat2x3 => {
    localOrigin.subFrom(origin, out.getTranslation(position));
    toOrigin.createTranslation(localOrigin);
    out.multiply(toOrigin);
    // .multiply(rotate.createRotation(angle)).multiply(toOrigin.inverse());
    return out;
  };
})();

/**
 * Applies zoom to a 2x3 matrix, keeping a point (x, y) fixed.
 *
 * @param m The input matrix.
 * @param zoom The zoom factor.
 * @param point The fixed point.
 * @param dst The matrix to store the result.
 */
export const scaleOrigin = (() => {
  const [{ toOrigin, scale }] = createStruct({
    toOrigin: [Mat2x3, Float32Array],
    scale: [Mat2x3, Float32Array]
  });

  return (out: Mat2x3, zoom: Readonly<Vec2>, origin: Readonly<Vec2>): Mat2x3 => {
    toOrigin.createTranslation(origin);
    out.multiply(toOrigin).multiply(scale.createScale(zoom)).multiply(toOrigin.inverse());
    return out;
  };
})();
