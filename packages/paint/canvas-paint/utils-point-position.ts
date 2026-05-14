import { Vec2 } from '@app-game/math';
import type { NumberArray } from '@app-game/math/utils/typed-array';

const getPointCoords = (point: Vec2 | NumberArray) => {
  if (point instanceof Vec2) {
    return { x: point.x, y: point.y };
  }

  return { x: point[0], y: point[1] };
};

export const pointToCanvasPoint = (point: Vec2 | NumberArray, width: number, height: number) => {
  let { x, y } = getPointCoords(point);

  x = (x / width) * 2 - 1;
  y = (y / height) * -2 + 1;

  return Vec2.create(x, y);
};

export const cavasPointToPoint = (point: Vec2 | NumberArray, width: number, height: number) => {
  let { x, y } = getPointCoords(point);

  x = ((x + 1) * width) / 2;
  y = ((y - 1) * -height) / 2;

  return Vec2.create(x, y);
};
