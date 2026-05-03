import { Vec2 } from '@app-game/math';

export const pointToCanvasPoint = (point: Vec2, width: number, height: number) => {
  let x = point.x;
  let y = point.y;

  x = (x / width) * 2 - 1;
  y = (y / height) * -2 + 1;

  return Vec2.create(x, y);
};

export const cavasPointToPoint = (point: Vec2, width: number, height: number) => {
  let x = point.x;
  let y = point.y;

  x = ((x + 1) * width) / 2;
  y = ((y - 1) * -height) / 2;

  return Vec2.create(x, y);
};
