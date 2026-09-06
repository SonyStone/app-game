import { expect, it } from 'vitest';
import { stampBounds } from './stampBounds';

it('includes the fractional stamp fringe without recompositing the full tile', () => {
  expect(stampBounds([{ x: 100.25, y: 80.75, radius: 8.5, flow: 1 }], 0, 0)).toEqual({
    x: 90,
    y: 71,
    width: 20,
    height: 20
  });
});
it('clips large stamps across negative tile boundaries', () => {
  expect(stampBounds([{ x: -256, y: -256, radius: 256, flow: 1 }], -1, -1)).toEqual({
    x: 0,
    y: 0,
    width: 256,
    height: 256
  });
  expect(stampBounds([{ x: -255.75, y: -128, radius: 1, flow: 1 }], -2, -1)).toEqual({
    x: 254,
    y: 126,
    width: 2,
    height: 4
  });
});
it('covers separate dabs together and rejects empty or outside damage', () => {
  expect(
    stampBounds(
      [
        { x: 10, y: 20, radius: 2, flow: 1 },
        { x: 200, y: 210, radius: 3, flow: 1 }
      ],
      0,
      0
    )
  ).toEqual({ x: 7, y: 17, width: 197, height: 197 });
  expect(stampBounds([], 0, 0)).toBeUndefined();
  expect(stampBounds([{ x: 400, y: 400, radius: 1, flow: 1 }], 0, 0)).toBeUndefined();
});
