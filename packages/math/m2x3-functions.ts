import { fastCos, fastSin } from './fast-angle';
import { Radians } from './types';
import { NumberArray } from './utils/typed-array';
import * as v2 from './v2-functions';

export const M00 = 0;
export const M01 = 1;
/** X */
export const M02 = 2;
export const M10 = 3;
export const M11 = 4;
/** Y */
export const M12 = 5;

/**
 * Set the provided matrix values.
 */
// prettier-ignore
export function set(
  out: NumberArray,
  m00: number, m01: number, m02: number,
  m10: number, m11: number, m12: number
): void {
  out[M00] = m00; out[M01] = m01; out[M02] = m02;
  out[M10] = m10; out[M11] = m11; out[M12] = m12;
}

/**
 * Copies a matrix.
 */
// prettier-ignore
export function copy(out: NumberArray, m: Readonly<NumberArray>) {
  out[M00] = m[M00]; out[M01] = m[M01]; out[M02] = m[M02];
  out[M10] = m[M10]; out[M11] = m[M11]; out[M12] = m[M12];
}

/**
 * Creates an identity matrix.
 */
// prettier-ignore
export function identity(out: NumberArray): void {
  out[M00] = 1; out[M01] = 0; out[M02] = 0;
  out[M10] = 0; out[M11] = 1; out[M12] = 0;
}

/**
 * Multiplies two 2x3 matrices: dst = a * b.
 */
// prettier-ignore
export function multiply(out: NumberArray, a: Readonly<NumberArray>, b: Readonly<NumberArray>): void {
  const a00 = a[M00], a01 = a[M01], a02 = a[M02];
  const a10 = a[M10], a11 = a[M11], a12 = a[M12];

  const b00 = b[M00], b01 = b[M01], b02 = b[M02];
  const b10 = b[M10], b11 = b[M11], b12 = b[M12];

  out[M00] = a00 * b00 + a01 * b10;
  out[M01] = a00 * b01 + a01 * b11;
  out[M02] = a00 * b02 + a01 * b12 + a02;
  out[M10] = a10 * b00 + a11 * b10;
  out[M11] = a10 * b01 + a11 * b11;
  out[M12] = a10 * b02 + a11 * b12 + a12;
}

/**
 * Creates a translation matrix.
 */
// prettier-ignore
export function setTranslation(out: NumberArray, v: Readonly<NumberArray>): void {
  out[M00] = 1; out[M01] = 0; out[M02] = v[0];
  out[M10] = 0; out[M11] = 1; out[M12] = v[1];
}

// prettier-ignore
export function translate(out: NumberArray, a: Readonly<NumberArray>, v: Readonly<NumberArray>): void {
  const a00 = a[M00], a01 = a[M01], a02 = a[M02];
  const a10 = a[M10], a11 = a[M11], a12 = a[M12];

  const x = v[0];
  const y = v[1];

  out[M00] = a00;
  out[M01] = a01;
  out[M02] = a02 + x * a00 + y * a01;
  out[M10] = a10;
  out[M11] = a11;
  out[M12] = a12 + x * a10 + y * a11;
}

///
///
/// Rotate
///
///

let lastAngle = NaN;
let lastCos = 0;
let lastSin = 0;

/**
 * Creates a rotation matrix.
 */
// prettier-ignore
export function setRotation(out: NumberArray, angle: Radians): void {
  if (angle !== lastAngle) {
    lastAngle = angle;
    lastCos = Math.cos(angle);
    lastSin = Math.sin(angle);
  }
  const c = lastCos;
  const s = lastSin;
  out[M00] =  c;  out[M01] = s;  out[M02] = 0;
  out[M10] = -s;  out[M11] = c;  out[M12] = 0;
}

/**
 * - Pre-multiplies by the rotation matrix: R * a
 * - Rotates around the global coordinate system origin
 * - The object's position affects its trajectory during rotation
 * - Useful when you want to rotate an object around the world origin
 */
// prettier-ignore
export function rotate(out: NumberArray, a: Readonly<NumberArray>, angle: Radians): void {
  const a00 = a[M00]; const a01 = a[M01]; const a02 = a[M02];
  const a10 = a[M10]; const a11 = a[M11]; const a12 = a[M12];

  if (angle !== lastAngle) {
    lastAngle = angle;
    lastCos = Math.cos(angle);
    lastSin = Math.sin(angle);
  }
  const c = lastCos;
  const s = lastSin;

  out[M00] = c * a00 + s * a10;
  out[M01] = c * a01 + s * a11;
  out[M02] = c * a02 + s * a12;
  out[M10] = -s * a00 + c * a10;
  out[M11] = -s * a01 + c * a11;
  out[M12] = -s * a02 + c * a12;
}

