import { Quaternion } from './Quaternion';

const _lut: string[] = [];
for (let i = 0; i < 256; i++) {
  _lut[i] = (i < 16 ? '0' : '') + i.toString(16);
}

let _seed = 1234567;

/**
 * Two Pi.
 *
 * @static
 * @member {number}
 */
export const PI_2 = Math.PI * 2;

/**
 * Conversion factor for converting degrees to radians.
 *
 * @static
 * @member {number}
 */
export const DEG_TO_RAD = Math.PI / 180;

/**
 * Conversion factor for converting radians to degrees.
 *
 * @static
 * @member {number} RAD_TO_DEG
 */
export const RAD_TO_DEG = 180 / Math.PI;

// http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
export function generateUUID(): string {
  const d0 = (Math.random() * 0xffffffff) | 0;
  const d1 = (Math.random() * 0xffffffff) | 0;
  const d2 = (Math.random() * 0xffffffff) | 0;
  const d3 = (Math.random() * 0xffffffff) | 0;
  const uuid =
    _lut[d0 & 0xff] +
    _lut[(d0 >> 8) & 0xff] +
    _lut[(d0 >> 16) & 0xff] +
    _lut[(d0 >> 24) & 0xff] +
    '-' +
    _lut[d1 & 0xff] +
    _lut[(d1 >> 8) & 0xff] +
    '-' +
    _lut[((d1 >> 16) & 0x0f) | 0x40] +
    _lut[(d1 >> 24) & 0xff] +
    '-' +
    _lut[(d2 & 0x3f) | 0x80] +
    _lut[(d2 >> 8) & 0xff] +
    '-' +
    _lut[(d2 >> 16) & 0xff] +
    _lut[(d2 >> 24) & 0xff] +
    _lut[d3 & 0xff] +
    _lut[(d3 >> 8) & 0xff] +
    _lut[(d3 >> 16) & 0xff] +
    _lut[(d3 >> 24) & 0xff];

  // .toLowerCase() here flattens concatenated strings to save heap memory space.
  return uuid.toLowerCase();
}

/**
 * Clamps the x to be between a and b.
 *
 * @param value Value to be clamped.
 * @param min Minimum value
 * @param max Maximum value.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// compute euclidean modulo of m % n
// https://en.wikipedia.org/wiki/Modulo_operation
export function euclideanModulo(n: number, m: number): number {
  return ((n % m) + m) % m;
}

// Linear mapping from range <a1, a2> to range <b1, b2>
/**
 * Linear mapping of x from range [a1, a2] to range [b1, b2].
 *
 * @param x Value to be mapped.
 * @param a1 Minimum value for range A.
 * @param a2 Maximum value for range A.
 * @param b1 Minimum value for range B.
 * @param b2 Maximum value for range B.
 */
export function mapLinear(
  x: number,
  a1: number,
  a2: number,
  b1: number,
  b2: number
): number {
  return b1 + ((x - a1) * (b2 - b1)) / (a2 - a1);
}

// https://www.gamedev.net/tutorials/programming/general-and-gameplay-programming/inverse-lerp-a-super-useful-yet-often-overlooked-function-r5230/
export function inverseLerp(x: number, y: number, value: number): number {
  if (x !== y) {
    return (value - x) / (y - x);
  } else {
    return 0;
  }
}

// https://en.wikipedia.org/wiki/Linear_interpolation
/**
 * Returns a value linearly interpolated from two known points based
 * on the given interval - t = 0 will return x and t = 1 will return y.
 *
 * @param x Start point.
 * @param y End point.
 * @param t interpolation factor in the closed interval [0, 1]
 */
export function lerp(x: number, y: number, t: number): number {
  return (1 - t) * x + t * y;
}

// http://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/
/**
 * Smoothly interpolate a number from x toward y in a spring-like
 * manner using the dt to maintain frame rate independent movement.
 *
 * @param x Current point.
 * @param y Target point.
 * @param lambda A higher lambda value will make the movement more sudden, and a lower value will make the movement more gradual.
 * @param dt Delta time in seconds.
 */
export function damp(x: number, y: number, lambda: number, dt: number): number {
  return lerp(x, y, 1 - Math.exp(-lambda * dt));
}

// https://www.desmos.com/calculator/vcsjnyz7x4
/**
 * Returns a value that alternates between 0 and length.
 *
 * @param x The value to pingpong.
 * @param length The positive value the export function will pingpong to. Default is 1.
 */
