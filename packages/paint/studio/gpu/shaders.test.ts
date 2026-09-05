import { tgpu } from 'typegpu';
import { describe, expect, it } from 'vitest';
import * as shaders from './shaders';

describe('GPU shader compilation', () => {
  for (const name of [
    'stampVertex',
    'stampFragment',
    'strokeFragment',
    'tileVertex',
    'tileFragment',
    'compositeFragment',
    'presentFragment'
  ] as const) {
    it(`resolves ${name} to WGSL with the installed TypeGPU compiler`, () => {
      const wgsl = tgpu.resolve([shaders[name]]);
      expect(wgsl).toMatch(/@(vertex|fragment)/);
    });
  }
});
