import { brushToFormValues } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { expect, it } from 'vitest';
import { previewBrushSize, previewPaper } from './BrushStrokePreview';

it('draws a brush that fits at its own size and a larger one smaller, still larger than smaller brushes', () => {
  const height = 84;
  expect(previewBrushSize({ ...defaultBrush(), size: 20 }, height)).toBe(20);
  const sizes = [40, 100, 186, 500, 5000].map((size) => previewBrushSize({ ...defaultBrush(), size }, height));
  // The sample path swings 12% of the height each way, which leaves 76% of it for the stroke.
  expect(Math.max(...sizes)).toBeLessThanOrEqual(height * 0.76);
  expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  expect(new Set(sizes.slice(0, 4)).size).toBe(4);
  expect(sizes[2]).toBeLessThan(186);
});

it('draws a scattering ABR brush smaller, so that its spread tips stay inside the preview', () => {
  const source = { id: 't', name: 'T', preset: { tip: { kind: 'computed', diameter: 30 } }, resources: [] };
  const values = brushToFormValues(source as unknown as BrushAsset);
  const abr = (scatter: number): Brush => ({
    ...defaultBrush(),
    size: 40,
    engine: {
      id: 'abr',
      settings: { values: { ...values, useScattering: true, scattering: { ...values.scattering, scatter } } }
    }
  });
  expect(previewBrushSize(abr(0), 84)).toBe(previewBrushSize({ ...defaultBrush(), size: 40 }, 84));
  expect(previewBrushSize(abr(200), 84) * 3).toBeLessThanOrEqual(84 * 0.7 + 1);
});

it('keeps a heavily scattered brush readable rather than shrinking it to dust', () => {
  const source = { id: 't', name: 'T', preset: { tip: { kind: 'computed', diameter: 30 } }, resources: [] };
  const values = brushToFormValues(source as unknown as BrushAsset);
  const scattered = (size: number): Brush => ({
    ...defaultBrush(),
    size,
    engine: {
      id: 'abr',
      settings: { values: { ...values, useScattering: true, scattering: { ...values.scattering, scatter: 1000 } } }
    }
  });
  // 12% of a 96 px preview: tips stay large enough to tell apart.
  expect(previewBrushSize(scattered(40), 96)).toBe(12);
  // A brush smaller than that keeps its own size.
  expect(previewBrushSize(scattered(5), 96)).toBe(5);
});

it('draws a color too light for white paper on dark paper, and every other color on white', () => {
  expect(previewPaper('#000000')).toBe('#ffffff');
  expect(previewPaper('#344b66')).toBe('#ffffff');
  expect(previewPaper('#808080')).toBe('#ffffff');
  expect(previewPaper('#ffffff')).not.toBe('#ffffff');
  expect(previewPaper('#fff6a0')).not.toBe('#ffffff');
  expect(previewPaper('#d8f0ff')).not.toBe('#ffffff');
});
