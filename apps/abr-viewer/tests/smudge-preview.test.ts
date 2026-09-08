import { expect, test } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
import { renderPreviewPixels } from '../src/features/brush-preview/cpu';
import { createPreviewStroke, stampStride, type PreviewInput } from '../src/features/brush-preview/stroke';

test('Smudge first contact picks up ink; Finger Painting deposits foreground instead', () => {
  const input = fixture();
  expect(pixel(renderPreviewPixels(input, tip), 38, 12)).toEqual([74, 74, 74, 255]);
  input.values.tool.fingerPainting = true;
  expect(pixel(renderPreviewPixels(input, tip), 38, 12)).toEqual([255, 0, 0, 255]);
  input.values.tool.strength = 50;
  const half = pixel(renderPreviewPixels(input, tip), 38, 12);
  expect(Math.abs(half[0]! - 164.5)).toBeLessThanOrEqual(0.5);
  expect(half.slice(1)).toEqual([37, 37, 255]);
});

test('Smudge transports the previous footprint to the next stamp and Strength scales the transfer', () => {
  const input = fixture(),
    stroke = twoStamps(input);
  const strong = renderPreviewPixels(input, tip, stroke);
  expect(pixel(strong, 46, 12)[0]).toBeCloseTo(74, 0);
  input.values.tool.strength = 50;
  expect(pixel(renderPreviewPixels(input, tip, stroke), 46, 12)[0]).toBeCloseTo(90, 0);
  input.values.tool.strength = 0;
  expect(pixel(renderPreviewPixels(input, tip, stroke), 46, 12)[0]).toBe(106);
  expect(pixel(strong, 0, 0)).toEqual([50, 50, 50, 255]);
});

test('Finger Painting excludes the right and bottom edges before later pickup', () => {
  const input = fixture();
  input.values.diameter = 15;
  input.values.tool.fingerPainting = true;
  input.values.tool.strength = 0;
  const baseline = renderPreviewPixels(input, tip);
  input.values.tool.strength = 100;
  const painted = renderPreviewPixels(input, tip);
  expect(pixel(painted, 30, 12)).toEqual([255, 0, 0, 255]);
  expect(pixel(painted, 38, 4)).toEqual([255, 0, 0, 255]);
  expect(pixel(painted, 45, 12)).toEqual(pixel(baseline, 45, 12));
  expect(pixel(painted, 38, 19)).toEqual(pixel(baseline, 38, 19));
});

test('Darken/Lighten restrict the transported color without painting the foreground', () => {
  const input = fixture(),
    stroke = twoStamps(input);
  input.values.tool.mode = 'Lghn';
  expect(pixel(renderPreviewPixels(input, tip, stroke), 46, 12)[0]).toBe(106);
  input.values.tool.mode = 'Drkn';
  expect(pixel(renderPreviewPixels(input, tip, stroke), 46, 12)[0]).toBeCloseTo(74, 0);
});

test('Sample All Layers includes the underlayer and settings changes reset the fixture', () => {
  const input = fixture();
  input.path![0]!.y = 0.5;
  const stroke = twoStamps(input);
  const current = renderPreviewPixels(input, tip, stroke);
  input.values.tool.smudgeAllLayers = true;
  const all = renderPreviewPixels(input, tip, stroke);
  expect(pixel(all, 46, 24)).not.toEqual(pixel(current, 46, 24));
  input.values.tool.smudgeAllLayers = false;
  expect(renderPreviewPixels(input, tip, stroke)).toEqual(current);
});

test('generated Smudge masks ignore dormant tool Opacity/Flow and changing tools stops pickup', () => {
  const input = fixture();
  input.path!.push({ ...input.path![0]!, x: 0.8, time: 20 });
  const expected = renderPreviewPixels(input, tip);
  input.flow = 0;
  input.opacity = 0;
  input.color = '#0000ff';
  expect(renderPreviewPixels(input, tip)).toEqual(expected);
  input.values.tool.type = 'PbTl';
  expect(renderPreviewPixels(input, tip)).not.toEqual(expected);
});

function fixture(): PreviewInput {
  const values = brushToFormValues({ id: 'smudge', name: 'Smudge', type: 'computed', settings: {}, diameter: 16 });
  values.useSmoothing = false;
  Object.assign(values.tool, { type: 'SmTl', strength: 100 });
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

/** Exact two-stamp transport test, independent of path resampling and spacing. */
function twoStamps(input: PreviewInput) {
  const first = createPreviewStroke(input, tip),
    data = new Float32Array(stampStride * 2);
  data.set(first.data);
  data.set(first.data, stampStride);
  data[stampStride] = data[0]! + 8;
  return { data, count: 2 };
}

function pixel(pixels: Uint8ClampedArray, x: number, y: number) {
  return Array.from(pixels.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
}
const tip = { width: 1, height: 1, depth: 8 as const, data: new Uint8Array([255]) };
