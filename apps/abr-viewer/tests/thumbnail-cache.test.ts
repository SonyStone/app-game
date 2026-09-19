import { pixels } from '@app-game/abr-parser';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { brushToFormValues } from '../src/features/brush-detail/brush-form-schema';
import { thumbnailKey, thumbnailSize } from '../src/features/brush-preview/thumbnail-cache';

afterEach(() => vi.unstubAllGlobals());

test('layout jitter keeps the raster; major resizes choose another stable resolution', () => {
  const size = thumbnailSize(300);
  for (const width of [290, 301, 320, 380, 280]) expect(thumbnailSize(width, size)).toBe(size);
  expect(thumbnailSize(600, size)).toBe(512);
  expect(thumbnailSize(120, size)).toBe(128);
});

test('cache keys survive resource reloading and invalidate for changed settings or pixels', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const input = {
    values: brushToFormValues({
      id: 'a',
      name: 'Brush',
      preset: { kind: 'brush', sourceId: 'fixture', ...{}, tip: { kind: 'computed', diameter: pixels(20) } },
      resources: [],
      source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
    }),
    width: 256,
    height: 100,
    dpr: 1,
    color: '#fff',
    background: '#333',
    flow: 1,
    opacity: 1
  };
  const tip = { width: 2, height: 2, depth: 8, data: new Uint8Array([0, 20, 50, 255]) };
  const key = await thumbnailKey(input, tip);
  expect(await thumbnailKey(structuredClone(input), structuredClone(tip))).toBe(key);
  expect(await thumbnailKey({ ...input, values: { ...input.values, name: 'Renamed' } }, tip)).toBe(key);
  expect(await thumbnailKey({ ...input, width: 512 }, tip)).not.toBe(key);
  expect(await thumbnailKey({ ...input, values: { ...input.values, diameter: 30 } }, tip)).not.toBe(key);
  expect(await thumbnailKey(input, { ...tip, data: new Uint8Array(4) })).not.toBe(key);
});
