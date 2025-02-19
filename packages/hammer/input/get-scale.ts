import type { Vec2Tuple } from '@packages/ogl/math/vec-2_old';
import getDistance from './get-distance';
/**
 * @private
 * calculate the scale factor between two pointersets
 * no scale is 1, and goes down to 0 when pinched together, and bigger when pinched out
 * @param {Array} start array of pointers
 * @param {Array} end array of pointers
 * @return {Number} scale
 */
export default function getScale(start: Vec2Tuple[], end: Vec2Tuple[]) {
  return getDistance(end[0], end[1]) / getDistance(start[0], start[1]);
}