/**
 * - Post-multiplies by the rotation matrix: a * R
 * - Rotates around the object's current position
 * - Preserves the object's translation during rotation
 * - Useful when you want to rotate an object around its own axes
 */
// prettier-ignore
export function rotateLocal(out: NumberArray, a: Readonly<NumberArray>, angle: Radians): void {
  const a00 = a[M00]; const a01 = a[M01]; const a02 = a[M02];
  const a10 = a[M10]; const a11 = a[M11]; const a12 = a[M12];

  // Check if we've already calculated the sin and cos for this angle
  if (angle !== lastAngle) {
    lastAngle = angle;
    lastCos = Math.cos(angle);
    lastSin = Math.sin(angle);
  }
  const c = lastCos;
  const s = lastSin;

  // Post-multiply by the rotation matrix
  out[M00] = a00 * c - a01 * s;
  out[M01] = a00 * s + a01 * c;
  out[M02] = a02;
  out[M10] = a10 * c - a11 * s;
  out[M11] = a10 * s + a11 * c;
  out[M12] = a12;
}

/**
 * - Rotates a matrix around a specific point.
 * - T(px,py) * R(angle) * T(-px,-py) * A
 *
 * 1. Translate to Origin: Move the pivot point to the origin
 * 2. Rotate: Apply the rotation around the origin
 * 3. Translate Back: Move the pivot point back to its original position
 * @param out The output matrix
 * @param a The input matrix
 * @param angle The angle of rotation in radians
 * @param px The x-coordinate of the pivot point
 * @param py The y-coordinate of the pivot point
 */
// prettier-ignore
export function rotateAroundPoint(
  out: NumberArray,
  a: Readonly<NumberArray>,
  angle: Radians,
  point: Readonly<NumberArray>
): void {
  const a00 = a[M00]; const a01 = a[M01]; const a02 = a[M02];
  const a10 = a[M10]; const a11 = a[M11]; const a12 = a[M12];

  const px = point[0];
  const py = point[1];

  // Optimize by caching the trig functions if angle hasn't changed
  if (angle !== lastAngle) {
    lastAngle = angle;
    lastCos = Math.cos(angle);
    lastSin = Math.sin(angle);
  }
  const c = lastCos;
  const s = lastSin;

  // Calculate translation offsets to maintain the pivot point
  const tx = px * (1 - c) + py * s;
  const ty = py * (1 - c) - px * s;

  // Apply rotation and translation in the correct order
  out[M00] = c * a00 - s * a10;
  out[M01] = c * a01 - s * a11;
  out[M02] = c * a02 - s * a12 + tx;

  out[M10] = s * a00 + c * a10;
  out[M11] = s * a01 + c * a11;
  out[M12] = s * a02 + c * a12 + ty;
}

// prettier-ignore
export const setRotationFast = (out: NumberArray, angle: Radians): void => {
  const c = fastCos(angle);
  const s = fastSin(angle);
  out[M00] =  c;  out[M01] = s;  out[M02] = 0;
  out[M10] = -s;  out[M11] = c;  out[M12] = 0;
};

// prettier-ignore
export function rotateFast(out: NumberArray, a: Readonly<NumberArray>, angle: Radians): void {
  const a00 = a[M00], a01 = a[M01], a02 = a[M02];
  const a10 = a[M10], a11 = a[M11], a12 = a[M12];

  const c = fastCos(angle);
  const s = fastSin(angle);

  out[M00] = c * a00 + s * a10;
  out[M01] = c * a01 + s * a11;
  out[M02] = c * a02 + s * a12;
  out[M10] = -s * a00 + c * a10;
  out[M11] = -s * a01 + c * a11;
  out[M12] = -s * a02 + c * a12;
}

///
///
/// Scale
///
///

// prettier-ignore
export function setScale(out: NumberArray, scale: Readonly<NumberArray>): void {
  out[M00] = scale[0]; out[M01] = 0;        out[M02] = 0;
  out[M10] = 0;        out[M11] = scale[1]; out[M12] = 0;
}

