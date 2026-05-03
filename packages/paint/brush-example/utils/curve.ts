import { Vec2 } from '@app-game/math';

export const curve2ControlPoints = (t: number, p1: number, p2: number): number => p1 * (1 - t) + p2 * t;

export const curve3ControlPoints = (t: number, p1: number, p2: number, p3: number): number =>
  p1 * (1 - t) ** 2 + p2 * 2 * (1 - t) * t + p3 * t ** 2;

export const curve4ControlPoints = (t: number, p1: number, p2: number, p3: number, p4: number): number =>
  p1 * (1 - t) ** 3 + p2 * 3 * (1 - t) ** 2 * t + p3 * 3 * (1 - t) * t ** 2 + p4 * t ** 3;

export const curve = (t: number, p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 => {
  const [p1x, p1y] = p1.value;
  const [p2x, p2y] = p2.value;
  const [p3x, p3y] = p3.value;
  const [p4x, p4y] = p4.value;
  return new Vec2().set(curve4ControlPoints(t, p1x, p2x, p3x, p4x), curve4ControlPoints(t, p1y, p2y, p3y, p4y));
};
