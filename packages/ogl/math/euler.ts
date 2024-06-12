import { AttributeData } from '../core/geometry';
import * as EulerFunc from './functions/euler-func';
import { Mat4, Mat4Tuple } from './mat-4';
import { QuatTuple } from './quat';

const tmpMat4 = /* @__PURE__ */ new Mat4();

export type EulerTuple = [x: number, y: number, z: number] | number[] | Float32Array;

export type EulerOrder = 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX';

export class Euler extends Array {
  onChange = () => {};

  constructor(
    x = 0,
    y = x,
    z = x,
    public order: EulerOrder = 'YXZ'
  ) {
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

  set(x: number | EulerTuple, y = x, z = x): this {
    if ((x as EulerTuple).length) {
      return this.copy(x as number[]);
    }
    this[0] = x as number;
    this[1] = y as number;
    this[2] = z as number;
    this.onChange();
    return this;
  }

  copy(v: EulerTuple): this {
    this[0] = v[0];
    this[1] = v[1];
    this[2] = v[2];
    this.onChange();
    return this;
  }

  reorder(order: EulerOrder): this {
    this.order = order;
    this.onChange();
    return this;
  }

  fromRotationMatrix(m: Mat4Tuple, order: EulerOrder = this.order): this {
    EulerFunc.fromRotationMatrix(this, m, order);
    this.onChange();
    return this;
  }

  fromQuaternion(q: QuatTuple, order: EulerOrder = this.order): this {
    tmpMat4.fromQuaternion(q);
    return this.fromRotationMatrix(tmpMat4, order);
  }

  fromArray(a: number[] | AttributeData, o = 0): this {
    this[0] = a[o];
    this[1] = a[o + 1];
    this[2] = a[o + 2];
    return this;
  }

  toArray<T extends number[] | AttributeData>(a: T = [] as any as T, o = 0): T {
    a[o] = this[0];
    a[o + 1] = this[1];
    a[o + 2] = this[2];

    return a;
  }
}
