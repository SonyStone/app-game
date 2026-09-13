import { textureTone } from '@app-game/abr-brush/effects';
import { expect, test } from 'vitest';

// Selected entries of Photoshop 26.0's byte tone-table constructor, including
// both contrast branches and the threshold at maximum contrast.
test.each([
  [0, 33, 0, 33],
  [64, 33, 0, 97],
  [128, 33, 0, 161],
  [255, 33, 0, 255],
  [64, 17, 23, 67],
  [127, 17, 23, 149],
  [192, 17, 23, 233],
  [0, 0, -50, 63],
  [64, 0, -50, 95],
  [127, 0, -50, 127],
  [255, 0, -50, 191],
  [93, 33, 100, 0],
  [94, 33, 100, 255],
  [128, -100, 50, 0],
  [200, -100, 50, 73]
])('texture byte %i, brightness %i, contrast %i', (source, brightness, contrast, expected) => {
  expect(textureTone(source / 255, 0, brightness, contrast)).toBeCloseTo(expected / 255, 7);
  expect(textureTone(source / 255, 1, brightness, contrast)).toBeCloseTo((255 - expected) / 255, 7);
});

test('neutral tone controls preserve every byte', () => {
  for (let source = 0; source <= 255; source++) {
    expect(textureTone(source / 255, 0, 0, 0)).toBeCloseTo(source / 255, 7);
  }
});
