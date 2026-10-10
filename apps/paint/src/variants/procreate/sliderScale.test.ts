import { describe, expect, it } from 'vitest';
import { geometricFraction, geometricValue, linearFraction, linearValue, trackFraction } from './sliderScale';

describe('slider scales', () => {
  it('maps brush sizes geometrically, ends included', () => {
    expect(geometricFraction(1, 1, 512)).toBe(0);
    expect(geometricFraction(512, 1, 512)).toBe(1);
    expect(geometricFraction(Math.sqrt(512), 1, 512)).toBeCloseTo(0.5);
    expect(geometricValue(0, 1, 512)).toBe(1);
    expect(geometricValue(1, 1, 512)).toBe(512);
    expect(geometricValue(0.5, 1, 512)).toBe(23);
  });

  it('round-trips sizes through the geometric slider', () => {
    for (const size of [1, 2.5, 7, 32, 100, 512]) {
      expect(geometricValue(geometricFraction(size, 1, 512), 1, 512)).toBeCloseTo(size, 0);
    }
  });

  it('clamps values outside the range and invalid fractions', () => {
    expect(geometricFraction(0, 1, 512)).toBe(0);
    expect(geometricFraction(9000, 1, 512)).toBe(1);
    expect(geometricValue(Number.NaN, 1, 512)).toBe(1);
    expect(geometricFraction(5, 5, 5)).toBe(0);
    expect(linearFraction(2, 0, 1)).toBe(1);
    expect(linearValue(-1, 0.01, 1)).toBe(0.01);
  });

  it('maps opacity linearly', () => {
    expect(linearFraction(0.505, 0.01, 1)).toBeCloseTo(0.5);
    expect(linearValue(0.5, 0.01, 1)).toBeCloseTo(0.505);
  });

  it('keeps the thumb inside its track', () => {
    expect(trackFraction(0, 200, 20)).toBe(0);
    expect(trackFraction(10, 200, 20)).toBe(0);
    expect(trackFraction(100, 200, 20)).toBe(0.5);
    expect(trackFraction(190, 200, 20)).toBe(1);
    expect(trackFraction(250, 200, 20)).toBe(1);
    expect(trackFraction(10, 10, 20)).toBe(0);
  });
});
