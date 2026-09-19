import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { composeAbr, initAbr, parseAbr, percent, writeAbr } from '../src/index';

await initAbr(readFileSync(new URL('../wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url)));
it('ships the shared readable API and preserves source through edits and composition', () => {
  const bytes = readFileSync(new URL('../files/Basic_3.abr', import.meta.url));
  const document = parseAbr(bytes);
  expect(document.brushes).toHaveLength(3);
  expect(writeAbr(structuredClone(document))).toEqual(new Uint8Array(bytes));
  document.brushes[0]!.tip!.hardness = percent(43);
  expect(parseAbr(writeAbr(document)).brushes[0]!.tip!.hardness).toBe(43);
  const selected = parseAbr(
    composeAbr({ sources: [document.source], brushes: [{ source: 0, preset: document.brushes[1]! }], hierarchy: [] })
  );
  expect(selected.brushes.map((b) => b.name)).toEqual(['Hard Flat 40']);
  expect('settings' in selected.brushes[0]!).toBe(false);
});
