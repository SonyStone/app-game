import { Vec2 } from '@packages/math';

/**
 * @private
 * calculate the angle between two coordinates
 * @param {Object} p1
 * @param {Object} p2
 * @param {Array} [props] containing x and y keys
 * @return {Number} angle
 */
export default function getAngle(p1: Vec2, p2: Vec2): number {
  const x = p2.x - p1.x;
  const y = p2.y - p1.y;
  return (Math.atan2(y, x) * 180) / Math.PI;
}
