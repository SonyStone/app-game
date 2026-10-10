import { describe, expect, it } from 'vitest';
import { formatValue, fractionOf, percentSetting, sizeSetting, stepPreset, valueAt } from './values';

describe('cluster values', () => {
  it('maps sizes geometrically, so that each doubling takes the same distance', () => {
    const size = sizeSetting(512);
    expect(fractionOf(size, 1)).toBe(0);
    expect(fractionOf(size, 512)).toBe(1);
    expect(fractionOf(size, 32) - fractionOf(size, 16)).toBeCloseTo(fractionOf(size, 256) - fractionOf(size, 128));
    expect(valueAt(size, fractionOf(size, 32))).toBe(32);
  });

  it('maps percentages linearly and keeps values in range', () => {
    const opacity = percentSetting('Opacity', 1);
    expect(fractionOf(opacity, 50.5)).toBeCloseTo(0.5);
    expect(valueAt(opacity, 1.4)).toBe(100);
    expect(valueAt(opacity, -1)).toBe(1);
    expect(fractionOf(opacity, 0)).toBe(0);
  });

  it('rounds to tenths below 10 and to whole numbers above', () => {
    const size = sizeSetting(512);
    expect(valueAt(size, 0.1)).toBe(1.9);
    expect(valueAt(size, 0.7)).toBe(79);
    expect(formatValue(2.25)).toBe('2.3');
    expect(formatValue(12.6)).toBe('13');
  });

  it('steps through presets from values between them, stopping at the ends', () => {
    const opacity = percentSetting('Opacity');
    expect(stepPreset(opacity, 33, 1)).toBe(40);
    expect(stepPreset(opacity, 33, -1)).toBe(30);
    expect(stepPreset(opacity, 40, 1)).toBe(50);
    expect(stepPreset(opacity, 100, 1)).toBe(100);
    expect(stepPreset(opacity, 0, -1)).toBe(0);
  });

  it('offers ABR sizes up to 5000 px', () => {
    const size = sizeSetting(5000);
    expect(size.presets.at(-1)).toBe(5000);
    expect(stepPreset(size, 2000, 1)).toBe(3000);
  });
});
