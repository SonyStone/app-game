import * as Mat3Func from './functions/mat-3-func';
import { Mat4Tuple } from './mat-4';
import { QuatTuple } from './quat';
import { Vec2Tuple } from './vec-2';
import { Vec3Tuple } from './vec-3';

export type Mat3Tuple =
  | [
      m00: number,
      m01: number,
      m02: number,
      m10: number,
      m11: number,
      m12: number,
      m20: number,
      m21: number,
      m22: number
    ]
  | number[];

export class Mat3 extends Array {
  constructor(m00 = 1, m01 = 0, m02 = 0, m10 = 0, m11 = 1, m12 = 0, m20 = 0, m21 = 0, m22 = 1) {
    // @ts-ignore
    super(m00, m01, m02, m10, m11, m12, m20, m21, m22);
    return this;
  }

  set(
    m00: number | Mat3Tuple,
    m01: number,
    m02: number,
    m10: number,
    m11: number,
    m12: number,
    m20: number,
    m21: number,
    m22: number
  ): this {
    if ((m00 as Mat3Tuple).length) {
      return this.copy(m00 as Mat3Tuple);
    }
    Mat3Func.set(this, m00 as number, m01, m02, m10, m11, m12, m20, m21, m22);
    return this;
  }

  translate(v: Vec2Tuple, m: Mat3Tuple = this): this {
    Mat3Func.translate(this, m, v);
    return this;
  }

  rotate(v: number, m: Mat3Tuple = this): this {
    Mat3Func.rotate(this, m, v);
    return this;
  }

  scale(v: Vec2Tuple, m = this): this {
    Mat3Func.scale(this, m, v);
    return this;
  }

  multiply(ma: Mat3Tuple, mb: Mat3Tuple): this {
    if (mb) {
      Mat3Func.multiply(this, ma, mb);
    } else {
      Mat3Func.multiply(this, this, ma);
    }
    return this;
  }

  identity(): this {
    Mat3Func.identity(this);
    return this;
  }

  copy(m: Mat3Tuple): this {
    Mat3Func.copy(this, m);
    return this;
  }

  fromMatrix4(m: Mat3Tuple): this {
    Mat3Func.fromMat4(this, m);
    return this;
  }

  fromQuaternion(q: QuatTuple): this {
    Mat3Func.fromQuat(this, q);
    return this;
  }

  fromBasis(vec3a: Vec3Tuple, vec3b: Vec3Tuple, vec3c: Vec3Tuple): this {
    this.set(vec3a[0], vec3a[1], vec3a[2], vec3b[0], vec3b[1], vec3b[2], vec3c[0], vec3c[1], vec3c[2]);
    return this;
  }

  inverse(m: Mat3Tuple = this): this {
    Mat3Func.invert(this, m);
    return this;
  }

  getNormalMatrix(m: Mat4Tuple): this {
    Mat3Func.normalFromMat4(this, m);
    return this;
  }
}
