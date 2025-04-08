import { Vec2 } from '@packages/math';

/**
 * @private
 * calculate the velocity between two points. unit is in px per ms.
 * @param {Number} deltaTime
 * @param {Vec2Tuple} point
 * @return {Vec2Tuple} velocity `x` and `y`
 */
export default function getVelocity(deltaTime: number, point: Vec2): Vec2 {
  return new Vec2().set(point.x / deltaTime || 0, point.y / deltaTime || 0);
}
