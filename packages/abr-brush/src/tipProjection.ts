import { multiplyAdd as fma } from './tipMath';
import type { TipVertex } from './tipPolygon';

/** Projects a prepared primary tip through Photoshop's brush camera.
 * Vertices already include roundness, placement and UV flips. Angles are degrees;
 * tablet axes are Photoshop's normalized physical X/Y values, not browser degrees.
 * A missing tablet follows the original null-device branch. The result requires
 * perspective sampling: divide the interpolated source coordinates by weight.
 * This is separate from the affine raster path and does not select its mip level.
 */
export function projectTipQuad(
  vertices: readonly TipVertex[], center: { x: number; y: number }, scale: number,
  angles: { stored: number; jitter: number; control: number },
  tablet?: { tiltX: number; tiltY: number; rotation: number }
): ProjectedTipVertex[] {
  if (!vertices.length || scale <= 0) return [];
  let extent = 0;
  for (const [x, y] of vertices) extent = Math.max(extent, Math.abs(x - center.x), Math.abs(y - center.y));
  if (extent === 0) return [];
  let azimuth = 0, tilt = 0, barrel = 0;
  if (tablet) {
    const x = Math.tan(tablet.tiltX * 1.117010721276371);
    const y = Math.tan(tablet.tiltY * -1.117010721276371);
    tilt = Math.min(1.117010721276371, 1.5707963705062866 - Math.atan(1 / Math.sqrt(fma(x, x, y * y))));
    azimuth = Math.atan2(y, x);
    barrel = (Math.fround(Math.fround(360 - Math.fround(tablet.rotation)) - Math.fround(angles.stored)) - angles.jitter) * Math.PI / 180;
  }
  const turn = multiplyQuaternion(multiplyQuaternion(
    multiplyQuaternion(axisQuaternion(2, (azimuth - angles.control * Math.PI / 180) * .5), axisQuaternion(1, tilt * .5)),
    axisQuaternion(2, azimuth * -.5)), axisQuaternion(2, barrel * .5));
  const direction = rotateVector(turn, [0, 0, -1]);
  const up = rotateVector(turn, [0, 1, 0]);
  const tangent = Math.tan(.3490658700466156);
  const distance = extent * -Math.SQRT2 / tangent * scale;
  const eye: Vector3 = [center.x + direction[0] * distance, center.y + direction[1] * distance, direction[2] * distance];
  // Keep the original angle round trip and matrix order. Algebraic shortcuts
  // change values at scan-conversion boundaries, especially with neutral tilt.
  const degrees = Math.atan(tangent / Math.SQRT2) * 180 / Math.PI;
  const slope = Math.tan((degrees + degrees) * Math.PI / 180 * .5);
  const lens = 2 / (slope + slope);
  const perspective = [lens, 0, 0, 0, 0, lens, 0, 0,
    0, 0, -1.02020202020202, -1, 0, 0, -2.0202020202020203, 0];
  const matrix = multiplyMatrix(lookAt(eye, [center.x, center.y, 0], up), perspective);
  const inverse = invertMatrix(matrix);
  return vertices.map(([x, y, u, v]) => {
    const point = transformVector([(x - center.x) / extent, (y - center.y) / extent, 0, 1], inverse);
    const ray = point.map(value => value / point[3]!);
    const factor = eye[2] / (eye[2] - ray[2]!);
    const px = eye[0] + (ray[0]! - eye[0]) * factor;
    const py = eye[1] + (ray[1]! - eye[1]) * factor;
    const q = transformVector([px, py, 0, 1], matrix)[3]!;
    return [px, py, u * q, v * q, q];
  });
}

/** Destination position, weighted level-zero coordinates, and perspective weight. */
export type ProjectedTipVertex = readonly [x: number, y: number, sourceX: number, sourceY: number, weight: number];

type Vector3 = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];

function axisQuaternion(axis: 1 | 2, halfAngle: number): Quaternion {
  const q: [number, number, number, number] = [0, 0, 0, Math.cos(halfAngle)];
  q[axis] = Math.sin(halfAngle);
  return normalizeQuaternion(q);
}

