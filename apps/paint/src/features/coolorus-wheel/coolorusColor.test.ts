import { expect, it } from 'vitest';
import { hexToHsv, hsvToHex } from '../color/hsv';
import { hexToWheel } from '../color-wheel/oklch';
import { keepLightness, rgbToRybHue, rybToRgbHue } from './coolorusColor';

it('puts green opposite red and violet opposite yellow on the RYB wheel', () => {
  expect(rybToRgbHue(0)).toBe(0);
  expect(rybToRgbHue(180)).toBe(120);
  expect(rybToRgbHue(120)).toBe(60);
  expect(rybToRgbHue(300)).toBe(285);
  expect(rybToRgbHue(360)).toBe(0);
});

it('inverts the RYB mapping everywhere on the circle', () => {
  for (let hue = 0; hue < 360; hue += 7) {
    expect(rgbToRybHue(rybToRgbHue(hue))).toBeCloseTo(hue, 6);
    expect(rybToRgbHue(rgbToRybHue(hue))).toBeCloseTo(hue, 6);
  }

  expect(rybToRgbHue(-90)).toBeCloseTo(rybToRgbHue(270));
});

it('keeps the lightness when the hue turns, darkening a yellow and whitening a blue', () => {
  const red = '#c8553d';
  const yellow = keepLightness(red, { ...hexToHsv(red), h: 60 });
  expect(hexToWheel(hsvToHex(yellow)).l).toBeCloseTo(hexToWheel(red).l, 2);
  expect(yellow.v).toBeLessThan(hexToHsv(red).v);

  const lightYellow = '#f0e060';
  const blue = keepLightness(lightYellow, { ...hexToHsv(lightYellow), h: 240 });
  expect(blue.v).toBe(1);
  expect(blue.s).toBeLessThan(hexToHsv(lightYellow).s);
  expect(hexToWheel(hsvToHex(blue)).l).toBeCloseTo(hexToWheel(lightYellow).l, 2);
});
