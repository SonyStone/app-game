import { expect, test } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
import { renderPreviewPixels } from '../src/features/brush-preview/cpu';
import { mixerSteps } from '../src/features/brush-preview/mixer';
import { createPreviewStroke, stampStride, type PreviewInput } from '../src/features/brush-preview/stroke';

test('dry Mixer uses foreground regardless of Mix and ignores ordinary opacity', () => {
  const input = fixture();
  const painted = renderPreviewPixels(input, tip);
  expect(pixel(painted)).toEqual([255, 0, 0, 255]);
  input.values.tool.mix = 100;
  input.opacity = 0;
  expect(renderPreviewPixels(input, tip)).toEqual(painted);
});

test('empty dry wells and zero Flow leave existing sample pixels intact', () => {
  const input = fixture();
  input.values.tool.load = 0;
  const empty = renderPreviewPixels(input, tip);
  expect(pixel(empty)).toEqual([74, 74, 74, 255]);
  input.values.tool.load = 100;
  input.flow = 0;
  expect(renderPreviewPixels(input, tip)).toEqual(empty);
});

test('Wet and Mix pick up canvas paint; Sample All Layers includes the translucent band', () => {
  const input = fixture();
  Object.assign(input.values.tool, { wetness: 100, mix: 100, load: 0 });
  input.path![0]!.y = 0.5;
  const current = renderPreviewPixels(input, tip);
  input.values.tool.sampleAllLayers = true;
  const all = renderPreviewPixels(input, tip);
  expect(all).not.toEqual(current);
  input.values.tool.sampleAllLayers = false;
  expect(renderPreviewPixels(input, tip)).toEqual(current);
});

test('per-stamp Wet/Mix overrides affect pigment rather than ordinary opacity', () => {
  const input = fixture();
  const stroke = createPreviewStroke(input, tip);
  const dry = renderPreviewPixels(input, tip, { ...stroke, mixing: new Float32Array([0, 1]) });
  expect(pixel(dry)).toEqual([255, 0, 0, 255]);
  const wet = renderPreviewPixels(input, tip, { ...stroke, mixing: new Float32Array([1, 1]) });
  expect(pixel(wet)).not.toEqual(pixel(dry));
});

test('Mixer capacity and wet/mix dynamics follow emitted stamps, not host Strength', () => {
  const input = fixture();
  input.values.tool.load = 1;
  const first = createPreviewStroke(input, tip);
  const data = new Float32Array(stampStride * 2);
  data.set(first.data);
  data.set(first.data, stampStride);
  data[stampStride] = 100;
  const steps = mixerSteps(input, { data, count: 2, mixing: new Float32Array([0.2, 0.3, 0.8, 0.9]) });
  expect(steps[0]!.wet).toBeCloseTo(0.2);
  expect(steps[1]!.mix).toBeCloseTo(0.9);
  expect(steps[0]!.available).toBe(1);
  expect(steps[1]!.available).toBeLessThan(1);
  expect(steps[1]!.remaining).toBe(0);
  input.values.tool.strength = 0;
  input.values.tool.load = 100;
  expect(pixel(renderPreviewPixels(input, tip))).toEqual([255, 0, 0, 255]);
});

function fixture(): PreviewInput {
  const values = brushToFormValues({ id: 'mixer', name: 'Mixer', type: 'computed', settings: {}, diameter: 16 });
  values.useSmoothing = false;
  Object.assign(values.tool, { type: 'MixB', wetness: 0, mix: 0, load: 100 });
  return {
    values,
    width: 64,
    height: 48,
    dpr: 1,
    background: '#000000',
    color: '#ff0000',
    flow: 1,
    opacity: 1,
    path: [{ x: 38 / 64, y: 0.25, pressure: 1, tiltX: 0, tiltY: 0, rotation: 0, time: 0 }]
  };
}
function pixel(pixels: Uint8ClampedArray) {
  return Array.from(pixels.slice((12 * 64 + 38) * 4, (12 * 64 + 38) * 4 + 4));
}
const tip = { width: 1, height: 1, depth: 8 as const, data: new Uint8Array([255]) };
