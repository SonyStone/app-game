import { describe, expect, it } from 'vitest';
import { hexToRgb, mixPigments, rgbToHex, type Rgb } from './pigment';

describe('mixPigments', () => {
  it('mixes blue and yellow paint to green, where averaging RGB gives grey', () => {
    const green = mixPigments(hexToRgb('#1846c4'), hexToRgb('#ffd21a'), 0.5);
    expect(hueOf(green)).toBeGreaterThan(90);
    expect(hueOf(green)).toBeLessThan(160);
    expect(saturationOf(green)).toBeGreaterThan(0.3);
  });

  it('turns even pure display blue and yellow greenish', () => {
    const mixed = mixPigments([0, 0, 255], [255, 255, 0], 0.5);
    expect(mixed[1]).toBeGreaterThan(mixed[0]);
    expect(mixed[1]).toBeGreaterThan(mixed[2]);
  });

  it('mixes red and yellow to orange, red and blue to a purple, magenta and blue to violet', () => {
    expect(hueOf(mixPigments(hexToRgb('#d42a1e'), hexToRgb('#ffd21a'), 0.5))).toBeGreaterThan(10);
    expect(hueOf(mixPigments(hexToRgb('#d42a1e'), hexToRgb('#ffd21a'), 0.5))).toBeLessThan(45);
    expect(hueOf(mixPigments(hexToRgb('#c4237a'), hexToRgb('#1846c4'), 0.5))).toBeGreaterThan(240);
    expect(hueOf(mixPigments(hexToRgb('#c4237a'), hexToRgb('#1846c4'), 0.5))).toBeLessThan(290);
    expect(hueOf(mixPigments(hexToRgb('#d42a1e'), hexToRgb('#1846c4'), 0.5))).toBeGreaterThan(270);
  });

  it('tints with white: lighter and paler, of the same hue family', () => {
    const red = hexToRgb('#d42a1e');
    const pink = mixPigments(red, hexToRgb('#ffffff'), 0.5);
    expect(lightnessOf(pink)).toBeGreaterThan(lightnessOf(red) + 0.15);
    expect(Math.abs(hueDistance(hueOf(pink), hueOf(red)))).toBeLessThan(15);
  });

  it('mixes equal parts of white and black to a middle grey', () => {
    const grey = mixPigments([255, 255, 255], [0, 0, 0], 0.5);
    expect(grey[0]).toBe(grey[1]);
    expect(grey[1]).toBe(grey[2]);
    expect(grey[0]).toBeGreaterThan(70);
    expect(grey[0]).toBeLessThan(170);
  });

  it('keeps a color mixed with itself, and either color at the ends of the range', () => {
    const color = hexToRgb('#7b3f22');
    expect(mixPigments(color, color, 0.5)).toEqual(color);
    expect(mixPigments(color, [12, 200, 90], 0)).toEqual(color);
    expect(mixPigments(color, [12, 200, 90], 1)).toEqual([12, 200, 90]);
  });

  it('moves gradually from one color to the other', () => {
    const a = hexToRgb('#ffd21a'),
      b = hexToRgb('#1846c4');
    const blues = [0, 0.25, 0.5, 0.75, 1].map((t) => mixPigments(a, b, t)[2]);
    expect(blues).toEqual([...blues].sort((x, y) => x - y));
  });

  it('reads and writes hex colors', () => {
    expect(hexToRgb('#1846c4')).toEqual([0x18, 0x46, 0xc4]);
    expect(rgbToHex([0x18, 0x46, 0xc4])).toBe('#1846c4');
  });
});

/** Hue in degrees. */
function hueOf([r, g, b]: Rgb) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const delta = max - min || 1;
  const sector = max === r ? (g - b) / delta + 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (((sector * 60) % 360) + 360) % 360;
}

function saturationOf([r, g, b]: Rgb) {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

function lightnessOf([r, g, b]: Rgb) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function hueDistance(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}
