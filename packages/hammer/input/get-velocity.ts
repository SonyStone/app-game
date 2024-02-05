import type { Vec2Tuple } from '@packages/ogl/math/vec-2';

/**
 * @private
 * calculate the velocity between two points. unit is in px per ms.
 * @param {Number} deltaTime
 * @param {Vec2Tuple} point
 * @return {Vec2Tuple} velocity `x` and `y`
 */
export default function getVelocity(deltaTime: number, point: Vec2Tuple): Vec2Tuple {
  return [point[0] / deltaTime || 0, point[1] / deltaTime || 0];
}
