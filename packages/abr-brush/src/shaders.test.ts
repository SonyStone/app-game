import { d, tgpu } from 'typegpu';
import { describe, expect, it } from 'vitest';
import { dualCoverage, textureCoverage, textureTone } from './effects';
import { accumulatePaintbrushMaskByte } from './maskAccumulation';
import { paintbrushMaskKernel } from './maskAccumulationGpu';

describe('ABR shader compilation', () => {
  it('resolves sparse Photoshop mask accumulation with a workgroup count barrier', () => {
    const code = tgpu.resolve([paintbrushMaskKernel]);
    expect(code).toContain('workgroupBarrier');
    expect(code).toContain('@workgroup_size(256)');
    expect(code).toContain('array<u32, 256>');
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
});
