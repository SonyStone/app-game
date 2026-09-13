import { d, std, tgpu } from 'typegpu';
import { colorPaintbrushAlpha, mixPaintbrushColorByte } from './colorMaskAccumulation';
import { divideMaskBytes } from './effects';
import { scalePaintbrushMaskByte } from './maskAccumulation';

/** One clipped rectangle; color and rounding offsets refer to straight RGB byte planes in Photoshop. */
export const ColorMaskParams = d.struct({
  sourceOffset: d.u32, sourceStride: d.u32,
  destinationOffset: d.u32, destinationStride: d.u32,
  width: d.u32, height: d.u32, flow: d.f32, opacity: d.f32,
  period: d.u32, sourceStart: d.u32, alphaStart: d.u32,
  colorStart: d.vec3u, color: d.vec3u
});

/** Source reads its low byte. Destination stores straight RGBA8; ratio uses the source's offset/stride. */
export const colorMaskLayout = tgpu.bindGroupLayout({
  params: { uniform: ColorMaskParams },
  source: { storage: d.arrayOf(d.u32), access: 'readonly' },
  destination: { storage: d.arrayOf(d.u32), access: 'mutable' },
  ratio: { storage: d.arrayOf(d.u32), access: 'mutable' },
  rounding: { storage: d.arrayOf(d.u32), access: 'readonly' }
});

/**
 * Dispatch one 256-invocation workgroup per rectangle, at most 2048 × 256 pixels.
 * Three sparse-count barriers preserve the separate scale, alpha and RGB rounding cursors.
 * Source, ratio and destination buffers must not alias. Ratio remains available for verification.
 */
export const colorPaintbrushKernel = tgpu.computeFn({
  workgroupSize: [256], in: { row: d.builtin.localInvocationIndex }
})(({ row }) => {
  'use gpu';
  const p = colorMaskLayout.$.params;
  if (p.flow === 0) return;
  let count = d.u32(0);
  if (row < p.height) {
    for (let x = d.u32(0); x < p.width; x++)
      if ((colorMaskLayout.$.source[p.sourceOffset + row * p.sourceStride + x]! & 255) !== 0) count++;
  }
  counts.$[row] = count;
  std.workgroupBarrier();
  let before = d.u32(0);
  for (let y = d.u32(0); y < row; y++) before += counts.$[y]!;
  // Finish all reads before the shared array is reused for the next stage.
  std.workgroupBarrier();
  let cursor = (p.sourceStart + before) % p.period;
  const flowByte = d.u32(std.clamp(std.fma(p.flow, 255, 0.5), 0, 255));
  count = 0;
  if (row < p.height) {
    for (let x = d.u32(0); x < p.width; x++) {
      const at = p.sourceOffset + row * p.sourceStride + x;
      let value = colorMaskLayout.$.source[at]! & 255;
      if (p.flow !== 1 && value !== 0) {
        value = scalePaintbrushMaskByte(value, flowByte, colorMaskLayout.$.rounding[cursor]!);
        cursor++;
      }
      colorMaskLayout.$.ratio[at] = value;
      if (value !== 0) count++;
    }
  }
  counts.$[row] = count;
  std.workgroupBarrier();
  before = 0;
  for (let y = d.u32(0); y < row; y++) before += counts.$[y]!;
  std.workgroupBarrier();
  cursor = (p.alphaStart + before) % p.period;
  const opacityByte = d.u32(std.clamp(std.fma(p.opacity, 255, 0.5), 0, 255));
  count = 0;
  if (row < p.height) {
    for (let x = d.u32(0); x < p.width; x++) {
      const sourceAt = p.sourceOffset + row * p.sourceStride + x;
      const value = colorMaskLayout.$.ratio[sourceAt]!;
      if (value === 0) continue;
      const at = p.destinationOffset + row * p.destinationStride + x;
      const stored = colorMaskLayout.$.destination[at]!;
      const noise = colorMaskLayout.$.rounding[cursor]!;
      cursor++;
      const alpha = d.u32(colorPaintbrushAlpha(stored >> 24, value, opacityByte, noise, p.opacity === 1));
      const numerator = std.select(scalePaintbrushMaskByte(value, opacityByte, noise), value, p.opacity === 1);
      const ratio = d.u32(divideMaskBytes(numerator, alpha));
      colorMaskLayout.$.ratio[sourceAt] = ratio;
      colorMaskLayout.$.destination[at] = (stored & 0xffffff) | (alpha << 24);
      if (ratio !== 0) count++;
    }
  }
  counts.$[row] = count;
  std.workgroupBarrier();
  before = 0;
  for (let y = d.u32(0); y < row; y++) before += counts.$[y]!;
  if (row >= p.height || p.flow === 0) return;
  let r = (p.colorStart.x + before) % p.period;
  let g = (p.colorStart.y + before) % p.period;
  let b = (p.colorStart.z + before) % p.period;
  for (let x = d.u32(0); x < p.width; x++) {
    const ratio = colorMaskLayout.$.ratio[p.sourceOffset + row * p.sourceStride + x]!;
    if (ratio === 0) continue;
    const at = p.destinationOffset + row * p.destinationStride + x;
    const value = colorMaskLayout.$.destination[at]!;
    const red = d.u32(mixPaintbrushColorByte(value & 255, p.color.x, ratio, colorMaskLayout.$.rounding[r]!));
    const green = d.u32(mixPaintbrushColorByte((value >> 8) & 255, p.color.y, ratio, colorMaskLayout.$.rounding[g]!));
    const blue = d.u32(mixPaintbrushColorByte((value >> 16) & 255, p.color.z, ratio, colorMaskLayout.$.rounding[b]!));
    r++; g++; b++;
    colorMaskLayout.$.destination[at] = (value & 0xff000000) | red | (green << 8) | (blue << 16);
  }
});

const counts = tgpu.workgroupVar(d.arrayOf(d.u32, 256));
