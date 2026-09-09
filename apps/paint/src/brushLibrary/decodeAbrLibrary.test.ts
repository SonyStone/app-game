/// <reference types="node" />
import { AbrParser } from '@app-game/abr-parser/reader';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { decodeAbrLibrary, MAX_ABR_BYTES } from './decodeAbrLibrary';

const example = () =>
  new Uint8Array(
    readFileSync(new URL('../../../../apps/abr-viewer/src/assets/examples/spatter_brushes.abr', import.meta.url))
  ).buffer;

it('decodes real ABR tips and exposes names without retaining descriptors or compressed source blocks', () => {
  const library = decodeAbrLibrary(example(), 'Spatter.abr');
  expect(library.name).toBe('Spatter.abr');
  expect(library.brushes.length).toBeGreaterThan(0);
  expect(library.tips.some((tip) => tip.pixels.some((value) => value > 0))).toBe(true);
  for (const brush of library.brushes) expect(library.tips.some((tip) => tip.id === brush.tipId)).toBe(true);
  for (const tip of library.tips) {
    expect(tip.pixels.length).toBe(tip.width * tip.height);
    expect(Object.keys(tip).sort()).toEqual(['format', 'height', 'id', 'pixels', 'width']);
  }
});

it('rejects invalid/oversized input and limits decoded coverage before allocation', () => {
  expect(() => decodeAbrLibrary(new ArrayBuffer(2), 'bad.abr')).toThrow();
  expect(() => decodeAbrLibrary(new ArrayBuffer(MAX_ABR_BYTES + 1), 'large.abr')).toThrow('32 MiB');
  const limited = new AbrParser({ maxDecodedBytes: 0 }).parse(example());
  expect(limited.brushes.every((brush) => !brush.brushTip)).toBe(true);
  expect(limited.errors.some((error) => error.includes('byte budget'))).toBe(true);
  expect(() => new AbrParser({ maxDecodedBytes: -1 })).toThrow();
});

it('resets a decoder budget for every file instead of accumulating it across imports', () => {
  const parser = new AbrParser({ maxDecodedBytes: 64 * 1024 * 1024 });
  const first = parser.parse(example()),
    second = parser.parse(example());
  expect(second.errors).toEqual(first.errors);
  expect(second.brushes.length).toBe(first.brushes.length);
});
