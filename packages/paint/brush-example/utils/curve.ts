import { Vec2 } from '@app-game/math';
import type { NumberArray } from '@app-game/math/utils/typed-array';

export const curve2ControlPoints = (t: number, p1: number, p2: number): number => p1 * (1 - t) + p2 * t;

export const curve3ControlPoints = (t: number, p1: number, p2: number, p3: number): number =>
  p1 * (1 - t) ** 2 + p2 * 2 * (1 - t) * t + p3 * t ** 2;

export const curve4ControlPoints = (t: number, p1: number, p2: number, p3: number, p4: number): number =>
  p1 * (1 - t) ** 3 + p2 * 3 * (1 - t) ** 2 * t + p3 * 3 * (1 - t) * t ** 2 + p4 * t ** 3;

function getPointValue(point: Vec2 | NumberArray): NumberArray {
  return point instanceof Vec2 ? point.value : point;
}

export const curve = (t: number, p1: Vec2 | NumberArray, p2: Vec2 | NumberArray, p3: Vec2 | NumberArray, p4: Vec2 | NumberArray): Vec2 => {
  const p1Value = getPointValue(p1);
  const p2Value = getPointValue(p2);
  const p3Value = getPointValue(p3);
  const p4Value = getPointValue(p4);
  const p1x = p1Value[0];
  const p1y = p1Value[1];
  const p2x = p2Value[0];
  const p2y = p2Value[1];
  const p3x = p3Value[0];
  const p3y = p3Value[1];
  const p4x = p4Value[0];
  const p4y = p4Value[1];
  return new Vec2().set(curve4ControlPoints(t, p1x, p2x, p3x, p4x), curve4ControlPoints(t, p1y, p2y, p3y, p4y));
};
