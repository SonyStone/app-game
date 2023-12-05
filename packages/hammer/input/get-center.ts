import type { Vec2Tuple } from 'ogl';
import { round } from '../utils/utils-consts';

/**
 * @private
 * get the center of all the pointers
 * @param {Vec2Tuple[]} pointers
 * @return {Vec2Tuple} center contains `x` and `y` properties
 */
export default function getCenter(pointers: Vec2Tuple[]): Vec2Tuple {
  let pointersLength = pointers.length;

  // no need to loop when only one touch
  if (pointersLength === 1) {
    return [round(pointers[0][0]), round(pointers[0][1])];
  }

  let x = 0;
  let y = 0;
  let i = 0;
  while (i < pointersLength) {
    x += pointers[i][0];
    y += pointers[i][1];
    i++;
  }

  return [round(x / pointersLength), round(y / pointersLength)];
}
