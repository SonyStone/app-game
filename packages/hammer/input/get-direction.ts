import { Vec2Tuple } from '@packages/ogl/math/vec-2_old';
import { DIRECTION } from '../input-consts';
import { abs } from '../utils/utils-consts';

/**
 * @private
 * get the direction between two points
 * @param {Number} x
 * @param {Number} y
 * @return {Number} direction
 */
export default function getDirection(delta: Vec2Tuple) {
  if (delta[0] === delta[1]) {
    return DIRECTION.NONE;
  }

  if (abs(delta[0]) >= abs(delta[1])) {
    return delta[0] < 0 ? DIRECTION.LEFT : DIRECTION.RIGHT;
  }
  return delta[1] < 0 ? DIRECTION.UP : DIRECTION.DOWN;
}
