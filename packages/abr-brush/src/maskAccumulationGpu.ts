import { d, std, tgpu } from 'typegpu';
import { type accumulatePaintbrushMask, maskRoundingOffset, scalePaintbrushMaskByte } from './maskAccumulation';

/**
 * Uniforms for one rectangle. Each u32 stores either one mask byte or a packed RGBA8 pixel.
 * Address keys describe Photoshop's source/destination allocations, independently of GPU storage offsets.
 */
export const MaskAccumulationParams = d.struct({
  sourceOffset: d.u32,
  sourceStride: d.u32,
  sourceAddress: d.u32,
  destinationOffset: d.u32,
  destinationStride: d.u32,
  scaledSourceAddress: d.u32,
  width: d.u32,
  height: d.u32,
  flow: d.f32,
  opacity: d.f32,
  period: d.u32,
  sourceStart: d.u32,
  destinationStart: d.u32,
  /** Texture-copy mode reads source red and destination alpha, writing premultiplied RGBA8. */
  packedRgba: d.u32,
  color: d.vec4f
});

/** One isolated rectangle per dispatch. Source and destination buffers must not alias. */
export const maskAccumulationLayout = tgpu.bindGroupLayout({
  params: { uniform: MaskAccumulationParams },
  source: { storage: d.arrayOf(d.u32), access: 'readonly' },
  destination: { storage: d.arrayOf(d.u32), access: 'mutable' },
  rounding: { storage: d.arrayOf(d.u32), access: 'readonly' }
});

/**
 * Photoshop's no-Color-Dynamics accumulation on the GPU. Dispatch exactly one workgroup.
 * Each invocation owns one row. A shared count pass preserves sparse-mask rounding order
 * across rows without GPU readback or atomic pixel blending. Maximum height is 256.
 */
export const paintbrushMaskKernel = tgpu.computeFn({
  workgroupSize: [256], in: { row: d.builtin.localInvocationIndex }
})(({ row }) => {
  'use gpu';
  const p = maskAccumulationLayout.$.params;
  const partial = p.flow !== 1;
  const scaleSource = partial && p.opacity !== 1;
  const twoStageFlow = partial && !scaleSource;
  let count = d.u32(0);
  if (row < p.height && partial) {
    for (let x = d.u32(0); x < p.width; x++) {
      const sample = maskAccumulationLayout.$.source[p.sourceOffset + row * p.sourceStride + x]!;
      if (std.select(sample, sample & 255, p.packedRgba > 0) !== 0) count++;
    }
  }
  rowCounts.$[row] = count;
  std.workgroupBarrier();
  if (row >= p.height || p.flow === 0) return;
  let before = d.u32(0);
  for (let y = d.u32(0); y < row; y++) before += rowCounts.$[y]!;
  let scaleCursor = (p.sourceStart + before) % p.period;
  let cursor = d.u32(p.destinationStart);
  if (twoStageFlow) cursor = (cursor + before * 2) % p.period;
  else {
    const sourceAddress = std.select(p.sourceAddress, p.scaledSourceAddress, scaleSource);
    for (let y = d.u32(0); y <= row; y++) {
      cursor = (cursor & 0xfffffffc) | ((sourceAddress + y * p.sourceStride) & 3);
      if (y < row) {
        cursor += p.width + 4;
        if (cursor >= p.period) cursor -= p.period;
      }
    }
  }
  const flowByte = d.u32(std.clamp(std.fma(p.flow, 255, 0.5), 0, 255));
  const opacityByte = d.u32(std.clamp(std.fma(p.opacity, 255, 0.5), 0, 255));
  for (let x = d.u32(0); x < p.width; x++) {
    let value = d.u32(maskAccumulationLayout.$.source[p.sourceOffset + row * p.sourceStride + x]);
    if (p.packedRgba > 0) value &= 255;
    if (value === 0) continue;
    if (scaleSource) {
      value = scalePaintbrushMaskByte(value, flowByte, maskAccumulationLayout.$.rounding[scaleCursor]!);
      scaleCursor++;
    }
    const at = p.destinationOffset + row * p.destinationStride + x;
    const stored = d.u32(maskAccumulationLayout.$.destination[at]);
    const previous = std.select(stored, stored >> 24, p.packedRgba > 0);
    let result = d.u32(previous);
    if (twoStageFlow) {
      const delta = scalePaintbrushMaskByte(value, 255 - previous, maskAccumulationLayout.$.rounding[cursor]!);
      cursor++;
      result = previous +
        scalePaintbrushMaskByte(delta, flowByte, maskAccumulationLayout.$.rounding[cursor]!);
      cursor++;
    } else if (previous < opacityByte) {
      result = previous +
        scalePaintbrushMaskByte(value, opacityByte - previous, maskAccumulationLayout.$.rounding[cursor + x]!);
    }
    if (result !== previous) {
      const alpha = d.f32(result) / 255;
      maskAccumulationLayout.$.destination[at] = std.select(
        result, std.pack4x8unorm(d.vec4f(std.mul(p.color.rgb, alpha), alpha)), p.packedRgba > 0
      );
    }
  }
});

/** Encodes the same explicit rectangle/address contract as the verified CPU byte routine. */
export function maskAccumulationParams(input: Parameters<typeof accumulatePaintbrushMask>[0]) {
  if (input.height > 256 || input.width > 2048 || input.height < 0 || input.width < 0)
    throw new RangeError('Mask accumulation supports rectangles up to 2048 × 256 pixels.');
  if (input.rounding.period <= 0 || input.rounding.bytes.length < input.rounding.period + 2 * input.width + 4)
    throw new RangeError('Mask rounding table needs a positive period and a complete row overrun tail.');
  return {
    sourceOffset: input.source.offset,
    sourceStride: input.source.stride,
    sourceAddress: input.source.address >>> 0,
    destinationOffset: input.destination.offset,
    destinationStride: input.destination.stride,
    scaledSourceAddress: input.scaledSourceAddress >>> 0,
    width: input.width,
    height: input.height,
    flow: Math.fround(input.flow),
    opacity: Math.fround(input.opacity),
    period: input.rounding.period,
    sourceStart: maskRoundingOffset(input.source.address, input.row, input.column, input.rounding.period),
    destinationStart: maskRoundingOffset(input.destination.address, input.row, input.column, input.rounding.period),
    packedRgba: 0,
    color: d.vec4f(0)
  } satisfies d.Infer<typeof MaskAccumulationParams>;
}

const rowCounts = tgpu.workgroupVar(d.arrayOf(d.u32, 256));
