import { expect, test } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
import { renderPreviewPixels } from '../src/features/brush-preview/cpu';
import { createPreviewStroke, type PreviewInput } from '../src/features/brush-preview/stroke';

test('Blur and Sharpen filter existing pixels using the Paint kernel', () => {
  const input = fixture();
  const blur = renderPreviewPixels(input, tip);
  expect(pixel(blur, 31, 12)).toEqual([142, 142, 142, 255]);
  expect(pixel(blur, 32, 12)).toEqual([82, 82, 82, 255]);
  input.values.tool.type = 'ShTl';
  const sharp = renderPreviewPixels(input, tip);
  expect(pixel(sharp, 31, 12)).toEqual([206, 206, 206, 255]);
  expect(pixel(sharp, 32, 12)).toEqual([18, 18, 18, 255]);
  input.values.tool.protectDetail = true;
  const protectedSharp = renderPreviewPixels(input, tip);
  expect(pixel(protectedSharp, 31, 12)).toEqual([174, 174, 174, 255]);
  expect(pixel(protectedSharp, 32, 12)).toEqual([50, 50, 50, 255]);
});

test('Strength, Darken and Lighten control retouching independently of dormant Opacity/Flow/colors', () => {
  const input = fixture();
  input.values.tool.strength = 0;
  const original = renderPreviewPixels(input, tip);
  expect(pixel(original, 32, 12)[0]).toBe(50);
  input.values.tool.strength = 25;
  expect(pixel(renderPreviewPixels(input, tip), 32, 12)[0]).toBe(58);
  input.values.tool.strength = 100;
  input.values.tool.mode = 'Drkn';
  const dark = renderPreviewPixels(input, tip);
  expect(pixel(dark, 32, 12)[0]).toBe(50);
  expect(pixel(dark, 31, 12)[0]).toBe(142);
  input.values.tool.mode = 'Lghn';
  const light = renderPreviewPixels(input, tip);
  expect(pixel(light, 32, 12)[0]).toBe(82);
  expect(pixel(light, 31, 12)[0]).toBe(174);
  input.opacity = 0;
  input.flow = 0;
  input.color = '#00ff00';
  expect(renderPreviewPixels(input, tip)).toEqual(light);
});

test('overlapping stamps repeatedly filter the preceding image, and each gesture resets the fixture', () => {
  const input = fixture();
  const originalInput = structuredClone(input);
  const one = renderPreviewPixels(input, tip);
  input.path!.push({ ...input.path![0]!, x: 0.56, time: 20 });
  const repeated = renderPreviewPixels(input, tip);
  expect(pixel(repeated, 32, 12)[0]).toBeGreaterThan(pixel(one, 32, 12)[0]!);
  expect(renderPreviewPixels(originalInput, tip)).toEqual(one);
  expect(pixel(repeated, 0, 0)).toEqual(pixel(one, 0, 0));
});

test('Sample All Layers changes pickup in the translucent band', () => {
  const input = fixture();
  input.path![0]!.y = 0.5;
  const current = renderPreviewPixels(input, tip);
  input.values.tool.sharpenAllLayers = true;
  const all = renderPreviewPixels(input, tip);
  expect(pixel(all, 32, 24)).not.toEqual(pixel(current, 32, 24));
  expect(pixel(all, 0, 0)).toEqual(pixel(current, 0, 0));
});

test('retouch does not change resource previews or retain image state across tool replacement', () => {
  const input = fixture();
  renderPreviewPixels(input, tip);
  input.values.tool.type = 'PbTl';
  expect(pixel(renderPreviewPixels(input, tip), 32, 12)).toEqual([255, 0, 0, 255]);
  input.resourcePreview = 'tip';
  const resource = renderPreviewPixels(input, tip);
  input.values.tool.type = 'BlTl';
  expect(renderPreviewPixels(input, tip)).toEqual(resource);
});

test('an explicitly supplied stroke controls the retouched region', () => {
  const input = fixture();
  const stroke = createPreviewStroke(input, tip);
  input.path![0]!.x = 0;
  expect(pixel(renderPreviewPixels(input, tip, stroke), 32, 12)[0]).toBe(82);
  expect(pixel(renderPreviewPixels(input, tip), 32, 12)[0]).toBe(50);
});

function fixture(): PreviewInput {
  const values = brushToFormValues({
    id: 'filter',
    name: 'Filter',
    type: 'computed',
    settings: {},
    diameter: 16,
    spacing: 10
  });
  values.useSmoothing = false;
  Object.assign(values.tool, { type: 'BlTl', strength: 100, protectDetail: false });
  return {
    values,
    width: 64,
    height: 48,
    dpr: 1,
    background: '#000000',
    color: '#ff0000',
    flow: 1,
    opacity: 1,
    path: [{ x: 0.5, y: 0.25, pressure: 1, tiltX: 0, tiltY: 0, rotation: 0, time: 0 }]
  };
}

function pixel(pixels: Uint8ClampedArray, x: number, y: number) {
  return Array.from(pixels.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
}

const tip = { width: 1, height: 1, depth: 8 as const, data: new Uint8Array([255]) };
