import { Mat3Builder, Mat3Tuple } from './m3-builder';
import { NumberArray } from './utils/typed-array';

/*#__PURE__*/
export class FMat3 extends Mat3Builder(Float32Array) {}

export type { Mat3Tuple };

const M00 = 0;
const M01 = 1;
/** X */
const M02 = 2;
const M10 = 3;
const M11 = 4;
/** Y */
const M12 = 5;
const M20 = 6;
const M21 = 7;
/** Z */
const M22 = 8;

function set(
  out: Mat3Tuple,
  m00: number,
  m01: number,
  m02: number,
  m10: number,
  m11: number,
  m12: number,
  m20: number,
  m21: number,
  m22: number
): void {
  out[M00] = m00;
  out[M01] = m01;
  out[M02] = m02;
  out[M10] = m10;
  out[M11] = m11;
  out[M12] = m12;
  out[M20] = m20;
  out[M21] = m21;
  out[M22] = m22;
}

function copy(out: Mat3Tuple, m: Readonly<Mat3Tuple>): void {
  out[M00] = m[M00];
  out[M01] = m[M01];
  out[M02] = m[M02];
  out[M10] = m[M10];
  out[M11] = m[M11];
  out[M12] = m[M12];
  out[M20] = m[M20];
  out[M21] = m[M21];
  out[M22] = m[M22];
}

function identity(out: Mat3Tuple): void {
  out[M00] = 1;
  out[M01] = 0;
  out[M02] = 0;
  out[M10] = 0;
  out[M11] = 1;
  out[M12] = 0;
  out[M20] = 0;
  out[M21] = 0;
  out[M22] = 1;
}

// prettier-ignore
function translate(out: Mat3Tuple, a: Mat3Tuple, v: NumberArray): Mat3Tuple {
  const a00 = a[M00]; const a01 = a[M01]; const a02 = a[M02];
  const a10 = a[M10]; const a11 = a[M11]; const a12 = a[M12];
  const a20 = a[M20]; const a21 = a[M21]; const a22 = a[M22];

  const x = v[0];
  const y = v[1];

  out[M00] = a00;
  out[M01] = a01;
  out[M02] = a02;

  out[M10] = a10;
  out[M11] = a11;
  out[M12] = a12;

  out[M20] = x * a00 + y * a10 + a20;
  out[M21] = x * a01 + y * a11 + a21;
  out[M22] = x * a02 + y * a12 + a22;
  return out;
}

export class Mat3<T extends NumberArray = NumberArray> {
  static ELEMENTS = 9;

  constructor(public value: T = new Float32Array(9) as unknown as T) {}

  static create(): Mat3<Float32Array> {
    return new Mat3().identity() as Mat3<Float32Array>;
  }

  /**
   * Set the components of a mat3 to the given values
   */
  // prettier-ignore
  set(
    m00: number, m01: number, m02: number,
    m10: number, m11: number, m12: number,
    m20: number, m21: number, m22: number,
  ): this {
    set(this.value, m00, m01, m02, m10, m11, m12, m20, m21, m22);
    return this;
  }

  /**
   * Copy the values from one mat3 to another
   * @param m the source matrix
   */
  copy(m: Readonly<Mat3>): this {
    copy(this.value, m.value);
    return this;
  }

  /**
   * Set a mat3 to the identity matrix
   */
  identity(): this {
    identity(this.value);
    return this;
  }

  /**
   * Translate a mat3 by the given vector
   * @param v vector to translate by
   * @param m the matrix to translate
   */
  translate(v: NumberArray, m: Mat3 = this): this {
    translate(this.value, m.value, v);
    return this;
  }
}
