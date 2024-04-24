import { AttributeData } from '../core/geometry';
import * as Mat4Func from './functions/mat-4-func';
import { QuatTuple } from './quat';
import { Vec3Tuple } from './vec-3';
import { Vec4Tuple } from './vec-4';

export type Mat4Tuple =
  | [
      m00: number,
      m01: number,
      m02: number,
      m03: number,
      m10: number,
      m11: number,
      m12: number,
      m13: number,
      m20: number,
      m21: number,
      m22: number,
      m23: number,
      m30: number,
      m31: number,
      m32: number,
      m33: number
    ]
  | number[];

export class Mat4 extends Array {
  constructor(
    m00 = 1,
    m01 = 0,
    m02 = 0,
    m03 = 0,

    m10 = 0,
    m11 = 1,
    m12 = 0,
    m13 = 0,

    m20 = 0,
    m21 = 0,
    m22 = 1,
    m23 = 0,

    m30 = 0,
    m31 = 0,
    m32 = 0,
    m33 = 1
  ) {
    // @ts-ignore
    super(m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33);

    return this;
  }

  get x() {
    return this[12];
  }

  get y() {
    return this[13];
  }

  get z() {
    return this[14];
  }

  get w() {
    return this[15];
  }

  set x(v) {
    this[12] = v;
  }

  set y(v) {
    this[13] = v;
  }

  set z(v) {
    this[14] = v;
  }

  set w(v) {
    this[15] = v;
  }

  set(m00: Mat4Tuple): this;
  set(
    m00: number,
    m01: number,
    m02: number,
    m03: number,
    m10: number,
    m11: number,
    m12: number,
    m13: number,
    m20: number,
    m21: number,
    m22: number,
    m23: number,
    m30: number,
    m31: number,
    m32: number,
    m33: number
  ): this;
  set(
    m00: number | Mat4Tuple,
    m01?: number,
    m02?: number,
    m03?: number,
    m10?: number,
    m11?: number,
    m12?: number,
    m13?: number,
    m20?: number,
    m21?: number,
    m22?: number,
    m23?: number,
    m30?: number,
    m31?: number,
    m32?: number,
    m33?: number
  ): this {
    if (Array.isArray(m00)) {
      return this.copy(m00 as Mat4Tuple);
    }
    Mat4Func.set(this, m00, m01!, m02!, m03!, m10!, m11!, m12!, m13!, m20!, m21!, m22!, m23!, m30!, m31!, m32!, m33!);
    return this;
  }

  translate(v: Vec3Tuple, m: Mat4Tuple = this): this {
    Mat4Func.translate(this, m, v);
    return this;
  }

  rotate(v: number, axis: Vec3Tuple, m: Mat4Tuple = this): this {
    Mat4Func.rotate(this, m, v, axis);
    return this;
  }

  scale(v: Vec3Tuple | number, m: Mat4Tuple = this): this {
    Mat4Func.scale(this, m, typeof v === 'number' ? [v, v, v] : v);
    return this;
  }

  add(ma: Mat4, mb: Mat4): this {
    if (mb) {
      Mat4Func.add(this, ma, mb);
    } else {
      Mat4Func.add(this, this, ma);
    }
    return this;
  }

  sub(ma: Mat4, mb: Mat4): this {
    if (mb) {
      Mat4Func.subtract(this, ma, mb);
    } else {
      Mat4Func.subtract(this, this, ma);
    }
    return this;
  }

  multiply(ma: Mat4Tuple | number, mb?: Mat4Tuple): this {
    if (!(ma as Mat4Tuple).length) {
      Mat4Func.multiplyScalar(this, this, ma as number);
    } else if (mb) {
      Mat4Func.multiply(this, ma as Mat4Tuple, mb);
    } else {
      Mat4Func.multiply(this, this, ma as Mat4Tuple);
    }
    return this;
  }

