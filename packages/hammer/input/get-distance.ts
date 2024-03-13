import { Vec2Tuple } from '@packages/ogl/math/vec-2_old';

/**
 * @private
 * calculate the absolute distance between two points
 * @param {Vec2Tuple} p1 {x, y}
 * @param {Vec2Tuple} p2 {x, y}
 * @return {Number} distance
 */
export default function getDistance(p1: Vec2Tuple, p2: Vec2Tuple): number {
  let x = p2[0] - p1[0];
  let y = p2[1] - p1[1];

  return Math.sqrt(x * x + y * y);
}
