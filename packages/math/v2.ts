import { Vec2Builder, type Vec2Tuple } from './v2-builder';

/*#__PURE__*/
export class Vec2 extends Vec2Builder(Array) {
  /**
   * All `Number.MIN_VALUE`
   **/
  static readonly MIN = Vec2.splat(Number.MIN_VALUE);

  /**
   * All `Number.MAX_VALUE`
   * */
  static readonly MAX = Vec2.splat(Number.MAX_VALUE);
}

/*#__PURE__*/
export class FVec2 extends Vec2Builder(Float32Array) {
  /**
   * All `Number.MIN_VALUE`
   **/
  static readonly MIN = Vec2.splat(Number.MIN_VALUE);

  /**
   * All `Number.MAX_VALUE`
   * */
  static readonly MAX = Vec2.splat(Number.MAX_VALUE);
}

/*#__PURE__*/
export class IVec2 extends Vec2Builder(Int32Array) {
  /**
   * All `-2147483648`.
   **/
  static readonly MIN = Vec2.splat(-2147483648);

  /**
   * All `2147483647`
   * */
  static readonly MAX = Vec2.splat(2147483647);
}

/*#__PURE__*/
export class UVec2 extends Vec2Builder(Uint32Array) {
  /**
   * All `0`.
   **/
  static readonly MIN = Vec2.splat(0);

  /**
   * All `4294967295`
   * */
  static readonly MAX = Vec2.splat(4294967295);
}

export type { Vec2Tuple };