  multiplyVec4<T extends Vec4Tuple>(v: Vec4Tuple, dest: T = [0, 0, 0, 0] as T): T {
    const x = v[0];
    const y = v[1];
    const z = v[2];
    const w = v[3];
    dest[0] = this[0] * x + this[4] * y + this[8] * z + this[12] * w;
    dest[1] = this[1] * x + this[5] * y + this[9] * z + this[13] * w;
    dest[2] = this[2] * x + this[6] * y + this[10] * z + this[14] * w;
    dest[3] = this[3] * x + this[7] * y + this[11] * z + this[15] * w;

    return dest;
  }

  identity(): this {
    Mat4Func.identity(this);
    return this;
  }

  copy(m: Mat4Tuple): this {
    Mat4Func.copy(this, m);
    return this;
  }

  clone(): Mat4 {
    return new Mat4().copy(this);
  }

  fromPerspective({ fov, aspect, near, far }: { fov: number; aspect: number; near: number; far: number }): this {
    Mat4Func.perspective(this, fov, aspect, near, far);
    return this;
  }

  fromOrthogonal({
    left,
    right,
    bottom,
    top,
    near,
    far
  }: {
    left: number;
    right: number;
    bottom: number;
    top: number;
    near: number;
    far: number;
  }): this {
    Mat4Func.ortho(this, left, right, bottom, top, near, far);
    return this;
  }

  fromQuaternion(q: QuatTuple): this {
    Mat4Func.fromQuat(this, q);
    return this;
  }

  setPosition(v: Vec3Tuple): this {
    this.x = v[0];
    this.y = v[1];
    this.z = v[2];
    return this;
  }

  inverse(m: Mat4Tuple = this): this {
    Mat4Func.invert(this, m);
    return this;
  }

  compose(q: QuatTuple, pos: Vec3Tuple, scale: Vec3Tuple): this {
    Mat4Func.fromRotationTranslationScale(this, q, pos, scale);
    return this;
  }

  getRotation(q: QuatTuple): this {
    Mat4Func.getRotation(q, this);
    return this;
  }

  getTranslation(pos: Vec3Tuple): this {
    Mat4Func.getTranslation(pos, this);
    return this;
  }

  getScaling(scale: Vec3Tuple): this {
    Mat4Func.getScaling(scale, this);
    return this;
  }

  getMaxScaleOnAxis(): number {
    return Mat4Func.getMaxScaleOnAxis(this);
  }

  lookAt(eye: Vec3Tuple, target: Vec3Tuple, up: Vec3Tuple): this {
    Mat4Func.targetTo(this, eye, target, up);
    return this;
  }

  determinant(): number {
    return Mat4Func.determinant(this);
  }

  fromArray(a: number[] | AttributeData, o: number = 0): this {
    this[0] = a[o];
    this[1] = a[o + 1];
    this[2] = a[o + 2];
    this[3] = a[o + 3];
    this[4] = a[o + 4];
    this[5] = a[o + 5];
    this[6] = a[o + 6];
    this[7] = a[o + 7];
    this[8] = a[o + 8];
    this[9] = a[o + 9];
    this[10] = a[o + 10];
    this[11] = a[o + 11];
    this[12] = a[o + 12];
    this[13] = a[o + 13];
    this[14] = a[o + 14];
    this[15] = a[o + 15];
    return this;
  }

  toArray<T extends number[] | AttributeData>(a: T = [] as any as T, o: number = 0): T {
    a[o] = this[0];
    a[o + 1] = this[1];
    a[o + 2] = this[2];
    a[o + 3] = this[3];
    a[o + 4] = this[4];
    a[o + 5] = this[5];
    a[o + 6] = this[6];
    a[o + 7] = this[7];
    a[o + 8] = this[8];
    a[o + 9] = this[9];
    a[o + 10] = this[10];
    a[o + 11] = this[11];
    a[o + 12] = this[12];
    a[o + 13] = this[13];
    a[o + 14] = this[14];
    a[o + 15] = this[15];

    return a;
  }
}
