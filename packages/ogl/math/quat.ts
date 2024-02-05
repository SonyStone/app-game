import { AttributeData } from '../core/geometry';
import { Euler } from './euler';
import * as QuatFunc from './functions/quat-func';
import { Mat3, Mat3Tuple } from './mat-3';
import { Vec3, Vec3Tuple } from './vec-3';

export type QuatTuple = [x: number, y: number, z: number, w: number] | number[];

// @ts-ignore
export class Quat extends Array implements QuatTuple {
  onChange = () => {};

  constructor(x = 0, y = 0, z = 0, w = 1) {
    // @ts-ignore
    super(x, y, z, w);
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

  get w(): number {
    return this[3];
  }

  set x(v: number) {
    this[0] = v;
    this.onChange();
  }

  set y(v: number) {
    this[1] = v;
    this.onChange();
  }

  set z(v: number) {
    this[2] = v;
    this.onChange();
  }

  set w(v: number) {
    this[3] = v;
    this.onChange();
  }

  identity(): this {
    QuatFunc.identity(this as any as QuatTuple);
    this.onChange();
    return this;
  }

  set(x: number | Quat | QuatTuple, y: number, z: number, w: number): this {
    if ((x as number[]).length) {
      return this.copy(x as Quat);
    }
    QuatFunc.set(this, x as number, y, z, w);
    this.onChange();
    return this;
  }

  rotateX(a: number): this {
    QuatFunc.rotateX(this as any as QuatTuple, this as any as QuatTuple, a);
    this.onChange();
    return this;
  }

  rotateY(a: number): this {
    QuatFunc.rotateY(this as any as QuatTuple, this as any as QuatTuple, a);
    this.onChange();
    return this;
  }

  rotateZ(a: number): this {
    QuatFunc.rotateZ(this as any as QuatTuple, this as any as QuatTuple, a);
    this.onChange();
    return this;
  }

  inverse(q: Quat = this): this {
    QuatFunc.invert(this as any as QuatTuple, q as any as QuatTuple);
    this.onChange();
    return this;
  }

  conjugate(q: Quat = this): this {
    QuatFunc.conjugate(this as any as QuatTuple, q as any as QuatTuple);
    this.onChange();
    return this;
  }

  copy(q: Quat): this {
    QuatFunc.copy(this as any as QuatTuple, q as any as QuatTuple);
    this.onChange();
    return this;
  }

  normalize(q: Quat = this): this {
    QuatFunc.normalize(this as any as QuatTuple, q as any as QuatTuple);
    this.onChange();
    return this;
  }

  multiply(qA: Quat, qB?: Quat): this {
    if (qB) {
      QuatFunc.multiply(this as any as QuatTuple, qA as any as QuatTuple, qB as any as QuatTuple);
    } else {
      QuatFunc.multiply(this as any as QuatTuple, this as any as QuatTuple, qA as any as QuatTuple);
    }
    this.onChange();
    return this;
  }

  dot(v: Quat): number {
    return QuatFunc.dot(this as any as QuatTuple, v as any as QuatTuple);
  }

  fromMatrix3(matrix3: Mat3): this {
    QuatFunc.fromMat3(this as any as QuatTuple, matrix3 as any as Mat3Tuple);
    this.onChange();
    return this;
  }

  fromEuler(euler: Euler): this {
    QuatFunc.fromEuler(this as any as QuatTuple, euler as any as Vec3Tuple, euler.order);
    return this;
  }

  fromAxisAngle(axis: Vec3, a: number): this {
    QuatFunc.setAxisAngle(this, axis, a);
    this.onChange();
    return this;
  }

  slerp(q: Quat, t: number): this {
    QuatFunc.slerp(this as any as QuatTuple, this as any as QuatTuple, q as any as QuatTuple, t);
    this.onChange();
    return this;
  }

  fromArray(a: number[] | AttributeData, o: number = 0): this {
    this[0] = a[o];
    this[1] = a[o + 1];
    this[2] = a[o + 2];
    this[3] = a[o + 3];
    this.onChange();
    return this;
  }

  toArray<T extends number[] | AttributeData>(a: T = [] as any as T, o: number = 0): T {
    a[o] = this[0];
    a[o + 1] = this[1];
    a[o + 2] = this[2];
    a[o + 3] = this[3];
    return a;
  }
}
