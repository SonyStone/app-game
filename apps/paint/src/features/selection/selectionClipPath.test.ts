import {
  emptySummary,
  invertSelection,
  polygonSelection,
  summarizeSelection,
  wholeSelection
} from '@app-game/paint-core/selectionMask';
import { expect, it } from 'vitest';
import { selectionClipPath } from './selectionClipPath';

const square = polygonSelection([
  { x: 2, y: 2 },
  { x: 6, y: 2 },
  { x: 6, y: 5 },
  { x: 2, y: 5 }
]);
const size = { width: 100, height: 80 };
const scale = (point: { x: number; y: number }) => ({ x: point.x * 2, y: point.y * 2 });

it('clips to the selected cells, merged into rectangles on screen', () => {
  expect(selectionClipPath(summarizeSelection(square), scale, size)).toBe("path('M4 4L12 4L12 10L4 10Z')");
});

it('clips an inverted selection out of the canvas with reversed rectangles, and leaves the rest unclipped', () => {
  const path = selectionClipPath(summarizeSelection(invertSelection(square)), scale, size)!;
  expect(path.startsWith("path('M0 0L100 0L100 80L0 80Z")).toBe(true);
  // The hole runs counterclockwise against the outer rectangle.
  expect(path).toContain('M4 10L12 10L12 4L4 4Z');
  expect(selectionClipPath(emptySummary, scale, size)).toBeUndefined();
  expect(selectionClipPath(summarizeSelection(wholeSelection), scale, size)).toBeUndefined();
});
