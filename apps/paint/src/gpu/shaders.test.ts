import { dualCoverage, textureCoverage, textureTone } from '@app-game/abr-brush/effects';
import { d, tgpu } from 'typegpu';
import { describe, expect, it } from 'vitest';
import { lassoEdge, lassoFill, lassoVertex } from '@app-game/paint-core/gpu/lassoOverlay';
import * as shaders from '@app-game/paint-core/gpu/shaders';
import { texturedStampFragment } from '@app-game/paint-core/gpu/texturedStamps';
import { fallbackFragment } from '@app-game/paint-core/gpu/viewFallback';
import { accumulatePaintbrushMaskByte } from '../../../../packages/abr-brush/src/maskAccumulation';
import { fragment, vertex } from '@app-game/paint-core/gpu/virtualTexture';
import { paintbrushMaskKernel } from '../../../../packages/abr-brush/src/maskAccumulationGpu';
import { compositeFragment as previewComposite } from '../../../abr-viewer/src/features/brush-preview/shaders';

describe('GPU shader compilation', () => {
  it('resolves sparse Photoshop mask accumulation with a workgroup count barrier', () => {
    const code = tgpu.resolve([paintbrushMaskKernel]);
    expect(code).toContain('workgroupBarrier');
    expect(code).toContain('@workgroup_size(256)');
    expect(code).toContain('array<u32, 256>');
  });
  it('resolves the ABR preview compositor with a separate global-opacity uniform', () => {
    expect(tgpu.resolve([previewComposite])).toContain('compositeOpacity');
  });
  it('resolves Photoshop mask accumulation as integer arithmetic', () => {
    const accumulate = tgpu.fn([d.u32, d.u32, d.u32, d.u32, d.u32, d.u32], d.u32)(
      (previous, source, flow, opacity, scaleNoise, accumulationNoise) => {
        'use gpu';
        return accumulatePaintbrushMaskByte(previous, source, flow, opacity, scaleNoise, accumulationNoise);
      }
    );
    const wgsl = tgpu.resolve([accumulate]);
    expect(wgsl).toContain('257');
    expect(wgsl).toContain('>>');
    expect(wgsl).not.toContain('f32');
  });
  it('resolves byte Dual Brush modes with dynamic inputs', () => {
    const blend = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((primary, secondary, mode) => {
      'use gpu';
      return dualCoverage(primary, secondary, mode);
    });
    const wgsl = tgpu.resolve([blend]);
    expect(wgsl).toContain('765');
    expect(wgsl).toContain('248');
    expect(wgsl).toContain('>>');
  });
  it('resolves byte texture tone controls with dynamic inputs', () => {
    const tone = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((sample, invert, brightness, contrast) => {
      'use gpu';
      return textureTone(sample, invert, brightness, contrast);
    });
    expect(tgpu.resolve([tone])).toContain('127');
  });
  it('resolves byte texture Height arithmetic with dynamic inputs', () => {
    const height = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((coverage, tone, mode, depth) => {
      'use gpu';
      return textureCoverage(coverage, tone, mode, depth);
    });
    const wgsl = tgpu.resolve([height]);
    expect(wgsl).toContain('32768');
    expect(wgsl).toContain('>>');
  });
  it('resolves textured coverage with mip-filtered sampling', () => {
    expect(tgpu.resolve([texturedStampFragment])).toContain('textureSample');
  });
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
