import { expect, it } from 'vitest';
import { capturePaintBounds, clipPaintBounds } from './paintBounds';

it('clips edge tiles without allowing writes to tiles outside a fixed drawing', () => {
  const bounds = capturePaintBounds({ x: 20, y: -30, width: 300, height: 100 });
  expect(clipPaintBounds(bounds, 0, -1)).toEqual({ x: 20, y: 226, width: 236, height: 30 });
  expect(clipPaintBounds(bounds, 1, 0)).toEqual({ x: 0, y: 0, width: 64, height: 70 });
  expect(clipPaintBounds(bounds, -1, 0)).toBeUndefined();
  expect(clipPaintBounds(bounds, 2, 0)).toBeUndefined();
  expect(clipPaintBounds(bounds, 0, 0, { x: 0, y: 0, width: 15, height: 10 })).toBeUndefined();
});

it('captures immutable bounds, rejects invalid dimensions and preserves the infinite path', () => {
  const bounds = { x: 0, y: 0, width: 100, height: 200 };
  const captured = capturePaintBounds(bounds);
  bounds.width = 5;
  expect(captured?.width).toBe(100);
  expect(() => capturePaintBounds({ ...bounds, width: 0 })).toThrow();
  expect(() => capturePaintBounds({ ...bounds, x: NaN })).toThrow();
  const region = { x: 5, y: 7, width: 20, height: 30 };
  expect(clipPaintBounds(undefined, 1234, -45, region)).toBe(region);
});
