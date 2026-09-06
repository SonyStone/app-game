import { AbrParser, readPatternIndex } from '@app-game/abr-parser/browser';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
import { renderPreviewPixels } from '../src/features/brush-preview/cpu';
import { blendModeId, dualCoverage, textureCoverage } from '../src/features/brush-preview/effects';
import { brushPreviewResources, decodePreviewResources } from '../src/features/brush-preview/resources';
import { generateComputedBrushTip, type PreviewInput } from '../src/features/brush-preview/stroke';

const file = new AbrParser().parse(readFileSync('src/assets/examples/halftones_and_screentones.abr'));
const patterns = readPatternIndex(file.rawPatternData!);

test('Height depth reveals dark pattern features before filling the stroke', () => {
  const mode = blendModeId('Hght');
  expect(textureCoverage(1, 0.2, mode, 0.08)).toBeGreaterThan(0.5);
  expect(textureCoverage(1, 0.9, mode, 0.08)).toBe(0);
  expect(textureCoverage(1, 0.9, mode, 0.5)).toBe(1);
  expect(textureCoverage(0, 0, mode, 1)).toBe(0);
});

test('the real circle halftone retains holes through densely overlapping stamps', () => {
  const brush = file.brushes.find((b) => b.name === "Kyle's Halftone - Circle Range Tiny")!;
  const resources = decodePreviewResources(brushPreviewResources({ ...brush, patternResources: patterns }));
  expect(resources.warning).toBeUndefined();
  expect(resources.pattern).toBeDefined();
  const input: PreviewInput = {
    values: brushToFormValues(brush),
    width: 320,
    height: 96,
    dpr: 1,
    color: '#ffffff',
    background: '#000000',
    flow: 1,
    opacity: 1
  };
  const tip = generateComputedBrushTip(128, input.values.hardness);
  const textured = renderPreviewPixels(input, tip, undefined, resources);
  const plain = renderPreviewPixels(
    { ...input, values: { ...input.values, useTexture: false } },
    tip,
    undefined,
    resources
  );
  let interior = 0,
    holes = 0,
    paint = 0;
  for (let i = 0; i < plain.length; i += 4) {
    if (plain[i]! > 240) {
      interior++;
      if (textured[i]! < 10) holes++;
      if (textured[i]! > 100) paint++;
    }
  }
  expect(interior).toBeGreaterThan(1000);
  expect(holes / interior).toBeGreaterThan(0.2);
  expect(paint / interior).toBeGreaterThan(0.02);
  const deeper = renderPreviewPixels(
    { ...input, values: { ...input.values, texture: { ...input.values.texture, depth: 50 } } },
    tip,
    undefined,
    resources
  );
  const sum = (pixels: Uint8ClampedArray) =>
    pixels.reduce((total, value, index) => total + (index % 4 === 0 ? value : 0), 0);
  expect(sum(deeper)).toBeGreaterThan(sum(textured));
});

test('Hard Mix makes the halftone edges crisp without painting outside the primary tip', () => {
  const mode = blendModeId('hardMix');
  expect(dualCoverage(0.3, 0.9, mode)).toBe(1);
  expect(dualCoverage(0.3, 0.6, mode)).toBe(0);
  expect(dualCoverage(0, 1, mode)).toBe(0);
});
