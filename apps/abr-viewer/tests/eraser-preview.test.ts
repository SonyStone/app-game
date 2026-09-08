import { expect, test } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
import { renderPreviewPixels } from '../src/features/brush-preview/cpu';
import type { PreviewInput } from '../src/features/brush-preview/stroke';

test.each([1, 2, 3])('eraser mode %i removes the sample layer and history restores it', (mode) => {
  const input = fixture(mode);
  input.opacity = 0.25;
  const erased = renderPreviewPixels(input, tip);
  expect(pixel(erased, 0, 0)).toEqual([32, 64, 96, 255]);
  // The center lies on a gray (184) checker square. Block ignores opacity.
  expect(pixel(erased, 32, 24)).toEqual(mode === 3 ? [184, 184, 184, 255] : [70, 94, 118, 255]);
  input.values.tool.eraseToHistory = true;
  const restored = renderPreviewPixels(input, tip);
  expect(pixel(restored, 0, 0)).toEqual([224, 224, 224, 255]);
  expect(pixel(restored, 32, 24)).toEqual(mode === 3 ? [32, 64, 96, 255] : [146, 154, 162, 255]);
});

test('Brush eraser keeps Flow distinct from the stroke Opacity ceiling', () => {
  const input = fixture();
  input.flow = 0.1;
  const faint = renderPreviewPixels(input, tip);
  expect(pixel(faint, 32, 24)).toEqual([47, 76, 105, 255]);
  input.path!.push({ ...input.path![0]!, x: 0.59, time: 20 });
  const accumulated = renderPreviewPixels(input, tip);
  expect(pixel(accumulated, 32, 24)[0]).toBeGreaterThan(pixel(faint, 32, 24)[0]!);
  input.opacity = 0;
  expect(pixel(renderPreviewPixels(input, tip), 32, 24)).toEqual([32, 64, 96, 255]);
});

test.each([2, 3])('eraser mode %i ignores dormant Flow', (mode) => {
  const input = fixture(mode);
  const expected = renderPreviewPixels(input, tip);
  input.flow = 0;
  expect(renderPreviewPixels(input, tip)).toEqual(expected);
});

test('eraser ignores paint mode and brush colors without mutating the preset', () => {
  const input = fixture();
  const expected = renderPreviewPixels(input, tip);
  input.values.tool.mode = 'Dslv';
  input.color = '#00ff00';
  input.secondaryColor = '#0000ff';
  const snapshot = structuredClone(input);
  expect(renderPreviewPixels(input, tip)).toEqual(expected);
  expect(input).toEqual(snapshot);
  input.values.tool.mode = 'Bhnd';
  expect(renderPreviewPixels(input, tip)).toEqual(expected);
});

test('checker size stays at 8 CSS pixels after DPR changes', () => {
  const input = fixture();
  input.values.tool.eraseToHistory = true;
  input.opacity = 0;
  expect(pixel(renderPreviewPixels(input, tip), 8, 0)).toEqual([184, 184, 184, 255]);
  input.dpr = 2;
  const pixels = renderPreviewPixels(input, tip);
  expect(pixel(pixels, 8, 0)).toEqual([224, 224, 224, 255]);
  expect(pixel(pixels, 16, 0)).toEqual([184, 184, 184, 255]);
});

test('switching tool or resource preview removes eraser compositing', () => {
  const input = fixture();
  input.values.tool.type = 'PbTl';
  expect(pixel(renderPreviewPixels(input, tip), 32, 24)).toEqual([255, 0, 0, 255]);
  input.resourcePreview = 'tip';
  const resource = renderPreviewPixels(input, tip);
  input.values.tool.type = 'ErTl';
  input.values.tool.eraseToHistory = true;
  expect(renderPreviewPixels(input, tip)).toEqual(resource);
});

/** One full-coverage stamp isolates tool compositing from sampling and smoothing. */
function fixture(eraserMode = 1): PreviewInput {
  const values = brushToFormValues({ id: 'eraser', name: 'Eraser', type: 'computed', settings: {}, diameter: 16 });
  values.useSmoothing = false;
  Object.assign(values.tool, { type: 'ErTl', eraserMode });
  return {
    values,
    width: 64,
    height: 48,
    dpr: 1,
    background: '#204060',
    color: '#ff0000',
    flow: 1,
    opacity: 1,
    path: [{ x: 0.5, y: 0.5, pressure: 1, tiltX: 0, tiltY: 0, rotation: 0, time: 0 }]
  };
}

function pixel(pixels: Uint8ClampedArray, x: number, y: number) {
  return Array.from(pixels.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
}

const tip = { width: 1, height: 1, depth: 8 as const, data: new Uint8Array([255]) };
