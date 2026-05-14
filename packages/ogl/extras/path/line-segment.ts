import { lerp as lerp3 } from '../../math/functions/vec-3-func';
import { Vec3 } from '../../math/vec-3';
import BaseSegment from './base-segment';

const tempVec3 = /* @__PURE__ */ new Vec3();

export default class LineSegment extends BaseSegment {
  p0: Vec3;
  p1: Vec3;

  constructor(p0: Vec3, p1: Vec3, tiltStart = 0, tiltEnd = 0) {
    super();
    this.p0 = p0;
    this.p1 = p1;

    this.tiltStart = tiltStart;
    this.tiltEnd = tiltEnd;

    this._len = -1;
  }

  /**
   * Updates the segment length. You must call this method every time you change the curve's control points.
   */
  updateLength(): void {
    this._len = tempVec3.sub(this.p1, this.p0).len();
  }

  /**
   * Get point at relative position in curve according to segment length.
   * @param {number} t Distance at time t in range [0 .. 1]
   * @param {Vec3} out Optional Vec3 to output
   * @returns {Vec3} Point at relative position
   */
  getPointAt(t: number, out = new Vec3()): Vec3 {
    lerp3(out, this.p0, this.p1, t);
    return out;
  }

  /**
   * Returns a unit vector tangent at t
   * @param {number} t Distance at time t in range [0 .. 1]
   * @param {Vec3} out Optional Vec3 to output
   * @returns {Vec3} A unit vector
   */
  getTangentAt(t: number, out = new Vec3()): Vec3 {
    return out.sub(this.p1, this.p0).normalize();
  }

  lastPoint(): Vec3 {
    return this.p1;
  }
}
