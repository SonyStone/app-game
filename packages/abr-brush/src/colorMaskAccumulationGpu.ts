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
 * One batch owns its immutable records; source, ratio, destination, row and rounding storage may be shared in
 * submission order. `range` selects the chunk of records processed by one dispatch. `rowInfo` holds, per record of
 * the chunk and rectangle row, the pixels counted in earlier rows for the scale (x), alpha (y) and RGB (z) rounding
 * cursors, and the row's own count of the stage being built (w).
 */
export const colorBatchLayout = tgpu.bindGroupLayout({
  params: { storage: d.arrayOf(ColorMaskParams), access: 'readonly' },
  source: { storage: d.arrayOf(d.u32), access: 'readonly' },
  destination: { storage: d.arrayOf(d.u32), access: 'mutable' },
  ratio: { storage: d.arrayOf(d.u32), access: 'mutable' },
  rounding: { storage: d.arrayOf(d.u32), access: 'readonly' },
  rowInfo: { storage: d.arrayOf(d.vec4u), access: 'mutable' },
  range: { uniform: MaskChunkRange },
  stage: { uniform: d.u32 }
});

/**
 * Row stage, one invocation per record row; `stage` selects which of the three rounding cursors is prepared.
 * The cursors advance once per non-zero value of their stage, and those values depend only on the stamp, never on
 * the destination, so they can be laid out before any pixel is blended:
 * 0 counts non-zero coverage; 1 scales coverage by flow and stores it in `ratio` (bits 0-7) with the number of
 * non-zero scaled values before it (bits 8-16); 2 adds the number of non-zero RGB ratios before it (bits 17-25).
 * Each stage needs the totals of the previous one. Dispatch ceil(maxHeight / 64) by the record count.
 */
const colorRowKernel = tgpu.computeFn({ workgroupSize: [64], in: { id: d.builtin.globalInvocationId } })(({ id }) => {
  'use gpu';
  const range = colorBatchLayout.$.range;
  const stage = colorBatchLayout.$.stage;
  const p = colorBatchLayout.$.params[range.first + id.y]!;
  if (id.x >= p.height) return;
  const info = id.y * 256 + id.x;
  const base = colorBatchLayout.$.rowInfo[info]!;
  const flowByte = d.u32(std.clamp(std.fma(p.flow, 255, 0.5), 0, 255));
  const opacityByte = d.u32(std.clamp(std.fma(p.opacity, 255, 0.5), 0, 255));
  let count = d.u32(0);
  let cursor = (p.sourceStart + base.x) % p.period;
  if (stage === 2) cursor = (p.alphaStart + base.y) % p.period;
  if (p.flow !== 0) {
    for (let x = d.u32(0); x < p.width; x++) {
      const at = p.sourceOffset + id.x * p.sourceStride + x;
      if (stage === 0) {
        if ((colorBatchLayout.$.source[at]! & 255) !== 0) count++;
      } else if (stage === 1) {
        let value = colorBatchLayout.$.source[at]! & 255;
        if (p.flow !== 1 && value !== 0) {
          value = scalePaintbrushMaskByte(value, flowByte, colorBatchLayout.$.rounding[cursor]!);
          cursor++;
        }
        colorBatchLayout.$.ratio[at] = value | (count << 8);
        if (value !== 0) count++;
      } else {
        const entry = colorBatchLayout.$.ratio[at]!;
        const value = entry & 255;
        if (value === 0) continue;
        // The RGB ratio is non-zero exactly when its numerator is: the divisor never exceeds 255.
        const numerator = std.select(
          scalePaintbrushMaskByte(value, opacityByte, colorBatchLayout.$.rounding[cursor]!), value, p.opacity === 1
        );
        cursor++;
        colorBatchLayout.$.ratio[at] = entry | (count << 17);
        if (numerator !== 0) count++;
      }
    }
  }
  colorBatchLayout.$.rowInfo[info] = d.vec4u(base.xyz, count);
});

