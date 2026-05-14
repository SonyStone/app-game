import type { Mat2x3 } from './m2x3';
import * as m2x3 from './m2x3-functions';
import { createStruct } from './utils/create-struct';
import { Vec1 } from './v1';
import { Vec2 } from './v2';

export class Transform {
  constructor(
    public position = new Vec2(new Float32Array(2)),
    public scale = new Vec1(new Float32Array(1)),
    public rotation = new Vec1(new Float32Array(1))
  ) {}

  static create() {
    const [{ position, scale, rotation }] = createStruct({
      position: [Vec2, Float32Array],
      scale: [Vec1, Float32Array],
      rotation: [Vec1, Float32Array]
    });

    return new Transform(position, scale, rotation);
  }

  setPosition(x: number, y: number): this {
    this.position.set(x, y);
    return this;
  }

  setScale(x: number): this {
    this.scale.set(x);
    return this;
  }

  setRotation(x: number): this {
    this.rotation.set(x);
    return this;
  }

  fromMat2x3(mat: Readonly<Mat2x3>): this {
    m2x3.decompose(mat.value, this.position.value, this.rotation.value, this.scale.value);
    return this;
  }

  toMat2x3(out: Mat2x3): Mat2x3 {
    m2x3.compose(out.value, this.position.value, this.rotation.value, this.scale.value);
    return out;
  }

  isEqual(rhs: Readonly<Transform>): boolean {
    return this.position.isEqual(rhs.position) && this.scale.isEqual(rhs.scale) && this.rotation.isEqual(rhs.rotation);
  }

  isEqualApprox(rhs: Readonly<Transform>, epsilon: number = 1e-5): boolean {
    return (
      this.position.isEqualApprox(rhs.position, epsilon) &&
      this.scale.isEqualApprox(rhs.scale, epsilon) &&
      this.rotation.isEqualApprox(rhs.rotation, epsilon)
    );
  }

  toString() {
    return `{ position: ${this.position.toString()}, scale: ${this.scale.toString()}, rotation: ${this.rotation.toString()} }`;
  }
}