export function scale(out: NumberArray, a: Readonly<NumberArray>, scale: Readonly<NumberArray>): void {
  const a00 = a[M00];
  const a01 = a[M01];
  const a02 = a[M02];
  const a10 = a[M10];
  const a11 = a[M11];
  const a12 = a[M12];

  out[M00] = scale[0] * a00;
  out[M01] = scale[0] * a01;
  out[M02] = scale[0] * a02;
  out[M10] = scale[1] * a10;
  out[M11] = scale[1] * a11;
  out[M12] = scale[1] * a12;
}

export function scaleScalar(out: NumberArray, a: Readonly<NumberArray>, scale: number): void {
  const a00 = a[M00];
  const a01 = a[M01];
  const a02 = a[M02];
  const a10 = a[M10];
  const a11 = a[M11];
  const a12 = a[M12];

  out[M00] = scale * a00;
  out[M01] = scale * a01;
  out[M02] = scale * a02;
  out[M10] = scale * a10;
  out[M11] = scale * a11;
  out[M12] = scale * a12;
}

/**
 * - Post-multiplies by the scaling matrix: a * S
 * - Scales within the object's local coordinate system
 * - Preserves the object's translation
 * - Useful when you want to scale an object without affecting its position
 */
// prettier-ignore
export function scaleLocal(out: NumberArray, a: Readonly<NumberArray>, scale: Readonly<NumberArray>): void {
  const a00 = a[M00]; const a01 = a[M01]; const a02 = a[M02];
  const a10 = a[M10]; const a11 = a[M11]; const a12 = a[M12];

  const sx = scale[0];
  const sy = scale[1];

  // Post-multiply by the scaling matrix
  out[M00] = a00 * sx;
  out[M01] = a01 * sy;
  out[M02] = a02;
  out[M10] = a10 * sx;
  out[M11] = a11 * sy;
  out[M12] = a12;
}

/**
 * - Scales a matrix around a specific point.
 * - T(px,py) * S(scale) * T(-px,-py) * A
 *
 * 1. Translate to Origin: Move the pivot point to the origin
 * 2. Scale: Apply the scaling around the origin
 * 3. Translate Back: Move the pivot point back to its original position
 *
 * @param out The output matrix
 * @param a The input matrix
 * @param scale The scale vector [sx, sy]
 * @param px The x-coordinate of the pivot point
 * @param py The y-coordinate of the pivot point
 */
// prettier-ignore
export function scaleAroundPoint(
  out: NumberArray,
  a: Readonly<NumberArray>,
  scale: Readonly<NumberArray>,
  point: Readonly<NumberArray>,

): void {
  const a00 = a[M00]; const a01 = a[M01]; const a02 = a[M02];
  const a10 = a[M10]; const a11 = a[M11]; const a12 = a[M12];
  
  const px = point[0];
  const py = point[1];

  const sx = scale[0];
  const sy = scale[1];
  
  // Calculate translation offsets to maintain the pivot point
  const tx = px * (1 - sx);
  const ty = py * (1 - sy);
  
  // Apply scaling and translation in the correct order
  out[M00] = sx * a00;
  out[M01] = sx * a01;
  out[M02] = sx * a02 + tx;
  
  out[M10] = sy * a10;
  out[M11] = sy * a11;
  out[M12] = sy * a12 + ty;
}

///
///

/**
 * Transforms a point by a matrix.
 *
 * @param out The output vector.
 * @param m The matrix.
 * @param v The input vector.
 */
export function transformPoint(out: NumberArray, m: Readonly<NumberArray>, v: Readonly<NumberArray>): void {
  const x = v[v2.X];
  const y = v[v2.Y];
  out[v2.X] = x * m[M00] + y * m[M10] + m[M02];
  out[v2.Y] = x * m[M01] + y * m[M11] + m[M12];
}

// prettier-ignore
export function inverse(out: NumberArray): void {
  const a = out[M00];
  const b = out[M01];
  const c = out[M02];
  const d = out[M10];
  const e = out[M11];
  const f = out[M12];

  const det = a * e - b * d;
  if (det === 0) {
    console.error('m2x3.affineInverse: determinant is 0!');
    return identity(out);
  }
  const invDet = 1 / det;

  out[M00] = e * invDet;
  out[M01] = -b * invDet;
  out[M02] = (b * f - e * c) * invDet;
  out[M10] = -d * invDet;
  out[M11] = a * invDet;
  out[M12] = (d * c - a * f) * invDet;
}

/**
 * Gets the origin from a matrix (translation).
 */
export const getOrigin = (out: NumberArray, m: Readonly<NumberArray>) => {
  out[v2.X] = m[M02];
  out[v2.Y] = m[M12];
};

/**
 * Gets the rotation from a matrix.
 */
