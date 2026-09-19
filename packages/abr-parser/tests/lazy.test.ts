import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

it('loads backends independently, shares concurrent initialization and retries failure', async () => {
  vi.resetModules();
  const js = await import('../src/index');
  const wasm = await import('../src/wasm');
  expect(() => js.parseAbr(new Uint8Array())).toThrow(/initAbr/);
  expect(() => wasm.parseAbr(new Uint8Array())).toThrow(/initAbr/);
  const [first, second] = await Promise.all([js.loadAbr(), js.loadAbr('js')]);
  expect(first).toBe(second);
  const bytes = readFileSync(new URL('../files/Basic_3.abr', import.meta.url));
  const document = js.parseAbr(bytes);
  expect(() => wasm.parseAbr(bytes)).toThrow(/initAbr/);
  await expect(wasm.initAbr(new Uint8Array())).rejects.toThrow();
  const binary = readFileSync(new URL('../wasm/pkg/photoshop_abr_wasm_bg.wasm', import.meta.url));
  await Promise.all([wasm.initAbr(binary), wasm.initAbr(binary)]);
  expect(wasm.parseAbr(bytes)).toEqual(document);
  expect(wasm.writeAbr(structuredClone(document))).toEqual(new Uint8Array(bytes));
  expect(js.writeAbr(wasm.parseAbr(bytes))).toEqual(new Uint8Array(bytes));
  expect(await js.loadAbr('wasm')).not.toBe(first);
});
