import { expect, it } from 'vitest';
import { hexToWheel, maxChroma, wheelToHex } from './oklch';
import {
  clampToPolygon,
  contains,
  editableMask,
  fromDisk,
  harmonyColors,
  maskPolygon,
  moveMaskCorner,
  toDisk
} from './wheelGeometry';

it('round-trips sRGB colors through the wheel', () => {
  for (const hex of ['#ff0000', '#00e85d', '#167bd7', '#ffce32', '#808080', '#000000', '#ffffff', '#344b66']) {
    expect(wheelToHex(hexToWheel(hex))).toBe(hex);
  }
});

it('measures OKLab lightness and keeps it while the hue turns', () => {
  expect(hexToWheel('#ffffff').l).toBeCloseTo(1, 4);
  expect(hexToWheel('#000000').l).toBeCloseTo(0, 4);
  // Pure red is at OKLCH hue 29° and is the most saturated red at its lightness.
  const red = hexToWheel('#ff0000');
  expect(red.h).toBeCloseTo(29.2, 0);
  expect(red.s).toBeCloseTo(1, 3);

  const turned = hexToWheel(wheelToHex({ ...red, h: red.h + 120, s: 0.5 }));
  expect(turned.l).toBeCloseTo(red.l, 2);
});

it('keeps the previous hue for grays and finds no chroma at black or white', () => {
  expect(hexToWheel('#808080', { l: 0.5, s: 0.4, h: 200 })).toMatchObject({ s: 0, h: 200 });
  expect(maxChroma(0, 100)).toBe(0);
  expect(maxChroma(1, 100)).toBe(0);
  expect(maxChroma(0.7, 264)).toBeLessThan(maxChroma(0.45, 264));
});

it('maps hue clockwise from the top of the disk', () => {
  expect(toDisk({ s: 1, h: 0 }).y).toBeCloseTo(-1);
  expect(toDisk({ s: 1, h: 90 }).x).toBeCloseTo(1);
  expect(fromDisk({ x: 0, y: 0.5 })).toEqual({ s: 0.5, h: 180 });
  expect(fromDisk({ x: 3, y: 0 }).s).toBe(1);
});

it('derives harmonies and keeps picks inside a rotated gamut mask', () => {
  expect(harmonyColors({ l: 0.5, s: 0.5, h: 300 }, 'triad').map(({ h }) => h)).toEqual([60, 180]);

  const triangle = maskPolygon('triangle', 60);
  // Turned by 60°, the triangle's corner points down, away from the top of the wheel.
  expect(contains(triangle, toDisk({ s: 0.9, h: 180 }))).toBe(true);
  expect(contains(triangle, toDisk({ s: 0.9, h: 0 }))).toBe(false);
  const clamped = clampToPolygon(toDisk({ s: 0.9, h: 0 }), triangle);
  expect(contains(triangle, { x: clamped.x * 0.999, y: clamped.y * 0.999 })).toBe(true);
  expect(clampToPolygon({ x: 0.3, y: 0.2 }, [])).toEqual({ x: 0.3, y: 0.2 });
});

it('turns a dragged mask corner into a custom mask kept inside the disk', () => {
  const shown = maskPolygon('triangle', 90);
  const moved = moveMaskCorner(shown, 1, { x: 3, y: 4 });
  expect(moved[1]).toEqual({ x: 0.6, y: 0.8 });
  expect(moved[0]).toEqual(shown[0]);
  // A custom mask at angle 0 shows the moved shape as it is; turned, it turns.
  expect(maskPolygon('custom', 0, moved)).toEqual(moved);
  expect(maskPolygon('custom', 180, moved)[1]!.x).toBeCloseTo(-0.6);
  expect(editableMask('square', [])).toBe(true);
  expect(editableMask('atmosphere', [])).toBe(false);
  expect(editableMask('custom', [])).toBe(false);
});
