import * as Vec3Func from './functions/vec-3-func';
import { Mat3, Mat3Tuple } from './mat-3';
import { Mat4 } from './mat-4';
import type { Quat, QuatTuple } from './quat';

export type Vec3Tuple = [x: number, y: number, z: number] | number[] | Float32Array;

// @ts-ignore
export class Vec3 extends Array implements Vec3Tuple {
  constructor(x: number = 0, y: number = x, z: number = x) {
    // @ts-ignore
    super(x, y, z);
    return this;
  }

  get x(): number {
    return this[0];
  }

  get y(): number {
    return this[1];
  }

  get z(): number {
    return this[2];
  }

  set x(v: number) {
    this[0] = v;
  }

  set y(v: number) {
    this[1] = v;
  }

  set z(v: number) {
    this[2] = v;
  }

  set(x: number | Vec3 | Vec3Tuple, y: number = x as number, z: number = x as number): this {
    if ((x as Vec3Tuple).length) {
      return this.copy(x as Vec3Tuple);
    }
    Vec3Func.set(this, x as number, y, z);
    return this;
  }

  copy(v: Vec3Tuple): this {
    Vec3Func.copy(this, v);
    return this;
  }

  add(va: Vec3Tuple, vb?: Vec3 | Vec3Tuple): this {
    if (vb) {
      Vec3Func.add(this, va, vb);
    } else {
      Vec3Func.add(this, this, va);
    }
    return this;
  }

  sub(va: Vec3 | Vec3Tuple, vb?: Vec3 | Vec3Tuple): this {
    if (vb) Vec3Func.subtract(this, va, vb);
    else Vec3Func.subtract(this, this, va);
    return this;
  }

  multiply(v: Vec3 | Vec3Tuple | number): this {
    if ((v as Vec3).length) {
      Vec3Func.multiply(this, this, v as Vec3);
    } else {
      Vec3Func.scale(this, this, v as number);
    }
    return this;
  }

  divide(v: Vec3 | Vec3Tuple | number): this {
    if ((v as Vec3).length) {
      Vec3Func.divide(this, this, v as Vec3);
    } else {
      Vec3Func.scale(this, this, 1 / (v as number));
    }
    return this;
  }

  inverse(v: Vec3 | Vec3Tuple = this): this {
    Vec3Func.inverse(this, v);
    return this;
  }

  // Can't use 'length' as Array.prototype uses it
  len(): number {
    return Vec3Func.length(this);
  }

  distance(v?: Vec3 | Vec3Tuple): number {
    if (v) {
      return Vec3Func.distance(this, v);
    } else {
      return Vec3Func.length(this);
    }
  }

  squaredLen(): number {
    return Vec3Func.squaredLength(this);
  }

  squaredDistance(v: Vec3 | Vec3Tuple): number {
    if (v) {
      return Vec3Func.squaredDistance(this, v);
    } else {
      return Vec3Func.squaredLength(this);
    }
  }

  negate(v: Vec3 | Vec3Tuple = this) {
    Vec3Func.negate(this, v);
    return this;
  }

  cross(va: Vec3 | Vec3Tuple, vb?: Vec3 | Vec3Tuple): this {
    if (vb) {
      Vec3Func.cross(this, va, vb);
    } else {
      Vec3Func.cross(this, this, va);
    }
    return this;
  }

  scale(v: number): this {
    Vec3Func.scale(this, this, v);
    return this;
  }

  normalize(): this {
    Vec3Func.normalize(this, this);
    return this;
  }

  dot(v: Vec3 | Vec3Tuple): number {
    return Vec3Func.dot(this, v);
  }

  equals(v: Vec3 | Vec3Tuple): boolean {
    return Vec3Func.exactEquals(this, v);
  }

  applyMatrix3(mat3: Mat3 | Mat3Tuple) {
    Vec3Func.transformMat3(this, this, mat3);
    return this;
  }

  applyMatrix4(mat4: Mat4) {
    Vec3Func.transformMat4(this, this, mat4);
    return this;
  }

  scaleRotateMatrix4(mat4: Mat4) {
    Vec3Func.scaleRotateMat4(this, this, mat4);
    return this;
  }

  applyQuaternion(q: Quat | QuatTuple) {
    Vec3Func.transformQuat(this, this, q);
    return this;
  }

  angle(v: Vec3 | Vec3Tuple) {
    return Vec3Func.angle(this, v);
  }

  lerp(v: Vec3 | Vec3Tuple, t: number) {
    Vec3Func.lerp(this, this, v, t);
    return this;
  }

  clone() {
    return new Vec3(this[0], this[1], this[2]);
  }

  fromArray(a: number[] | Float32Array | Uint32Array | Uint16Array, o = 0) {
    this[0] = a[o];
    this[1] = a[o + 1];
    this[2] = a[o + 2];
    return this;
  }

  toArray(a: number[] | Float32Array = [], o: number = 0): number[] | Float32Array {
    a[o] = this[0];
    a[o + 1] = this[1];
    a[o + 2] = this[2];

    return a;
  }

  transformDirection(mat4: Mat4) {
    const x = this[0];
    const y = this[1];
    const z = this[2];

    this[0] = mat4[0] * x + mat4[4] * y + mat4[8] * z;
    this[1] = mat4[1] * x + mat4[5] * y + mat4[9] * z;
    this[2] = mat4[2] * x + mat4[6] * y + mat4[10] * z;

    return this.normalize();
  }
}
