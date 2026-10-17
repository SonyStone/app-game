import { expect, it } from 'vitest';
import { cmykToHex, hexToCmyk, hexToLab, hexToRgb, labDistance, labToHex, rgbToHex } from './colorModels';

it('reads and writes RGB channels', () => {
  expect(hexToRgb('#bc5626')).toEqual({ r: 188, g: 86, b: 38 });
  expect(rgbToHex({ r: 300, g: -4, b: 127.6 })).toBe('#ff0080');
});

it('converts to CIE L*a*b* and back', () => {
  expect(hexToLab('#ffffff').l).toBeCloseTo(100, 1);
  expect(hexToLab('#000000').l).toBeCloseTo(0, 5);
  const red = hexToLab('#ff0000');
  expect(red.l).toBeCloseTo(53.24, 1);
  expect(red.a).toBeCloseTo(80.09, 0);
  expect(red.b).toBeCloseTo(67.2, 0);
  for (const hex of ['#bc5626', '#3d6a8c', '#e6b93d', '#123456', '#808080']) {
    expect(labToHex(hexToLab(hex))).toBe(hex);
  }

  expect(labToHex({ l: 50, a: 127, b: -128 })).toMatch(/^#[0-9a-f]{6}$/);
  expect(labDistance('#bc5626', '#bc5626')).toBe(0);
});

it('converts to CMYK and back, keeping the inks of black', () => {
  expect(hexToCmyk('#ff0000')).toEqual({ c: 0, m: 1, y: 1, k: 0 });
  expect(hexToCmyk('#000000', { c: 0.2, m: 0.3, y: 0.4, k: 0.5 })).toEqual({ c: 0.2, m: 0.3, y: 0.4, k: 1 });
  for (const hex of ['#bc5626', '#3d6a8c', '#ffffff', '#000000']) {
    expect(cmykToHex(hexToCmyk(hex))).toBe(hex);
  }

  expect(cmykToHex({ c: 1, m: 1, y: 1, k: 0.5 })).toBe('#000000');
});
