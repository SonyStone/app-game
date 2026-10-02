import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import { colorPaintbrushAlpha, mixPaintbrushColorByte } from './colorMaskAccumulation';
import { divideMaskBytes } from './effects';
import { scalePaintbrushMaskByte } from './maskAccumulation';
import { MaskChunkRange } from './maskAccumulationGpu';

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
  accumulateColorRow(row);
});

/** One rectangle's accumulation for the invocation owning `row`. Every invocation executes the same barriers. */
function accumulateColorRow(row: number) {
  'use gpu';
  const p = colorParams.$();
  const active = row < p.height && p.flow !== 0;
  let count = d.u32(0);
  if (active) {
    for (let x = d.u32(0); x < p.width; x++)
      if ((colorSourceRead.$(p.sourceOffset + row * p.sourceStride + x) & 255) !== 0) count++;
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
  if (active) {
    for (let x = d.u32(0); x < p.width; x++) {
      const at = p.sourceOffset + row * p.sourceStride + x;
      let value = colorSourceRead.$(at) & 255;
      if (p.flow !== 1 && value !== 0) {
        value = scalePaintbrushMaskByte(value, flowByte, colorRoundingRead.$(cursor));
        cursor++;
      }
      colorRatioWrite.$(at, value);
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
  if (active) {
    for (let x = d.u32(0); x < p.width; x++) {
      const sourceAt = p.sourceOffset + row * p.sourceStride + x;
      const value = colorRatioRead.$(sourceAt);
      if (value === 0) continue;
      const at = p.destinationOffset + row * p.destinationStride + x;
      const stored = colorDestinationRead.$(at);
      const noise = colorRoundingRead.$(cursor);
      cursor++;
      const alpha = d.u32(colorPaintbrushAlpha(stored >> 24, value, opacityByte, noise, p.opacity === 1));
      const numerator = std.select(scalePaintbrushMaskByte(value, opacityByte, noise), value, p.opacity === 1);
      const ratio = d.u32(divideMaskBytes(numerator, alpha));
      colorRatioWrite.$(sourceAt, ratio);
      colorDestinationWrite.$(at, (stored & 0xffffff) | (alpha << 24));
      if (ratio !== 0) count++;
    }
  }
  counts.$[row] = count;
  std.workgroupBarrier();
  before = 0;
  for (let y = d.u32(0); y < row; y++) before += counts.$[y]!;
  if (!active) return;
  let r = (p.colorStart.x + before) % p.period;
  let g = (p.colorStart.y + before) % p.period;
  let b = (p.colorStart.z + before) % p.period;
  for (let x = d.u32(0); x < p.width; x++) {
    const ratio = colorRatioRead.$(p.sourceOffset + row * p.sourceStride + x);
    if (ratio === 0) continue;
    const at = p.destinationOffset + row * p.destinationStride + x;
    const value = colorDestinationRead.$(at);
    const red = d.u32(mixPaintbrushColorByte(value & 255, p.color.x, ratio, colorRoundingRead.$(r)));
    const green = d.u32(mixPaintbrushColorByte((value >> 8) & 255, p.color.y, ratio, colorRoundingRead.$(g)));
    const blue = d.u32(mixPaintbrushColorByte((value >> 16) & 255, p.color.z, ratio, colorRoundingRead.$(b)));
    r++; g++; b++;
    colorDestinationWrite.$(at, (value & 0xff000000) | red | (green << 8) | (blue << 16));
  }
}

const counts = tgpu.workgroupVar(d.arrayOf(d.u32, 256));

/** Storage access is specialized so one routine serves the single-rectangle kernel and ordered batches. */
const colorParams = tgpu.slot(readColorParams);
const colorSourceRead = tgpu.slot(readColorSource);
const colorDestinationRead = tgpu.slot(readColorDestination);
const colorDestinationWrite = tgpu.slot(writeColorDestination);
const colorRatioRead = tgpu.slot(readColorRatio);
const colorRatioWrite = tgpu.slot(writeColorRatio);
const colorRoundingRead = tgpu.slot(readColorRounding);

function readColorParams() { 'use gpu'; return ColorMaskParams(colorMaskLayout.$.params); }
function readColorSource(at: number): number { 'use gpu'; return colorMaskLayout.$.source[at]!; }
function readColorDestination(at: number): number { 'use gpu'; return colorMaskLayout.$.destination[at]!; }
function writeColorDestination(at: number, value: number) { 'use gpu'; colorMaskLayout.$.destination[at] = value; }
function readColorRatio(at: number): number { 'use gpu'; return colorMaskLayout.$.ratio[at]!; }
function writeColorRatio(at: number, value: number) { 'use gpu'; colorMaskLayout.$.ratio[at] = value; }
function readColorRounding(at: number): number { 'use gpu'; return colorMaskLayout.$.rounding[at]!; }

/**
 * One batch owns its immutable records; source, ratio, destination and rounding storage may be shared in submission
 * order. `range` selects the chunk of records processed by one dispatch.
 */
export const colorBatchLayout = tgpu.bindGroupLayout({
  params: { storage: d.arrayOf(ColorMaskParams), access: 'readonly' },
  source: { storage: d.arrayOf(d.u32), access: 'readonly' },
  destination: { storage: d.arrayOf(d.u32), access: 'mutable' },
  ratio: { storage: d.arrayOf(d.u32), access: 'mutable' },
  rounding: { storage: d.arrayOf(d.u32), access: 'readonly' },
  range: { uniform: MaskChunkRange }
});
const colorBatchIndex = tgpu.privateVar(d.u32);

/** Exactly one workgroup processes a chunk's ordered stamps. Both barriers precede the next stamp's reads. */
const colorPaintbrushBatchKernel = tgpu.computeFn({
  workgroupSize: [256], in: { row: d.builtin.localInvocationIndex }
})(({ row }) => {
  'use gpu';
  const range = colorBatchLayout.$.range;
  for (let index = range.first; index < range.first + range.count; index++) {
    colorBatchIndex.$ = index;
    accumulateColorRow(row);
    std.workgroupBarrier();
    std.storageBarrier();
  }
});

/** Binds batch storage to the common Color Dynamics accumulation routine. */
export function createColorBatchPipeline(root: TgpuRoot) {
  return root.with(colorParams, readBatchColorParams).with(colorSourceRead, readBatchColorSource)
    .with(colorDestinationRead, readBatchColorDestination).with(colorDestinationWrite, writeBatchColorDestination)
    .with(colorRatioRead, readBatchColorRatio).with(colorRatioWrite, writeBatchColorRatio)
    .with(colorRoundingRead, readBatchColorRounding).createComputePipeline({ compute: colorPaintbrushBatchKernel });
}

function readBatchColorParams() { 'use gpu'; return ColorMaskParams(colorBatchLayout.$.params[colorBatchIndex.$]!); }
function readBatchColorSource(at: number): number { 'use gpu'; return colorBatchLayout.$.source[at]!; }
function readBatchColorDestination(at: number): number { 'use gpu'; return colorBatchLayout.$.destination[at]!; }
function writeBatchColorDestination(at: number, value: number) { 'use gpu'; colorBatchLayout.$.destination[at] = value; }
function readBatchColorRatio(at: number): number { 'use gpu'; return colorBatchLayout.$.ratio[at]!; }
function writeBatchColorRatio(at: number, value: number) { 'use gpu'; colorBatchLayout.$.ratio[at] = value; }
function readBatchColorRounding(at: number): number { 'use gpu'; return colorBatchLayout.$.rounding[at]!; }