function multiplyQuaternion(a: Quaternion, b: Quaternion): Quaternion {
  return normalizeQuaternion([
    fma(-b[1], a[2], fma(b[2], a[1], fma(b[0], a[3], a[0] * b[3]))),
    fma(-b[2], a[0], fma(b[0], a[2], fma(b[1], a[3], b[3] * a[1]))),
    fma(-b[0], a[1], fma(b[1], a[0], fma(b[2], a[3], b[3] * a[2]))),
    fma(-b[2], a[2], fma(-b[1], a[1], fma(b[0], -a[0], b[3] * a[3])))
  ]);
}

function normalizeQuaternion(q: Quaternion): Quaternion {
  let square = 0;
  for (const value of q) square = fma(value, value, square);
  const length = Math.sqrt(square);
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

function rotateVector(q: Quaternion, v: Vector3): Vector3 {
  const [x, y, z, w] = q, [a, b, c] = v;
  const rx = fma(-z, b, fma(y, c, fma(x, 0, w * a)));
  const ry = fma(-x, c, fma(z, a, fma(y, 0, w * b)));
  const rz = fma(-y, a, fma(x, b, fma(z, 0, w * c)));
  const rw = fma(-z, c, fma(-y, b, fma(x, -a, w * 0)));
  return [fma(y, rz, fma(-z, ry, fma(-x, rw, w * rx))),
    fma(z, rx, fma(-x, rz, fma(-y, rw, w * ry))),
    fma(x, ry, fma(-y, rx, fma(-z, rw, w * rz)))];
}

function lookAt(eye: Vector3, center: Vector3, up: Vector3): number[] {
  const z = unitVector([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
  const cross = (a: Vector3, b: Vector3): Vector3 => [fma(a[1], b[2], -a[2] * b[1]),
    fma(a[2], b[0], -a[0] * b[2]), fma(a[0], b[1], -a[1] * b[0])];
  const side = cross(up, z), vertical = cross(z, side);
  const x = unitVector(side), y = unitVector(vertical);
  const translation = (axis: Vector3) => fma(-axis[2], eye[2], fma(-axis[0], eye[0], axis[1] * -eye[1]));
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    translation(x), translation(y), translation(z), 1];
}

function unitVector(v: Vector3): Vector3 {
  let square = 0;
  for (const value of v) square = fma(value, value, square);
  if (square <= 1e-12) return [0, 0, 0];
  const reciprocal = 1 / Math.sqrt(square);
  return [v[0] * reciprocal, v[1] * reciprocal, v[2] * reciprocal];
}

function multiplyMatrix(a: readonly number[], b: readonly number[]): number[] {
  return Array.from({ length: 16 }, (_, index) => {
    let value = 0;
    for (let k = 0; k < 4; k++) value = fma(a[Math.floor(index / 4) * 4 + k]!, b[k * 4 + index % 4]!, value);
    return value;
  });
}

function transformVector(v: readonly number[], matrix: readonly number[]): number[] {
  return Array.from({ length: 4 }, (_, column) => {
    let value = 0;
    for (let k = 0; k < 4; k++) value = fma(v[k]!, matrix[k * 4 + column]!, value);
    return value;
  });
}

/** Cofactor order follows the original inverse; a generic solver rounds differently. */
function invertMatrix(matrix: readonly number[]): number[] {
  const inverse = new Array<number>(16);
  let determinant = 0;
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      const minor: number[] = [];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        if (y !== row && x !== column) minor.push(matrix[y * 4 + x]!);
      }
      const [a, b, c, d, e, f, g, h, i] = minor as [number, number, number, number, number, number, number, number, number];
      let cofactor = fma(a * e, i, d * h * c);
      cofactor = fma(g * b, f, cofactor);
      cofactor = fma(h * -a, f, cofactor);
      cofactor = fma(b * -d, i, cofactor);
      cofactor = fma(e * -g, c, cofactor);
      if ((row + column) & 1) cofactor = -cofactor;
      inverse[column * 4 + row] = cofactor;
      if (column === 0) determinant = fma(matrix[row * 4]!, cofactor, determinant);
    }
  }
  return inverse.map(value => value / determinant);
}
