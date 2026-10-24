import { expect, it } from 'vitest';
import { settledHeight, sheetStops } from './createSheet';

it('rests closed, in the middle and nearly full height', () => {
  expect(sheetStops(900)).toEqual([0, 405, 836]);
  expect(sheetStops(500)).toEqual([0, 300, 436]);
});

it('settles on the next stop the way it was moved, or on the nearest one', () => {
  const stops = sheetStops(900);

  expect(settledHeight(100, stops, 1)).toBe(405);
  expect(settledHeight(500, stops, 1)).toBe(836);
  expect(settledHeight(700, stops, -1)).toBe(405);
  expect(settledHeight(405, stops, -1)).toBe(405);
  expect(settledHeight(150, stops, 0)).toBe(0);
  expect(settledHeight(300, stops, 0)).toBe(405);
});
