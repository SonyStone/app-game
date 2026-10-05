import { tgpu } from 'typegpu';
import { describe, expect, it } from 'vitest';
import { selectionEdge, shapeVertex, tileFragment, tileVertex } from './selectionOverlay';
import * as shaders from './shaders';
import { clipFragment } from './strokeClip';
import { texturedStampFragment } from './texturedStamps';
import { fallbackFragment } from './viewFallback';
import { fragment, vertex } from './virtualTexture';

describe('GPU shader compilation', () => {
  it('resolves textured coverage with mip-filtered sampling', () => {
    expect(tgpu.resolve([texturedStampFragment])).toContain('textureSample');
  });
  it('resolves the selection mask and animated edge shaders', () => {
    for (const shader of [tileVertex, tileFragment, shapeVertex, selectionEdge])
      expect(tgpu.resolve([shader])).toMatch(/@(vertex|fragment)/);
    expect(tgpu.resolve([tileFragment])).toContain('texture_2d_array');
  });
  it('resolves the soft selection clip of strokes', () => {
    expect(tgpu.resolve([clipFragment])).toContain('mix');
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
