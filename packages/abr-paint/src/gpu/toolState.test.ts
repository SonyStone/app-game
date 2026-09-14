import { expect, it } from 'vitest';
import { rendererToolState } from './toolState';

it('accepts a bounded structured-cloneable Mixer handoff, including a cleaned reservoir', () => {
  const state = { version: 1, mixer: mixer() };
  expect(rendererToolState.parse(structuredClone(state))).toEqual(state);
  expect(rendererToolState.parse({ version: 1 })).toEqual({ version: 1 });
});

it('rejects incompatible or malformed handoffs before GPU upload', () => {
  for (const patch of [
    { remaining: NaN },
    { remaining: -1 },
    { remaining: 2 },
    { color: 'red' },
    { key: '' },
    { settings: { load: Infinity, autoFill: true, autoClean: false } },
    { pixels: new Uint8Array(4) },
    { pixels: new Float32Array(3 * 256 * 256 * 2) },
    { unknown: true }
  ])
    expect(rendererToolState.safeParse({ version: 1, mixer: { ...mixer(), ...patch } }).success).toBe(false);
  expect(rendererToolState.safeParse({ version: 2 }).success).toBe(false);
});

function mixer() {
  return {
    key: 'sampled-mixer',
    color: '#10aaff',
    remaining: 0,
    settings: { load: 0.25, autoFill: false, autoClean: false },
    pixels: new Uint8Array(3 * 256 * 256 * 8)
  };
}
