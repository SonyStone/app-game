/// <reference types="node" />
import { initAbr, readLibrary } from '@app-game/abr-parser';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { decodeAbrLibrary, MAX_ABR_BYTES } from './decodeAbrLibrary';

await initAbr(
  readFileSync(new URL('../../../../packages/abr-parser/wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url))
);

const example = () =>
  new Uint8Array(
    readFileSync(new URL('../../../../apps/abr-viewer/src/assets/examples/spatter_brushes.abr', import.meta.url))
  ).buffer;

it('decodes real ABR tips and exposes names without retaining descriptors or compressed source blocks', async () => {
  const library = await decodeAbrLibrary(example(), 'Spatter.abr');
  expect(library.name).toBe('Spatter.abr');
  expect(library.brushes.length).toBeGreaterThan(0);
  expect(library.tips.some((tip) => tip.pixels.some((value) => value > 0))).toBe(true);
  for (const brush of library.brushes) expect(library.tips.some((tip) => tip.id === brush.tipId)).toBe(true);
  for (const tip of library.tips) {
    expect(tip.pixels.length).toBe(tip.width * tip.height);
    expect(Object.keys(tip).sort()).toEqual(['format', 'height', 'id', 'pixels', 'width']);
  }
});

it('rejects invalid/oversized input and limits decoded coverage before allocation', async () => {
  await expect(decodeAbrLibrary(new ArrayBuffer(2), 'bad.abr')).rejects.toThrow();
  await expect(decodeAbrLibrary(new ArrayBuffer(MAX_ABR_BYTES + 1), 'large.abr')).rejects.toThrow('32 MiB');
  const limited = readLibrary(example(), 0);
  expect(limited.images.length === 0).toBe(true);
  expect(limited.errors.some((error) => error.includes('byte budget'))).toBe(true);
  expect(() => readLibrary(example(), -1)).toThrow();
});

it('resets a decoder budget for every file instead of accumulating it across imports', async () => {
  const first = readLibrary(example(), 64 * 1024 * 1024),
    second = readLibrary(example(), 64 * 1024 * 1024);
  expect(second.errors).toEqual(first.errors);
  expect(second.document.brushes.length).toBe(first.document.brushes.length);
});
