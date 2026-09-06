import { tgpu } from 'typegpu';
import { describe, expect, it } from 'vitest';
import { lassoEdge, lassoFill, lassoVertex } from './lassoOverlay';
import * as shaders from './shaders';
import { fallbackFragment } from './viewFallback';
import { fragment, vertex } from './virtualTexture';

describe('GPU shader compilation', () => {
  it('resolves the lasso mask and animated edge shaders', () => {
    for (const shader of [lassoVertex, lassoFill, lassoEdge])
      expect(tgpu.resolve([shader])).toMatch(/@(vertex|fragment)/);
  });
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
