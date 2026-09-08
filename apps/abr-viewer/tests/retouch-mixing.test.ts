import { mixPremultiplied } from '@app-game/abr-brush/effects';
import { d } from 'typegpu';
import { expect, test, vi } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
import { renderPreviewPixels } from '../src/features/brush-preview/cpu';
import { sampleBilinear } from '../src/features/brush-preview/smudge';
import { createPreviewStroke, stampStride, type PreviewInput } from '../src/features/brush-preview/stroke';

vi.mock('../src/features/brush-preview/retouch-image', async (original) => {
  const module = await original<typeof import('../src/features/brush-preview/retouch-image')>();
  return {
    ...module,
    retouchFixture(width: number, height: number) {
      const layer = new Uint8Array(width * height * 4),
        below = new Uint8Array(layer.length);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          layer.set(x < 32 ? [255, 0, 0, 255] : [0, 255, 0, 255], (y * width + x) * 4);
          below[(y * width + x) * 4 + 3] = 255;
        }
      return { layer, below };
    }
  };
});
const tip = { width: 1, height: 1, depth: 8 as const, data: new Uint8Array([255]) };
function job(type: string): PreviewInput {
  const values = brushToFormValues({
    id: 'mix',
    name: 'Mix',
    type: 'computed',
    settings: {},
    diameter: 16,
    hardness: 100,
    spacing: 25
  });
  Object.assign(values.tool, { type, strength: 100, mode: 'Nrml' });
  return {
    values,
    width: 64,
    height: 32,
    dpr: 1,
    color: '#ff0000',
    background: '#000000',
    flow: 1,
    opacity: 1,
    path: [{ x: 0.5, y: 0.5, pressure: 1, time: 0, tiltX: 0, tiltY: 0, rotation: 0 }]
  };
}
function pixel(pixels: Uint8ClampedArray, x: number) {
  return Array.from(pixels.slice((16 * 64 + x) * 4, (16 * 64 + x) * 4 + 4));
}
test('Blur decodes neighbours before its Gaussian average, including at full Strength', () => {
  const input = job('BlTl');
  expect(pixel(renderPreviewPixels(input, tip), 32)).toEqual([64, 191, 0, 255]);
  expect(pixel(renderPreviewPixels({ ...input, colorMixing: 'linear' }, tip), 32)).toEqual([137, 225, 0, 255]);
  input.values.tool.strength = 0;
  expect(pixel(renderPreviewPixels({ ...input, colorMixing: 'linear' }, tip), 32)).toEqual([0, 255, 0, 255]);
});
test('Smudge interpolates carried red into green in the selected space', () => {
  const input = job('SmTl');
  input.path![0]!.x = 24 / 64;
  input.values.tool.strength = 50;
  const first = createPreviewStroke(input, tip),
    data = new Float32Array(stampStride * 2);
  data.set(first.data);
  data.set(first.data, stampStride);
  data[stampStride] = 40;
  const stroke = { data, count: 2 };
  expect(pixel(renderPreviewPixels(input, tip, stroke), 40)).toEqual([128, 128, 0, 255]);
  expect(pixel(renderPreviewPixels({ ...input, colorMixing: 'linear' }, tip, stroke), 40)).toEqual([188, 188, 0, 255]);
});
test('Smudge replacement preserves alpha interpolation, including transparent pickup', () => {
  const red = d.vec4f(0.5, 0, 0, 0.5),
    green = d.vec4f(0, 1, 0, 1);
  const result = mixPremultiplied(red, green, 0.5, true);
  expect(result.a).toBe(0.75);
  expect(result.r / result.a).toBeCloseTo(0.6125, 3);
  expect(result.g / result.a).toBeCloseTo(0.836, 3);
  const faded = mixPremultiplied(red, d.vec4f(0), 0.5, true);
  expect(faded.a).toBe(0.25);
  expect(faded.r).toBeCloseTo(0.25);
  expect(mixPremultiplied(red, green, 0, true)).toEqual(red);
  expect(mixPremultiplied(red, green, 1, true)).toEqual(green);
});

test('Smudge interpolates sampled texels before encoding, including transparent edges', () => {
  const read = (x: number) => (x === 0 ? d.vec4f(1, 0, 0, 1) : d.vec4f(0, 1, 0, 1));
  const classic = sampleBilinear(read, 1, 0.5);
  const smooth = sampleBilinear(read, 1, 0.5, true);
  expect(classic.r).toBe(0.5);
  expect(smooth.r).toBeCloseTo(0.73536, 4);
  expect(smooth.g).toBeCloseTo(0.73536, 4);
  const edge = sampleBilinear((x) => (x === 0 ? d.vec4f(1, 0, 0, 1) : d.vec4f(0)), 1, 0.5, true);
  expect(edge.a).toBe(0.5);
  expect(edge.r).toBeCloseTo(0.5);
});
