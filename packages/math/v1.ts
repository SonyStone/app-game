import { NumberArray } from './utils/typed-array';

const X = 0;

/**
 * Value class for 1D vectors.
 * To make it easier to work with 1D vectors in ArrayBuffers, TypedArrays and WebGL.
 */
export class Vec1<T extends NumberArray = NumberArray> {
  static ELEMENTS = 1;

  constructor(public value: T = new Float32Array(1) as unknown as T) {}

  get val(): number {
    return this.value[X];
  }

  set val(value: number) {
    this.value[X] = value;
  }

  get x(): number {
    return this.value[X];
  }

  static create(x: number = 0): Vec1<Float32Array> {
    return new Vec1().set(x) as Vec1<Float32Array>;
  }

  set(val: number): this {
    this.value[X] = val;
    return this;
  }

  copy(rhs: Readonly<Vec1>): this {
    this.value[X] = rhs.value[X];
    return this;
  }

  add(rhs: Readonly<Vec1>): this {
    this.value[X] += rhs.value[X];
    return this;
  }

  mul(rhs: number): this {
    this.value[X] *= rhs;
    return this;
  }

  isEqual(rhs: Readonly<Vec1>): boolean {
    return this.value[X] === rhs.value[X];
  }

  isEqualApprox(rhs: Readonly<Vec1>, epsilon: number = 1e-5): boolean {
    return Math.abs(this.value[X] - rhs.value[X]) < epsilon;
  }

  toString(): string {
    return `${this.value[X]}`;
  }
}
