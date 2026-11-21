import { expect, it } from 'vitest';
import { penPressureStatus } from './PenPressurePane';

it('reads "Linear" for an uncalibrated pen, whose pressure still reaches brushes, and counts a curve’s points', () => {
  expect(penPressureStatus(undefined)).toBe('Linear');
  expect(
    penPressureStatus({
      points: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.2 },
        { x: 1, y: 1 }
      ]
    })
  ).toBe('3 points');
});
