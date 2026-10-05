import { expect, it } from 'vitest';
import { interpolateTabletAxes } from './tabletAxes';

it('interpolates barrel rotation across its wrap without a half-turn jump', () => {
  const a = { x: 0, y: 0, pressure: 0.5, time: 0, rotation: 355 };
  const b = { x: 10, y: 0, pressure: 0.5, time: 0, rotation: 5 };

  expect(interpolateTabletAxes(a, b, 0.5).rotation).toBe(360);
  expect(interpolateTabletAxes({ ...a, pointerType: 'mouse' }, { ...b, pointerType: 'mouse' }, 0.5).pointerType).toBe(
    'mouse'
  );
});