export const getRotation = (m: Readonly<NumberArray>): Radians => {
  return Math.atan2(m[M01], m[M00]) as Radians;
};

/**
 * Gets the scale from a matrix.
 */
export const getScale = (dst: NumberArray, m: Readonly<NumberArray>): void => {
  dst[v2.X] = Math.hypot(m[M00], m[M10]);
  dst[v2.Y] = Math.hypot(m[M01], m[M11]);
};

// prettier-ignore
export function determinant(m: Readonly<NumberArray>): number {
  return m[M00] * m[M11] - m[M01] * m[M10];
}

/**
 * Checks if the matrix is conformal.
 */
export const isConformal = (m: Readonly<NumberArray>): boolean => {
  const a = m[M00];
  const b = m[M01];
  const d = m[M10];
  const e = m[M11];

  return Math.abs(a * e - b * d) > 0;
};

// prettier-ignore
export function isEqual(a: Readonly<NumberArray>, b: Readonly<NumberArray>): boolean {
  return (
    a[M00] === b[M00] &&
    a[M01] === b[M01] &&
    a[M02] === b[M02] &&
    a[M10] === b[M10] &&
    a[M11] === b[M11] &&
    a[M12] === b[M12]
  );
}

// prettier-ignore
export function isEqualEpsilon(a: Readonly<NumberArray>, b: Readonly<NumberArray>, epsilon: number): boolean {
  return (
    Math.abs(a[M00] - b[M00]) < epsilon &&
    Math.abs(a[M01] - b[M01]) < epsilon &&
    Math.abs(a[M02] - b[M02]) < epsilon &&
    Math.abs(a[M10] - b[M10]) < epsilon &&
    Math.abs(a[M11] - b[M11]) < epsilon &&
    Math.abs(a[M12] - b[M12]) < epsilon
  );
}

/**
 * Creates a matrix that 'looks at' a target.
 */
export const lookingAt = (out: NumberArray, eye: Readonly<NumberArray>, target: Readonly<NumberArray>): void => {
  const dx = target[v2.X] - eye[v2.X];
  const dy = target[v2.Y] - eye[v2.Y];
  const angle = Math.atan2(dy, dx) as Radians;

  setRotation(out, angle);
  out[M02] = eye[0];
  out[M12] = eye[1];
};

/**
 * Creates a shear matrix.
 */
export const createShear = (out: NumberArray, shear: Readonly<NumberArray>): void => {
  out[M00] = 1;
  out[M01] = shear[v2.Y];
  out[M02] = 0;
  out[M10] = shear[v2.X];
  out[M11] = 1;
  out[M12] = 0;
};

/**
 * Applies shear to a 2x3 matrix.
 */
export const applyShear = (out: NumberArray, m: Readonly<NumberArray>, shear: Readonly<NumberArray>): void => {
  const shearX = shear[0];
  const shearY = shear[1];

  const m0 = m[M00];
  const m1 = m[M01];
  const m3 = m[M10];
  const m4 = m[M11];

  out[M00] = m0 + shearY * m3;
  out[M01] = m1 + shearY * m4;
  out[M02] = m[M02];
  out[M10] = shearX * m0 + m3;
  out[M11] = shearX * m1 + m4;
  out[M12] = m[M12];
};

/**
 * Composes individual transformations (translation, rotation, and scale) into a single 2x3 matrix.
 *
 * @param out The matrix to store the result.
 * @param translation The translation vector.
 * @param rotation The rotation angle in radians.
 * @param scale The scale vector.
 */
export const compose = (
  out: NumberArray,
  translation: Readonly<NumberArray>,
  rotation: Readonly<NumberArray>,
  scale: Readonly<NumberArray>
): void => {
  if (rotation[0] !== lastAngle) {
    lastAngle = rotation[0];
    lastCos = Math.cos(rotation[0]);
    lastSin = Math.sin(rotation[0]);
  }
  const c = lastCos;
  const s = lastSin;
  const sx = scale[0];
  const sy = scale[0];

  out[M00] = c * sx;
  out[M01] = s * sx;
  out[M02] = translation[v2.X];
  out[M10] = -s * sy;
  out[M11] = c * sy;
  out[M12] = translation[v2.Y];
};

export function decompose(
  m: Readonly<NumberArray>,
  translation: NumberArray,
  rotation: NumberArray,
  scale: NumberArray
): void {
  translation[v2.X] = m[M02];
  translation[v2.Y] = m[M12];
  scale[0] = Math.max(Math.hypot(m[M00], m[M10]), Math.hypot(m[M01], m[M11]));
  rotation[0] = Math.atan2(m[M01], m[M00]) as Radians;
}