/** Turns the row totals of `stage` into running totals for the next stage. One invocation per record. */
const colorRowTotalKernel = tgpu.computeFn({ workgroupSize: [64], in: { id: d.builtin.globalInvocationId } })(({ id }) => {
  'use gpu';
  const range = colorBatchLayout.$.range;
  const stage = colorBatchLayout.$.stage;
  if (id.x >= range.count) return;
  const p = colorBatchLayout.$.params[range.first + id.x]!;
  let before = d.u32(0);
  for (let y = d.u32(0); y < p.height; y++) {
    const at = id.x * 256 + y;
    // Copy the scalars first: a struct read from storage is a reference, and the write below would change it.
    const scale = colorBatchLayout.$.rowInfo[at]!.x;
    const alpha = colorBatchLayout.$.rowInfo[at]!.y;
    const count = colorBatchLayout.$.rowInfo[at]!.w;
    if (stage === 0) colorBatchLayout.$.rowInfo[at] = d.vec4u(before, 0, 0, 0);
    else if (stage === 1) colorBatchLayout.$.rowInfo[at] = d.vec4u(scale, before, 0, 0);
    else colorBatchLayout.$.rowInfo[at] = d.vec4u(scale, alpha, before, 0);
    before += count;
  }
});

/**
 * Pixel stage, one invocation per destination pixel of the chunk's rectangle: applies the chunk's records in order
 * with the cursors laid out by the row stages, producing the bytes of the ordered single-rectangle kernel.
 */
const colorPixelKernel = tgpu.computeFn({ workgroupSize: [8, 8], in: { id: d.builtin.globalInvocationId } })(({ id }) => {
  'use gpu';
  const range = colorBatchLayout.$.range;
  if (id.x >= range.size.x || id.y >= range.size.y) return;
  const px = range.origin.x + id.x;
  const py = range.origin.y + id.y;
  let pixel = d.u32(0);
  let stored = d.u32(0);
  let loaded = false;
  for (let index = d.u32(0); index < range.count; index++) {
    const p = colorBatchLayout.$.params[range.first + index]!;
    const left = p.destinationOffset % p.destinationStride;
    const top = d.u32(p.destinationOffset / p.destinationStride);
    if (px < left || py < top || px >= left + p.width || py >= top + p.height || p.flow === 0) continue;
    const row = py - top;
    const entry = colorBatchLayout.$.ratio[p.sourceOffset + row * p.sourceStride + px - left]!;
    const value = entry & 255;
    if (value === 0) continue;
    if (!loaded) {
      pixel = py * p.destinationStride + px;
      stored = colorBatchLayout.$.destination[pixel]!;
      loaded = true;
    }
    const info = colorBatchLayout.$.rowInfo[index * 256 + row]!;
    const opacityByte = d.u32(std.clamp(std.fma(p.opacity, 255, 0.5), 0, 255));
    // Cursors wrap at each row start and then run on into the table's tail, as in the row kernel.
    const noise = colorBatchLayout.$.rounding[(p.alphaStart + info.y) % p.period + ((entry >> 8) & 511)]!;
    const alpha = d.u32(colorPaintbrushAlpha(stored >> 24, value, opacityByte, noise, p.opacity === 1));
    const numerator = std.select(scalePaintbrushMaskByte(value, opacityByte, noise), value, p.opacity === 1);
    const ratio = d.u32(divideMaskBytes(numerator, alpha));
    stored = (stored & 0xffffff) | (alpha << 24);
    if (ratio === 0) continue;
    const red = d.u32(mixPaintbrushColorByte(
      stored & 255, p.color.x, ratio, colorBatchLayout.$.rounding[(p.colorStart.x + info.z) % p.period + (entry >> 17)]!
    ));
    const green = d.u32(mixPaintbrushColorByte(
      (stored >> 8) & 255, p.color.y, ratio,
      colorBatchLayout.$.rounding[(p.colorStart.y + info.z) % p.period + (entry >> 17)]!
    ));
    const blue = d.u32(mixPaintbrushColorByte(
      (stored >> 16) & 255, p.color.z, ratio,
      colorBatchLayout.$.rounding[(p.colorStart.z + info.z) % p.period + (entry >> 17)]!
    ));
    stored = (stored & 0xff000000) | red | (green << 8) | (blue << 16);
  }
  if (loaded) colorBatchLayout.$.destination[pixel] = stored;
});

/** The stages of a batched Color Dynamics chunk: `rows` and `totals` run once per `stage` value, then `pixels`. */
export function createColorBatchPipelines(root: TgpuRoot) {
  return {
    rows: root.createComputePipeline({ compute: colorRowKernel }),
    totals: root.createComputePipeline({ compute: colorRowTotalKernel }),
    pixels: root.createComputePipeline({ compute: colorPixelKernel })
  };
}
