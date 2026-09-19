import { loadBrushLibrary } from '@app-game/abr-brush/library';
import { initAbr, percent } from '@app-game/abr-parser';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { prepareAbrBrush } from './preset';
import { decodeRuntimeBrush, encodeRuntimeBrush } from './runtimeBrush';

await initAbr(readFileSync(new URL('../../abr-parser/wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url)));

it('preserves every prepared Megapack preset and every referenced coverage byte', () => {
  const file = loadBrushLibrary(
    readFileSync(new URL('../../../apps/abr-viewer/src/assets/examples/megapack.abr', import.meta.url))
  );
  expect(file.errors).toEqual([]);
  expect(file.brushes).toHaveLength(465);
  for (const brush of file.brushes) {
    const prepared = prepareAbrBrush(brush);
    const bytes = encodeRuntimeBrush(prepared);
    const loaded = decodeRuntimeBrush(bytes);
    expect(normalize(loaded), brush.name).toEqual(normalize(prepared));
    const length = new DataView(bytes.buffer).getUint32(8, true);
    const manifest = new TextDecoder().decode(bytes.subarray(12, 12 + length));
    for (const field of ['sourceSample', 'sampleDependencies', 'resourceBlocks', 'descriptor', 'rawSampleData'])
      expect(manifest, brush.name).not.toContain(`"${field}"`);
  }
}, 120000);

it('rejects truncated data, wrong versions, missing resources and incorrect dimensions', () => {
  const bytes = encodeRuntimeBrush(
    prepareAbrBrush({
      id: 'a',
      name: 'Round',
      preset: { kind: 'brush', sourceId: 'fixture', tip: { kind: 'computed', spacing: percent(25) } },
      resources: [],
      source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() }
    })
  );
  expect(() => decodeRuntimeBrush(bytes.subarray(0, bytes.length - 1))).toThrow();
  expect(() => decodeRuntimeBrush(new Uint8Array([1, 2]))).toThrow();
  for (const change of [
    (m: TestManifest) => {
      m.version = 2;
    },
    (m: TestManifest) => {
      m.engine.settings.tipId = 'missing';
    },
    (m: TestManifest) => {
      m.resources[0]!.width++;
    },
    (m: TestManifest) => {
      m.resources[0]!.offset++;
    },
    (m: TestManifest) => {
      m.rawSampleData = 'not allowed';
    }
  ])
    expect(() => decodeRuntimeBrush(rewriteManifest(bytes, change))).toThrow();
});

it('owns decoded bytes and uses collision-free resource IDs on repeated loads', () => {
  const bytes = encodeRuntimeBrush(
    prepareAbrBrush({
      id: 'a',
      name: 'Round',
      preset: { kind: 'brush', sourceId: 'fixture', tip: { kind: 'computed', spacing: percent(25) } },
      resources: [],
      source: { format: 'photoshop-abr/v1', bytes: new Uint8Array() }
    })
  );
  const a = decodeRuntimeBrush(bytes),
    b = decodeRuntimeBrush(bytes);
  expect(a.resource.id).not.toBe(b.resource.id);
  a.resource.pixels.fill(0);
  expect(b.resource.pixels.some((value) => value > 0)).toBe(true);
  expect(decodeRuntimeBrush(bytes).resource.pixels).toEqual(b.resource.pixels);
});

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

function rewriteManifest(bytes: Uint8Array, change: (manifest: TestManifest) => void) {
  const length = new DataView(bytes.buffer).getUint32(8, true);
  const manifest = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + length)));
  change(manifest);
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const output = new Uint8Array(bytes.length - length + json.length);
  output.set(bytes.subarray(0, 8));
  new DataView(output.buffer).setUint32(8, json.length, true);
  output.set(json, 12);
  output.set(bytes.subarray(12 + length), 12 + json.length);
  return output;
}

function hash(pixels: Uint8Array) {
  return createHash('sha256').update(pixels).digest('hex');
}

type TestManifest = {
  version: number;
  engine: { settings: { tipId: string } };
  resources: { width: number; offset: number }[];
  rawSampleData?: string;
};
