import { brushToFormValues } from '@app-game/abr-brush/form';
import { loadBrushLibrary } from '@app-game/abr-brush/library';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { readAdobeBrushFixture } from '../../../scripts/adobe-brush-fixture.mjs';
import { adaptiveBrushQuality } from './adaptiveQuality';
import { prepareAbrBrush } from './preset';
import { decodeRuntimeBrush, encodeRuntimeBrush } from './runtimeBrush';

// The only suite that parses Adobe's full 465-preset Megapack (375 MB, pinned by SHA-256 and cached in
// .tmp/adobe-brushes). Tests that need a few named presets use `@app-game/abr-brush/testing/adobeBrushes`.
const megapack = loadBrushLibrary(await readAdobeBrushFixture('megapack.abr'));

it('parses all 465 Megapack presets without errors', () => {
  expect(megapack.errors).toEqual([]);
  expect(megapack.brushes).toHaveLength(465);
});

it('preserves every prepared Megapack preset and every referenced coverage byte', () => {
  for (const brush of megapack.brushes) {
    const prepared = prepareAbrBrush(brush);
    const bytes = encodeRuntimeBrush(prepared);
    const loaded = decodeRuntimeBrush(bytes);
    expect(normalize(loaded), brush.name).toEqual(normalize(prepared));
    const length = new DataView(bytes.buffer).getUint32(8, true);
    const manifest = new TextDecoder().decode(bytes.subarray(12, 12 + length));

    for (const field of ['sourceSample', 'sampleDependencies', 'resourceBlocks', 'descriptor', 'rawSampleData']) {
      expect(manifest, brush.name).not.toContain(`"${field}"`);
    }
  }
}, 120000);

it('gives every Megapack preset the same LOD sampling budget, including special tool paths', () => {
  for (const brush of megapack.brushes) {
    const values = brushToFormValues(brush);

    for (const mixing of ['classic', 'linear'] as const) {
      for (const [lod, spacing] of [
        [0, 1],
        [1, 2],
        [3, 8],
        [6, 64]
      ] as const) {
        // One stamp per view pixel; painting tools and the Mixer may widen that to a tenth of the stamp.
        const quality = adaptiveBrushQuality(true, values, lod, values.tool.mode, mixing)!;
        const retouch = ['SmTl', 'BlTl', 'ShTl', 'PcTl'].includes(values.tool.type);
        expect(quality.minimumSpacing, brush.name).toBe(spacing);
        expect(quality.tipSpacing, brush.name).toBe(retouch || lod === 0 ? undefined : lod === 1 ? 0.06 : 0.1);
      }

      expect(adaptiveBrushQuality(false, values, 3)).toBeUndefined();
    }
  }
});

/** Replaces random resource IDs with their positions and pixels with digests, so two preparations compare equal. */
function normalize(preset: ReturnType<typeof prepareAbrBrush>) {
  const id = (value: string | undefined) =>
    value === undefined ? undefined : preset.resources.findIndex((r) => r.id === value);
  return {
    ...preset,
    resource: { ...preset.resource, pixels: hash(preset.resource.pixels), id: id(preset.resource.id) },
    resources: preset.resources.map((r) => ({ ...r, pixels: hash(r.pixels), id: id(r.id) })),
    engine: {
      ...preset.engine,
      settings: {
        ...preset.engine.settings,
        tipId: id(preset.engine.settings.tipId),
        patternId: id(preset.engine.settings.patternId),
        dualId: id(preset.engine.settings.dualId)
      }
    }
  };
}

function hash(pixels: Uint8Array) {
  return createHash('sha256').update(pixels).digest('hex');
}
