import { Vec2 } from '@app-game/math';
/**
 * @private
 * calculate the scale factor between two pointersets
 * no scale is 1, and goes down to 0 when pinched together, and bigger when pinched out
 * @param {Array} start array of pointers
 * @param {Array} end array of pointers
 * @return {Number} scale
 */
export default function getScale(start: Vec2[], end: Vec2[]) {
  return Vec2.distance(end[0], end[1]) / Vec2.distance(start[0], start[1]);
}
