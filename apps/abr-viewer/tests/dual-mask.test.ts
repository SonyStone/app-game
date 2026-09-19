import { percent, pixels } from '@app-game/abr-parser';
import { expect, test } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
import { renderPreviewPixels } from '../src/features/brush-preview/cpu';
import type { PreviewInput, PreviewStroke } from '../src/features/brush-preview/stroke';

test('overlapping affine secondary tips accumulate byte coverage', () => {
  const input = fixture();
  input.values.useDualBrush = true;
  input.values.dualBrush.mode = 'Mltp';
  input.values.dualBrush.diameter = 16;
  input.values.dualBrush.scatter = 0;
  const tip = { width: 1, height: 1, depth: 8 as const, data: new Uint8Array([255]) };
  const dualTip = { ...tip, width: 32, height: 32, data: new Uint8Array(1024).fill(128) };
  for (const [count, expected] of [
    [1, 128],
    [2, 192],
    [8, 255]
  ]) {
    input.values.dualBrush.count = count;
    const pixels = renderPreviewPixels(input, tip, undefined, { dualTip });
    expect(pixels[(16 * 32 + 16) * 4], `secondary Count ${count}`).toBe(expected);
  }
});

test('repeated opaque primary dabs do not repeatedly accumulate the secondary mask', () => {
  const input = fixture();
  input.values.useDualBrush = true;
  input.values.dualBrush.mode = 'Mltp';
  input.values.dualBrush.diameter = 16;
  input.values.dualBrush.scatter = 0;
  const tip = { width: 1, height: 1, depth: 8 as const, data: new Uint8Array([255]) };
  const dualTip = { ...tip, width: 32, height: 32, data: new Uint8Array(1024).fill(128) };
  for (const count of [1, 2, 8]) {
    const stroke: PreviewStroke = {
      count,
      data: Float32Array.from(
        Array.from({ length: count }, () => [16, 16, 8, 8, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0]).flat()
      )
    };
    const pixels = renderPreviewPixels(input, tip, stroke, { dualTip });
    // Photoshop combines prepared primary 255 with secondary 128 once.
    // Applying Multiply inside each dab instead would build toward full white.
    expect(pixels[(16 * 32 + 16) * 4], `primary dab count ${count}`).toBe(128);
  }
});

test('stroke-wide texture modifies primary coverage before Dual Brush Hard Mix', () => {
  const input = fixture();
  input.values.useDualBrush = true;
  input.values.dualBrush.mode = 'hardMix';
  input.values.dualBrush.diameter = 16;
  input.values.useTexture = true;
  input.values.texture.eachTip = false;
  input.values.texture.mode = 'Mltp';
  input.values.texture.depth = 100;
  const tip = { width: 1, height: 1, depth: 8 as const, data: new Uint8Array([255]) };
  const half = { ...tip, data: new Uint8Array([128]) };
  const pixels = renderPreviewPixels(input, tip, undefined, {
    dualTip: { ...half, width: 32, height: 32, data: new Uint8Array(1024).fill(128) },
    pattern: half
  });
  // The verified Hard Mix kernel receives textured P=128, S=128 and yields 131.
  // Reversing these operations yields 128.
  expect(pixels[(16 * 32 + 16) * 4]).toBe(131);
});

test('a zero affine secondary-tip texel preserves earlier coverage inside the new quad', () => {
  const input = { ...fixture(), stampRole: 'secondary' as const };
  const tip = { width: 2, height: 1, depth: 8 as const, data: new Uint8Array([255, 0]) };
  const stroke = (flips: number[]): PreviewStroke => ({
    count: flips.length,
    data: Float32Array.from(flips.flatMap((flip) => [16, 16, 1, 1, 1, 0, flip, 1, 1, 1, 1, 0, 1, 1, 1, 0]))
  });
  const left = (15 * 32 + 15) * 4;
  const right = left + 4;
  const first = renderPreviewPixels(input, tip, stroke([1]));
  const accumulated = renderPreviewPixels(input, tip, stroke([1, -1]));
  expect([first[left], first[right]]).toEqual([255, 0]);
  expect([accumulated[left], accumulated[right]]).toEqual([255, 255]);
});

test('a later secondary mark preserves mask pixels outside its quad', () => {
  const input = { ...fixture(), stampRole: 'secondary' as const };
  const tip = { width: 1, height: 1, depth: 8 as const, data: new Uint8Array([128]) };
  const stroke: PreviewStroke = {
    count: 2,
    data: Float32Array.from([12, 20].flatMap((x) => [x, 16, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0]))
  };
  const pixels = renderPreviewPixels(input, tip, stroke);
  expect([11, 15, 19].map((x) => pixels[(15 * 32 + x) * 4])).toEqual([128, 0, 128]);
});

function fixture(): PreviewInput {
  const values = brushToFormValues({
    id: 'dual-mask',
    name: 'Dual mask',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      ...{},
      tip: { kind: 'computed', diameter: pixels(16), spacing: percent(10) }
    },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  values.dualBrush.tipId = 'uniform-test-sample';
  return {
    values,
    width: 32,
    height: 32,
    dpr: 1,
    color: '#ffffff',
    background: '#000000',
    flow: 1,
    opacity: 1,
    path: [{ x: 0.5, y: 0.5, pressure: 1, tiltX: 0, tiltY: 0, rotation: 0, time: 0 }]
  };
}
