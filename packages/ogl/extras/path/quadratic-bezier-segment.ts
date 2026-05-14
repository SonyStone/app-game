import { Vec3 } from '../../math/vec-3';
import BaseSegment from './base-segment';
import { C_VALUES, T_VALUES } from './utils';

const tempVec3 = /* @__PURE__ */ new Vec3();

function quadraticBezier(t: number, p0: number, p1: number, p2: number): number {
  const k = 1 - t;
  return k * k * p0 + 2 * k * t * p1 + t * t * p2;
}

function quadraticBezierDeriv(t: number, p0: number, p1: number, p2: number): number {
  const k = 1 - t;
  return 2 * k * (p1 - p0) + 2 * t * (p2 - p1);
}

export default class QuadraticBezierSegment extends BaseSegment {
  p0: Vec3;
  p1: Vec3;
  p2: Vec3;

  constructor(p0: Vec3, p1: Vec3, p2: Vec3, tiltStart = 0, tiltEnd = 0) {
    super();
    this.p0 = p0;
    this.p1 = p1;
    this.p2 = p2;

    this.tiltStart = tiltStart;
    this.tiltEnd = tiltEnd;

    this._len = -1;
  }

  /**
   * Updates the segment length. You must call this method every time you change the curve's control points.
   */
  updateLength(): void {
    // from https://github.com/Pomax/bezierjs/blob/d19695f3cc3ce383cf38ce4643f467deca7edb92/src/utils.js#L265
    const z = 0.5;
    const len = T_VALUES.length;

    let sum = 0;
    for (let i = 0, t; i < len; i++) {
      t = z * T_VALUES[i] + z;
      sum += C_VALUES[i] * this.getDerivativeAt(t, tempVec3).len();
    }

    this._len = z * sum;
  }

  /**
   * Get point at relative position in curve according to segment length.
   * @param {number} t Distance at time t in range [0 .. 1]
   * @param {Vec3} out Optional Vec3 to output
   * @returns {Vec3} Point at relative position
   */
  getPointAt(t: number, out = new Vec3()): Vec3 {
    out.x = quadraticBezier(t, this.p0.x, this.p1.x, this.p2.x);
    out.y = quadraticBezier(t, this.p0.y, this.p1.y, this.p2.y);
    out.z = quadraticBezier(t, this.p0.z, this.p1.z, this.p2.z);
    return out;
  }

  getDerivativeAt(t: number, out = new Vec3()): Vec3 {
    out.x = quadraticBezierDeriv(t, this.p0.x, this.p1.x, this.p2.x);
    out.y = quadraticBezierDeriv(t, this.p0.y, this.p1.y, this.p2.y);
    out.z = quadraticBezierDeriv(t, this.p0.z, this.p1.z, this.p2.z);
    return out;
  }

  /**
   * Returns a unit vector tangent at t
   * @param {number} t Distance at time t in range [0 .. 1]
   * @param {Vec3} out Optional Vec3 to output
   * @returns {Vec3} A unit vector
   */
  getTangentAt(t: number, out = new Vec3()): Vec3 {
    return this.getDerivativeAt(t, out).normalize();
  }

  lastPoint(): Vec3 {
    return this.p2;
  }
}
