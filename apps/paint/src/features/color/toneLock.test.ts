import { expect, it } from 'vitest';
import { labDistance } from './colorModels';
import { hexToHsv } from './hsv';
import { tone, toneGray, withHue } from './toneLock';

it('keeps the tone of a color while its hue turns all the way round', () => {
  for (const color of ['#c8553d', '#3d6a8c', '#e6b93d', '#2a2a40']) {
    for (let hue = 0; hue < 360; hue += 5) {
      const moved = withHue(color, hue);
      expect(Math.abs(tone(moved) - tone(color))).toBeLessThan(0.006);
      const { h } = hexToHsv(moved);
      expect(Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue))).toBeLessThan(4);
    }
  }
});

it('keeps a color at its own hue, its saturation where the tone allows, and grays gray', () => {
  expect(labDistance(withHue('#c8553d', hexToHsv('#c8553d').h), '#c8553d')).toBeLessThan(0.5);
  expect(hexToHsv(withHue('#c8553d', 120)).s).toBeCloseTo(hexToHsv('#c8553d').s, 1);
  expect(withHue('#808080', 200)).toBe('#808080');
});

it('gives up saturation only where full brightness is too dark for the tone', () => {
  const blue = withHue('#f2e64d', 240);
  expect(hexToHsv(blue).v).toBe(1);
  expect(hexToHsv(blue).s).toBeGreaterThan(0.05);
  expect(hexToHsv(blue).s).toBeLessThan(hexToHsv('#f2e64d').s);
  expect(Math.abs(tone(blue) - tone('#f2e64d'))).toBeLessThan(0.006);
});

it('shows the tone as a gray', () => {
  expect(toneGray('#000000')).toBe('#000000');
  expect(toneGray('#ffffff')).toBe('#ffffff');
  const gray = toneGray('#c8553d');
  expect(gray.slice(1, 3)).toBe(gray.slice(3, 5));
  expect(Math.abs(tone(gray) - tone('#c8553d'))).toBeLessThan(0.005);
});
