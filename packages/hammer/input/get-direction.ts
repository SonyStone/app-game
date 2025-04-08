import { Vec2 } from '@packages/math';
import { DIRECTION } from '../input-consts';
import { abs } from '../utils/utils-consts';

/**
 * @private
 * get the direction between two points
 * @param {Number} x
 * @param {Number} y
 * @return {Number} direction
 */
export default function getDirection(delta: Vec2) {
  if (delta.x === delta.y) {
    return DIRECTION.NONE;
  }

  if (abs(delta.x) >= abs(delta.y)) {
    return delta.x < 0 ? DIRECTION.LEFT : DIRECTION.RIGHT;
  }
  return delta.y < 0 ? DIRECTION.UP : DIRECTION.DOWN;
}