export function pingpong(x: number, length: number = 1): number {
  return length - Math.abs(euclideanModulo(x, length * 2) - length);
}

// http://en.wikipedia.org/wiki/Smoothstep
export function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;

  x = (x - min) / (max - min);

  return x * x * (3 - 2 * x);
}

export function smootherstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;

  x = (x - min) / (max - min);

  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Random integer from low to high interval.
 */
export function randInt(low: number, high: number): number {
  return low + Math.floor(Math.random() * (high - low + 1));
}

/**
 * Random float from low to high interval.
 */
export function randFloat(low: number, high: number): number {
  return low + Math.random() * (high - low);
}

/**
 * Random float from - range / 2 to range / 2 interval.
 */
export function randFloatSpread(range: number): number {
  return range * (0.5 - Math.random());
}

/**
 * Deterministic pseudo-random float in the interval [ 0, 1 ].
 */
export function seededRandom(s?: number): number {
  if (s !== undefined) _seed = s;

  // Mulberry32 generator

  let t = (_seed += 0x6d2b79f5);

  t = Math.imul(t ^ (t >>> 15), t | 1);

  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function degToRad(degrees: number): number {
  return degrees * DEG_TO_RAD;
}

export function radToDeg(radians: number): number {
  return radians * RAD_TO_DEG;
}

export function isPowerOfTwo(value: number): boolean {
  return (value & (value - 1)) === 0 && value !== 0;
}

export function ceilPowerOfTwo(value: number): number {
  return Math.pow(2, Math.ceil(Math.log(value) / Math.LN2));
}

export function floorPowerOfTwo(value: number): number {
  return Math.pow(2, Math.floor(Math.log(value) / Math.LN2));
}

export function setQuaternionFromProperEuler(
  q: Quaternion,
  a: number,
  b: number,
  c: number,
  order: string
): void {
  // Intrinsic Proper Euler Angles - see https://en.wikipedia.org/wiki/Euler_angles

  // rotations are applied to the axes in the order specified by 'order'
  // rotation by angle 'a' is applied first, then by angle 'b', then by angle 'c'
  // angles are in radians

  const cos = Math.cos;
  const sin = Math.sin;

  const c2 = cos(b / 2);
  const s2 = sin(b / 2);

  const c13 = cos((a + c) / 2);
  const s13 = sin((a + c) / 2);

  const c1_3 = cos((a - c) / 2);
  const s1_3 = sin((a - c) / 2);

  const c3_1 = cos((c - a) / 2);
  const s3_1 = sin((c - a) / 2);

  switch (order) {
    case 'XYX':
      q.set(c2 * s13, s2 * c1_3, s2 * s1_3, c2 * c13);
      break;

    case 'YZY':
      q.set(s2 * s1_3, c2 * s13, s2 * c1_3, c2 * c13);
      break;

    case 'ZXZ':
      q.set(s2 * c1_3, s2 * s1_3, c2 * s13, c2 * c13);
      break;

    case 'XZX':
      q.set(c2 * s13, s2 * s3_1, s2 * c3_1, c2 * c13);
      break;

    case 'YXY':
      q.set(s2 * c3_1, c2 * s13, s2 * s3_1, c2 * c13);
      break;

    case 'ZYZ':
      q.set(s2 * s3_1, s2 * c3_1, c2 * s13, c2 * c13);
      break;

    default:
      console.warn(
        'THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: ' +
          order
      );
  }
}

export function denormalize(
  value: number,
  array: Float32Array | Uint16Array | Uint8Array | Int16Array | Int8Array
) {
  switch (array.constructor) {
    case Float32Array:
      return value;

    case Uint16Array:
      return value / 65535.0;

    case Uint8Array:
      return value / 255.0;

    case Int16Array:
      return Math.max(value / 32767.0, -1.0);

    case Int8Array:
      return Math.max(value / 127.0, -1.0);

    default:
      throw new Error('Invalid component type.');
  }
}

export function normalize(
  value: number,
  array: Float32Array | Uint16Array | Uint8Array | Int16Array | Int8Array
) {
  switch (array.constructor) {
    case Float32Array:
      return value;

    case Uint16Array:
      return Math.round(value * 65535.0);

    case Uint8Array:
      return Math.round(value * 255.0);

    case Int16Array:
      return Math.round(value * 32767.0);

    case Int8Array:
      return Math.round(value * 127.0);

    default:
      throw new Error('Invalid component type.');
  }
}
