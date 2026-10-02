import { d, tgpu } from 'typegpu';
import { describe, expect, it } from 'vitest';
import {
  brushNoise,
  dualCoverage,
  grain,
  grainReference,
  textureCoverage,
  textureTone,
  wetEdgesCoverage
} from './effects';
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
  it('maps coverage through the Photoshop RGB8 Wet Edges table', () => {
    // photoshop-analysis rust-reference/src/wet_edges.rs: ceil(3v / 2) up to 128, then 192 - trunc(42 (v - 128)² / 127²).
    const table = (value: number) =>
      value <= 128 ? Math.ceil((value * 3) / 2) : 192 - Math.trunc((42 / 16129) * (value - 128) ** 2);
    for (let value = 0; value <= 255; value++) {
      expect(Math.round(wetEdgesCoverage(value / 255) * 255), `coverage ${value}`).toBe(table(value));
    }

    expect([0, 1, 128, 255].map((value) => Math.round(wetEdgesCoverage(value / 255) * 255))).toEqual([0, 2, 192, 150]);
    const lookup = tgpu.fn([d.f32], d.f32)((coverage) => {
      'use gpu';
      return wetEdgesCoverage(coverage);
    });
    expect(tgpu.resolve([lookup])).toContain('16129');
  });
  it('resolves brush grain as an integer hash without trigonometry', () => {
    const noise = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((x, y, seed) => {
      'use gpu';
      return grain(x, y, seed);
    });
    const wgsl = tgpu.resolve([noise]);
    expect(wgsl).not.toContain('sin(');
    expect(wgsl).toContain('2221713035u');
  });
  it('keeps brush grain uniform far from the document origin', () => {
    const near = Array.from({ length: 4096 }, (_, i) => grainReference(i % 64, Math.floor(i / 64), 13.75));
    const far = Array.from({ length: 4096 }, (_, i) => grainReference(65000 + (i % 64), -9_000_000 + Math.floor(i / 64), 13.75));
    for (const values of [near, far]) {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...values)).toBeLessThan(1);
      expect(mean).toBeCloseTo(0.5, 1);
      expect(new Set(values).size).toBeGreaterThan(4000);
    }
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

describe('Photoshop brush texture and Noise kernels', () => {
  // Bytes from the photoshop-analysis Rust reference, which matches original texture kernels exhaustively.
  // Mode ids follow blendModeId: 0 Multiply, 1 Subtract, 3 Overlay, 5 Color Burn, 6 Linear Burn, 7 Hard Mix.
  it.each([
    [7, 8, 128, 200, 0],
    [7, 8, 191, 0, 0],
    [7, 8, 192, 0, 3],
    [7, 8, 230, 128, 167],
    [7, 255, 100, 200, 235],
    [1, 128, 200, 100, 150],
    [6, 128, 200, 100, 122],
    [0, 128, 200, 100, 139],
    [3, 128, 100, 200, 129],
    [5, 128, 200, 100, 177],
    [5, 255, 200, 50, 5]
  ])('texture mode %i at depth %i maps coverage %i over tone %i to %i', (mode, depth, coverage, tone, expected) => {
    expect(Math.round(textureCoverage(coverage / 255, tone / 255, mode, depth / 255) * 255)).toBe(expected);
  });

  it('matches the Photoshop Noise byte kernel for every coverage and noise byte', () => {
    // photoshop-analysis rust-reference/src/brush_noise.rs `noisy_byte` at the sampled-tip strength 170.
    const rounded = (product: number) => (((product + 128 + ((product + 128) >> 8)) >> 8) & 255);
    const reference = (source: number, noise: number) => {
      if (source === 0 || source === 255) return source;
      const perturbed = source < 128 ? rounded(source * noise * 2) : 255 - rounded(((255 - source) & 127) * noise * 2);
      const magnitude = rounded(Math.abs(source - perturbed) * 170);
      return perturbed < source ? source - magnitude : source + magnitude;
    };
    for (let source = 0; source <= 255; source++) {
      for (let noise = 0; noise <= 255; noise++) {
        const actual = brushNoise(source / 255, (noise + 0.5) / 256) * 255;
        if (actual !== reference(source, noise)) {
          throw new Error(`Noise(${source}, ${noise}) = ${actual}, expected ${reference(source, noise)}`);
        }
      }
    }
  });

  it('keeps Noise mean-preserving and leaves empty and solid coverage unchanged', () => {
    expect(brushNoise(0, 0.9)).toBe(0);
    expect(brushNoise(1, 0.1)).toBe(1);
    for (const coverage of [0.1, 0.4, 0.6, 0.9]) {
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += brushNoise(coverage, (i + 0.5) / 1000);
      expect(sum / 1000).toBeCloseTo(coverage, 2);
    }
  });
});
