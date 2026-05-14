import { Vec2 } from '@app-game/math';
import getAngle from './get-angle';

/**
 * @private
 * calculate the rotation degrees between two pointersets
 * @param {Vec2Tuple[]} start array of pointers
 * @param {Vec2Tuple[]} end array of pointers
 * @return {Number} rotation
 */
export default function getRotation(start: Vec2[], end: Vec2[]) {
  return getAngle(end[1], end[0]) + getAngle(start[1], start[0]);
}
