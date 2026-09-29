import { expect, it } from 'vitest';
import { positionAt } from './SavedViewStrip';

it('maps a pointer to a fractional thumbnail index, clamped to the ends', () => {
  const centers = [100, 160, 220];

  expect(positionAt(40, centers)).toBe(0);
  expect(positionAt(100, centers)).toBe(0);
  expect(positionAt(145, centers)).toBe(0.75);
  expect(positionAt(190, centers)).toBe(1.5);
  expect(positionAt(400, centers)).toBe(2);
  expect(positionAt(123, [100])).toBe(0);
});

it('follows right-to-left layouts, where centers decrease', () => {
  expect(positionAt(130, [160, 100])).toBe(0.5);
  expect(positionAt(20, [160, 100])).toBe(1);
});
