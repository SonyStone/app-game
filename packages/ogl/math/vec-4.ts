import type { AttributeData } from '../core/geometry';
import * as Vec4Func from './functions/vec-4-func';

export type Vec4Tuple = [x: number, y: number, z: number, w: number];

// @ts-ignore
export class Vec4 extends Array implements Vec4Tuple {
  constructor(x: number = 0, y: number = x, z: number = x, w: number = x) {
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
  }

  set y(v: number) {
    this[1] = v;
  }

  set z(v: number) {
    this[2] = v;
  }

  set w(v: number) {
    this[3] = v;
  }

  set(x: number | Vec4 | Vec4Tuple, y: number = x as number, z: number = x as number, w: number = x as number): this {
    if ((x as Vec4 | Vec4Tuple).length) {
      return this.copy(x as Vec4 | Vec4Tuple);
    }
    Vec4Func.set(this as unknown as Vec4Tuple, x as number, y, z, w);
    return this;
  }

  copy(v: Vec4 | Vec4Tuple): this {
    Vec4Func.copy(this as unknown as Vec4Tuple, v as Vec4Tuple);
    return this;
  }

  normalize(): this {
    Vec4Func.normalize(this as unknown as Vec4Tuple, this as unknown as Vec4Tuple);
    return this;
  }

  multiply(v: number): this {
    Vec4Func.scale(this as unknown as Vec4Tuple, this as unknown as Vec4Tuple, v);
    return this;
  }

  dot(v: Vec4): number {
    return Vec4Func.dot(this as unknown as Vec4Tuple, v as unknown as Vec4Tuple);
  }

  fromArray(a: number[] | AttributeData, o = 0) {
    this[0] = a[o];
    this[1] = a[o + 1];
    this[2] = a[o + 2];
    this[3] = a[o + 3];
    return this;
  }

  toArray<T extends number[] | AttributeData>(a: T = [] as any, o: number = 0): T {
    a[o] = this[0];
    a[o + 1] = this[1];
    a[o + 2] = this[2];
    a[o + 3] = this[3];
    return a;
  }
}
