import * as m2x3 from './m2x3-functions';
import { Radians } from './types';
import { NumberArray } from './utils/typed-array';
import { Vec2 } from './v2';

/**
 * First of all, this class is intended as a wrapper for working with
 * `ArrayBuffers`, `TypedArrays` and `WebGL`, `WebGPU`
 */
export class Mat2x3 {
  static M00 = m2x3.M00;
  static M01 = m2x3.M01;
  /** X */
  static M02 = m2x3.M02;
  static M10 = m2x3.M10;
  static M11 = m2x3.M11;
  /** Y */
  static M12 = m2x3.M12;

  static ELEMENTS = 6;

  constructor(public value: NumberArray = new Float32Array(6)) {}

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

  translate(v: Readonly<Vec2>): this {
    m2x3.translate(this.value, this.value, v.value);
    return this;
  }

  rotate(angle: Radians): this {
    m2x3.rotate(this.value, this.value, angle);
    return this;
  }

  inverse(): this {
    m2x3.inverse(this.value);
    return this;
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

  /**
   * Rotates a matrix around a specific point
   *
   * @param angle The rotation angle in radians
   * @param point The point to rotate around
   */
  rotateAroundPoint(angle: Radians, point: Readonly<Vec2>): this {
    rotateAroundPoint(this, angle, point);
    return this;
  }

  getTransformMatrixBetweenPointPairs(p1Start: Vec2, p2Start: Vec2, p1End: Vec2, p2End: Vec2) {
    return getTransformMatrixBetweenPointPairs(this, p1Start, p2Start, p1End, p2End);
  }

  transformPoint(v: Vec2): this {
    m2x3.transformPoint(v.value, this.value, v.value);
    return this;
  }

  /**
   * Converts a 2x3 matrix to a CSS matrix() string.
   * ```
   * [ a c tx
   *   b d ty ]
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

//
//
// --- EXTRA ---
//
//

export const getAngleBetweenPointPairs = (function createAngleBetweenPointPairs() {
  const buffer = new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 2);
  const v1Start = new Vec2(new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 0, Vec2.ELEMENTS));
  const v1End = new Vec2(new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 1, Vec2.ELEMENTS));

  return function getAngleBetweenPointPairs(p1Start: Vec2, p2Start: Vec2, p1End: Vec2, p2End: Vec2) {
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
  const buffer = new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 3);
  const toOriginMat = new Mat2x3(
    new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 0, Mat2x3.ELEMENTS)
  ).identity();
  const rotationMat = new Mat2x3(
    new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 1, Mat2x3.ELEMENTS)
  ).identity();
  const fromOriginMat = new Mat2x3(
    new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 2, Mat2x3.ELEMENTS)
  ).identity();

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

/**
 * Rotates a matrix around a specific point
 *
 * @param m The input matrix to rotate
 * @param angle The rotation angle in radians
 * @param point The point to rotate around
 * @param dst The destination matrix (or a new matrix if not provided)
 * @returns The rotated matrix
 */
export const rotateAroundPoint = (() => {
  const buffer = new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 3);
  const toOriginMat = new Mat2x3(
    new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 0, Mat2x3.ELEMENTS)
  ).identity();
  const rotationMat = new Mat2x3(
    new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 1, Mat2x3.ELEMENTS)
  ).identity();
  const fromOriginMat = new Mat2x3(
    new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 2, Mat2x3.ELEMENTS)
  ).identity();

  return (out: Mat2x3, angle: Radians, origin: Readonly<Vec2>): Mat2x3 => {
    fromOriginMat.createTranslation(origin);
    rotationMat.createRotation(angle);
    toOriginMat.copy(fromOriginMat).inverse();

    out.identity().multiply(fromOriginMat).multiply(rotationMat).multiply(toOriginMat);

    return out;
  };
})();

export const getTransformMatrixBetweenPointPairs = (() => {
  const buffer = new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 3);
  const toPivotMat = new Mat2x3(
    new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 0, Mat2x3.ELEMENTS)
  ).identity();
  const rotationMat = new Mat2x3(
    new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 1, Mat2x3.ELEMENTS)
  ).identity();
  const fromPivotMat = new Mat2x3(
    new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 2, Mat2x3.ELEMENTS)
  ).identity();

  return (out: Mat2x3, p1Start: Vec2, p2Start: Vec2, p1End: Vec2, p2End: Vec2): Mat2x3 => {
    // Calculate rotation angle
    const angle = getAngleBetweenPointPairs(p1Start, p2Start, p1End, p2End);

    // Calculate the midpoint between the start points
    const midpointStart: Vec2 = new Vec2().addFrom(p1Start, p2Start).divScalar(2);

    // Calculate the midpoint between the end points
    const midpointEnd: Vec2 = new Vec2().addFrom(p1End, p2End).divScalar(2);

    toPivotMat.createTranslation(midpointStart.negate());
    rotationMat.createRotation(-angle as Radians);
    fromPivotMat.createTranslation(midpointEnd);

    out.identity().multiply(fromPivotMat).multiply(rotationMat).multiply(toPivotMat);

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
export const zoomToPoint = (() => {
  const buffer = new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 3);
  const translationToOrigin = new Mat2x3(
    new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 0, Mat2x3.ELEMENTS)
  ).identity();
  const translationBack = new Mat2x3(
    new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 1, Mat2x3.ELEMENTS)
  ).identity();
  const scaleMatrix = new Mat2x3(
    new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Mat2x3.ELEMENTS * 2, Mat2x3.ELEMENTS)
  ).identity();

  return (out: Mat2x3, m: Readonly<Mat2x3>, zoom: number, point: Readonly<Vec2>): Mat2x3 => {
    // 1. Create a scale matrix
    scaleMatrix.createScale(Vec2.create(zoom, zoom));

    // 2. Create a translation matrix to move the origin to the fixed point
    translationToOrigin.createTranslation(point.negate());

    // 3. Create a translation matrix to move the origin back to the original position
    translationBack.createTranslation(point);

    // 4. Combine the matrices in the correct order: T * S * T^-1 * M
    out.identity().multiply(translationToOrigin).multiply(scaleMatrix).multiply(translationBack);

    return out;
  };
})();
