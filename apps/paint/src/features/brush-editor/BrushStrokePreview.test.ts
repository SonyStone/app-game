import { brushToFormValues } from '@app-game/abr-brush/form';
import type { BrushAsset } from '@app-game/abr-brush/library';
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { expect, it } from 'vitest';
import { previewBrushSize } from './BrushStrokePreview';

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
