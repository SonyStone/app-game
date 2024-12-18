import { Vec3Builder, type Vec3Tuple } from './v3-builder';

/*#__PURE__*/
export class Vec3 extends Vec3Builder(Array) {}

/*#__PURE__*/
export class FVec3 extends Vec3Builder(Float32Array) {}

/*#__PURE__*/
export class IVec3 extends Vec3Builder(Int32Array) {
  /**
   * All `-2147483648`.
   **/
  static readonly MIN = this.splat(-2147483648);

  /**
   * All `2147483647`
   * */
  static readonly MAX = this.splat(2147483647);
}

/*#__PURE__*/
export class UVec3 extends Vec3Builder(Uint32Array) {}

export type { Vec3Tuple };