/**
 * Linearly interpolates between two 2x3 matrices.
 * @param a The starting matrix.
 * @param b The ending matrix.
 * @param t The interpolation factor (0 to 1).
 */
export const lerp = (out: NumberArray, a: Readonly<NumberArray>, b: Readonly<NumberArray>, t: number) => {
  out[M00] = a[M00] + t * (b[M00] - a[M00]);
  out[M01] = a[M01] + t * (b[M01] - a[M01]);
  out[M02] = a[M02] + t * (b[M02] - a[M02]);
  out[M10] = a[M10] + t * (b[M10] - a[M10]);
  out[M11] = a[M11] + t * (b[M11] - a[M11]);
  out[M12] = a[M12] + t * (b[M12] - a[M12]);
};

/// WEBGL ///

/**
 * Converts a 2x3 matrix to a 3x3 matrix and then to a WebGL compatible Float32Array.
 *
 * WebGL uses column-major order, so this function also transposes the matrix.
 * [
 *  M00, M10, 0,
 *  M01, M11, 0,
 *  M02, M12, 1
 * ]
 */
// prettier-ignore
export function toWebglMat3(m: Readonly<NumberArray>, dst: NumberArray) {
  dst[0] = m[M00]; dst[1] = m[M10]; dst[2] = 0;      
  dst[3] = m[M01]; dst[4] = m[M11]; dst[5] = 0;      
  dst[6] = m[M02]; dst[7] = m[M12]; dst[8] = 1;      
}

/**
 * Converts a 2x3 matrix to a WebGL compatible Float32Array with std140 padding.
 *
 * WebGL uses column-major order, so this function also transposes the matrix.
 * std140 requires padding to vec4.
 *
 * [
 *  M00, M10, 0, padding,
 *  M01, M11, 0, padding,
 *  M02, M12, 1, padding
 * ]
 */
// prettier-ignore
export function toWebglMat3Std140(m: Readonly<NumberArray>, dst: NumberArray): void {
  dst[0] = m[M00];  dst[1] = m[M10];  dst[2] = 0;   dst[3] = 0;        
  dst[4] = m[M01];  dst[5] = m[M11];  dst[6] = 0;   dst[7] = 0;        
  dst[8] = m[M02];  dst[9] = m[M12];  dst[10] = 1;  dst[11] = 0;       
}

/// CSS MATRIX ///

/**
 * Converts a 2x3 matrix to a CSS matrix() string.
 * ```
 * [ a c tx
 *   b d ty ]
 * ```
 */
export function toCssMatrix(m: Readonly<NumberArray>): string {
  return `matrix(${m[M00]}, ${m[M10]}, ${m[M01]}, ${m[M11]}, ${m[M02]}, ${m[M12]})`;
}

/**
 * Converts a 2x3 matrix to a CSS matrix3d() string.
 */
export function toCssMatrix3d(m: Readonly<NumberArray>): string {
  return (
    `matrix3d(` +
    `${m[M00]}, ${m[M01]}, 0, 0,` +
    `${m[M10]}, ${m[M11]}, 0, 0,` +
    `0, 0, 1, 0,` +
    `${m[M02]}, ${m[M12]}, 0, 1` +
    `)`
  );
}

export function fromCssMatrix(out: NumberArray, m: string): void {
  const values = m
    .replace(/matrix\(/, '')
    .replace(/\)/, '')
    .split(',');

  out[M00] = parseFloat(values[0]);
  out[M01] = parseFloat(values[1]);
  out[M10] = parseFloat(values[2]);
  out[M11] = parseFloat(values[3]);
  out[M02] = parseFloat(values[4]);
  out[M12] = parseFloat(values[5]);
}

export function fromCssMatrix3d(out: NumberArray, m: string): void {
  const values = m
    .replace(/matrix3d\(/, '')
    .replace(/\)/, '')
    .split(',');

  out[M00] = parseFloat(values[0]);
  out[M01] = parseFloat(values[1]);
  out[M10] = parseFloat(values[4]);
  out[M11] = parseFloat(values[5]);
  out[M02] = parseFloat(values[12]);
  out[M12] = parseFloat(values[13]);
}

export function toString(m: Readonly<NumberArray>): string {
  return `mat2x3(${m[M00]}, ${m[M01]}, ${m[M02]}, ${m[M10]}, ${m[M11]}, ${m[M12]})`;
}
