import { Vec2Tuple } from '@packages/ogl/math/vec-2_old';

/**
 * @private
 * calculate the angle between two coordinates
 * @param {Object} p1
 * @param {Object} p2
 * @param {Array} [props] containing x and y keys
 * @return {Number} angle
 */
export default function getAngle(p1: Vec2Tuple, p2: Vec2Tuple): number {
  let x = p2[0] - p1[0];
  let y = p2[1] - p1[1];
  return (Math.atan2(y, x) * 180) / Math.PI;
}
