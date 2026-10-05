import { percent } from '@app-game/abr-parser';
import { expect, it } from 'vitest';
import { prepareAbrBrush } from './preset';
import { decodeRuntimeBrush, encodeRuntimeBrush } from './runtimeBrush';

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

type TestManifest = {
  version: number;
  engine: { settings: { tipId: string } };
  resources: { width: number; offset: number }[];
  rawSampleData?: string;
};
