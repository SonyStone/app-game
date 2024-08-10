import { Vec2Tuple } from '@packages/math';

export const pointToCanvasPoint = (point: Vec2Tuple, width: number, height: number) => {
  let x = point[0];
  let y = point[1];

  x = (x / width) * 2 - 1;
  y = (y / height) * -2 + 1;

  return [x, y];
};

export const cavasPointToPoint = (point: Vec2Tuple, width: number, height: number) => {
  let x = point[0];
  let y = point[1];

  x = ((x + 1) * width) / 2;
  y = ((y - 1) * -height) / 2;

  return [x, y];
};
