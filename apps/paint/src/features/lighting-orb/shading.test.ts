import { expect, it } from 'vitest';
import { hexToRgb, labDistance } from '../color/colorModels';
import { tone } from '../color/toneLock';
import { orbColor, type OrbLights } from './shading';

const lights: OrbLights = { base: '#808080', light: '#f0c030', shadow: '#3050f0', contrast: 1 };
/** The highlight, up and right of the center, and the far side's rim, down and left. */
const highlight = [0.31, -0.34] as const;
const farSide = [-0.68, 0.68] as const;

it('shows the base color everywhere at no contrast', () => {
  for (const [x, y] of [highlight, farSide, [0, 0], [0.9, 0.1], [2, 2]] as const) {
    expect(orbColor({ ...lights, contrast: 0 }, x, y)).toBe('#808080');
  }
});

it('tends to the light color where the light falls and to the shadow color on the far side', () => {
  const lit = orbColor(lights, ...highlight);
  const dark = orbColor(lights, ...farSide);
  expect(labDistance(lit, '#f0c030')).toBeLessThan(labDistance('#808080', '#f0c030') * 0.7);
  const litRgb = hexToRgb(lit);
  expect(litRgb.r).toBeGreaterThan(litRgb.b + 60);
  const darkRgb = hexToRgb(dark);
  expect(darkRgb.b).toBeGreaterThan(darkRgb.r + 10);
  expect(tone(lit)).toBeGreaterThan(tone('#808080'));
  expect(tone(dark)).toBeLessThan(tone('#808080') - 0.2);
});

it('scales light and shadow with the contrast', () => {
  const at = (contrast: number, [x, y]: readonly [number, number]) => tone(orbColor({ ...lights, contrast }, x, y));
  expect(at(0.3, highlight)).toBeLessThan(at(1, highlight));
  expect(at(0.3, highlight)).toBeGreaterThan(at(0, highlight));
  expect(at(0.3, farSide)).toBeGreaterThan(at(1, farSide));
  expect(at(0.3, farSide)).toBeLessThan(at(0, farSide));
});

it('ignores the brightness of the light and shadow colors and gives points off the disc the rim color', () => {
  expect(orbColor({ ...lights, light: '#786018', shadow: '#182878' }, ...highlight)).toBe(
    orbColor(lights, ...highlight)
  );
  expect(orbColor(lights, 3, 0)).toBe(orbColor(lights, 1, 0));
});
