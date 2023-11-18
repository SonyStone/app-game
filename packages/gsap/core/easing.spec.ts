import { describe, expect, it } from 'vitest';

import { backOut, linear } from './easing-2';

describe('easing', () => {
  it('linear', () => {
    const ease = linear();

    const inputs = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
    const expects = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

    inputs.forEach((v, i) => {
      expect(ease(v)).toBeCloseTo(expects[i]);
    });
  });

  it('back.out', () => {
    const ease = backOut();

    const inputs = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
    const expects = [
      0, 0.40883, 0.7058, 0.90713, 1.02903, 1.0877, 1.09935, 1.0802, 1.04645,
      1.01431, 1,
    ];

    inputs.forEach((v, i) => {
      expect(ease(v)).toBeCloseTo(expects[i]);
    });
  });
});
