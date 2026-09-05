import { tgpu } from 'typegpu';
import { describe, expect, it } from 'vitest';
import { vertex, fragment } from './virtualTexture';
import { fallbackFragment } from './viewFallback';
import * as shaders from './shaders';

describe('GPU shader compilation', () => {
  it('resolves the virtual page array shaders', () => {
    expect(tgpu.resolve([vertex, fragment])).toContain('texture_2d_array');
  });
  it('resolves the cold-navigation reprojection shader', () => {
    expect(tgpu.resolve([fallbackFragment])).toContain('discard');
  });
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
