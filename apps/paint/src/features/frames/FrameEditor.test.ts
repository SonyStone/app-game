import { expect, it } from 'vitest';
import { resizeRect } from './FrameEditor';

const rect = { left: 0, top: 0, width: 100, height: 50 };

it('resizes by a corner or an edge, moves whole, and swaps edges dragged past each other', () => {
  expect(resizeRect(rect, { x: 1, y: 1 }, { x: 20, y: 10 })).toEqual({ left: 0, top: 0, width: 120, height: 60 });
  expect(resizeRect(rect, { x: -1, y: 0 }, { x: 30, y: 99 })).toEqual({ left: 30, top: 0, width: 70, height: 50 });
  expect(resizeRect(rect, 'move', { x: 5, y: -5 })).toEqual({ left: 5, top: -5, width: 100, height: 50 });
  expect(resizeRect(rect, { x: 0, y: -1 }, { x: 0, y: 80 })).toEqual({ left: 0, top: 50, width: 100, height: 30 });
});
