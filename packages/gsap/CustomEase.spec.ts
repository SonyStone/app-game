import { describe, expect, it } from 'vitest';
import { bezierToPoints } from './CustomEase';

describe('ease', () => {
  it('should work', () => {
    const points = bezierToPoints(0, 0, 2, 2, 3, 0, 4, 1, 0.1, [], 0);

    console.log(`points`, points);

    expect(points).toBeTruthy();
  });
});
