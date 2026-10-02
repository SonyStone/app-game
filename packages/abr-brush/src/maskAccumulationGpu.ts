import { d, std, tgpu, type TgpuRoot } from 'typegpu';
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
  color: d.vec4f,
  /** Optional per-stamp data consumed by a specialized source sampler. */
  sourceData: d.vec4f,
  /** First row in the sampled-tip plan, for batched coverage preparation. */
  planRow: d.u32,
  /** Tile-local x to complete sampled-plan x; zero for tile-cropped plans. */
  planX: d.i32
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
  accumulateMaskRow(row);
});

function accumulateMaskRow(row: number) {
  'use gpu';
  const p = maskParams.$();
  const partial = p.flow !== 1;
  const scaleSource = partial && p.opacity !== 1;
  const twoStageFlow = partial && !scaleSource;
  let count = d.u32(0);
  if (row < p.height && partial) {
    for (let x = d.u32(0); x < p.width; x++) {
      const sample = maskSourceByte.$(x, row);
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
    let value = d.u32(maskSourceByte.$(x, row));
    if (p.packedRgba > 0) value &= 255;
    if (value === 0) continue;
    if (scaleSource) {
      value = scalePaintbrushMaskByte(value, flowByte, maskRoundingRead.$(scaleCursor));
      scaleCursor++;
    }
    const at = p.destinationOffset + row * p.destinationStride + x;
    const stored = d.u32(maskDestinationRead.$(at));
    const previous = std.select(stored, stored >> 24, p.packedRgba > 0);
    let result = d.u32(previous);
    if (twoStageFlow) {
      const delta = scalePaintbrushMaskByte(value, 255 - previous, maskRoundingRead.$(cursor));
      cursor++;
      result = previous +
        scalePaintbrushMaskByte(delta, flowByte, maskRoundingRead.$(cursor));
      cursor++;
    } else if (previous < opacityByte) {
      result = previous +
        scalePaintbrushMaskByte(value, opacityByte - previous, maskRoundingRead.$(cursor + x));
    }
    if (result !== previous) {
      const alpha = d.f32(result) / 255;
      maskDestinationWrite.$(at, std.select(
        result, std.pack4x8unorm(d.vec4f(std.mul(p.color.rgb, alpha), alpha)), p.packedRgba > 0
      ));
    }
  }
}

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
    color: d.vec4f(0),
    sourceData: d.vec4f(0),
    planRow: 0,
    planX: 0
  } satisfies d.Infer<typeof MaskAccumulationParams>;
}

const rowCounts = tgpu.workgroupVar(d.arrayOf(d.u32, 256));

/** Supplies quantized source coverage. The default reads an uploaded byte or packed RGBA pixel. */
const maskSourceByte = tgpu.slot<(x: number, row: number) => number>(readMaskSource);

function readMaskSource(x: number, row: number): number {
  'use gpu';
  const p = maskAccumulationLayout.$.params;
  return maskAccumulationLayout.$.source[p.sourceOffset + row * p.sourceStride + x]!;
}

/** Uniform source can be specialized to a record in a sequential GPU batch. */
export const maskParams = tgpu.slot(readMaskParams);
const maskDestinationRead = tgpu.slot(readMaskDestination);
const maskDestinationWrite = tgpu.slot(writeMaskDestination);
const maskRoundingRead = tgpu.slot(readMaskRounding);

function readMaskParams() { 'use gpu'; return MaskAccumulationParams(maskAccumulationLayout.$.params); }
function readMaskDestination(at: number): number { 'use gpu'; return maskAccumulationLayout.$.destination[at]!; }
function writeMaskDestination(at: number, value: number) { 'use gpu'; maskAccumulationLayout.$.destination[at] = value; }
function readMaskRounding(at: number): number { 'use gpu'; return maskAccumulationLayout.$.rounding[at]!; }

/**
 * The records one dispatch processes: `count` records from `first`, whose rectangles all lie inside the destination
 * rectangle at `origin` with `size`.
 */
export const MaskChunkRange = d.struct({ first: d.u32, count: d.u32, origin: d.vec2u, size: d.vec2u });

/** Most records one chunk may hold; `rowInfo` has 256 rows for each of them. */
export const maskChunkRecords = 256;

/**
 * One batch owns its immutable records; source, destination, row and rounding storage may be shared in submission
 * order. The destination is `destinationStride` pixels wide and every record's `destinationOffset` addresses it.
 * `rowInfo` holds, per record of the chunk and rectangle row, x: the non-zero source pixels in earlier rows and
 * y: that row's rounding cursor.
 */
export const maskBatchLayout = tgpu.bindGroupLayout({
  source: { storage: d.arrayOf(d.u32), access: 'mutable' },
  params: { storage: d.arrayOf(MaskAccumulationParams), access: 'readonly' },
  destination: { storage: d.arrayOf(d.u32), access: 'mutable' },
  rounding: { storage: d.arrayOf(d.u32), access: 'readonly' },
  rowInfo: { storage: d.arrayOf(d.vec2u), access: 'mutable' },
  range: { uniform: MaskChunkRange }
});

/**
 * Stage 1 of a chunk, one invocation per record row: stores beside each coverage byte the number of non-zero bytes
 * before it in its row (bits 8 and up), and the row's total in `rowInfo`. Photoshop's rounding cursors advance once
 * per non-zero source pixel, so later stages need these counts. Dispatch ceil(maxHeight / 64) by the record count.
 */
const maskRowCountKernel = tgpu.computeFn({ workgroupSize: [64], in: { id: d.builtin.globalInvocationId } })(({ id }) => {
  'use gpu';
  const range = maskBatchLayout.$.range;
  const p = maskBatchLayout.$.params[range.first + id.y]!;
  if (id.x >= p.height) return;
  let count = d.u32(0);
  // Only partial flow consumes rounding entries sparsely; other stamps keep plain coverage bytes.
  if (p.flow !== 1) {
    for (let x = d.u32(0); x < p.width; x++) {
      const at = p.sourceOffset + id.x * p.sourceStride + x;
      const value = maskBatchLayout.$.source[at]! & 255;
      maskBatchLayout.$.source[at] = value | (count << 8);
      if (value !== 0) count++;
    }
  }
  maskBatchLayout.$.rowInfo[id.y * 256 + id.x] = d.vec2u(count, 0);
});

/**
 * Stage 2, one invocation per record: turns row totals into running totals and derives each row's rounding cursor
 * with the same recurrence as the single-rectangle kernel. Dispatch ceil(count / 64).
 */
const maskRowCursorKernel = tgpu.computeFn({ workgroupSize: [64], in: { id: d.builtin.globalInvocationId } })(({ id }) => {
  'use gpu';
  const range = maskBatchLayout.$.range;
  if (id.x >= range.count) return;
  const p = maskBatchLayout.$.params[range.first + id.x]!;
  const scaleSource = p.flow !== 1 && p.opacity !== 1;
  const sourceAddress = std.select(p.sourceAddress, p.scaledSourceAddress, scaleSource);
  let before = d.u32(0);
  let cursor = d.u32(p.destinationStart);
  for (let y = d.u32(0); y < p.height; y++) {
    const at = id.x * 256 + y;
    const count = maskBatchLayout.$.rowInfo[at]!.x;
    cursor = (cursor & 0xfffffffc) | ((sourceAddress + y * p.sourceStride) & 3);
    maskBatchLayout.$.rowInfo[at] = d.vec2u(before, cursor);
    before += count;
    cursor += p.width + 4;
    if (cursor >= p.period) cursor -= p.period;
  }
});

/**
 * Stage 3, one invocation per destination pixel of the chunk's rectangle: applies the chunk's records in order.
 * A pixel depends only on itself across stamps, so pixels run in parallel and produce the bytes of the ordered
 * single-rectangle kernel. Dispatch ceil(size / 8) workgroups.
 */
const maskPixelKernel = tgpu.computeFn({ workgroupSize: [8, 8], in: { id: d.builtin.globalInvocationId } })(({ id }) => {
  'use gpu';
  const range = maskBatchLayout.$.range;
  if (id.x >= range.size.x || id.y >= range.size.y) return;
  const px = range.origin.x + id.x;
  const py = range.origin.y + id.y;
  let previous = d.u32(0);
  let color = d.vec3f(0);
  let loaded = false;
  let changed = false;
  let pixel = d.u32(0);
  for (let index = d.u32(0); index < range.count; index++) {
    const p = maskBatchLayout.$.params[range.first + index]!;
    const left = p.destinationOffset % p.destinationStride;
    const top = d.u32(p.destinationOffset / p.destinationStride);
    if (px < left || py < top || px >= left + p.width || py >= top + p.height || p.flow === 0) continue;
    const x = px - left;
    const row = py - top;
    const entry = maskBatchLayout.$.source[p.sourceOffset + row * p.sourceStride + x]!;
    let value = entry & 255;
    if (value === 0) continue;
    if (!loaded) {
      pixel = py * p.destinationStride + px;
      previous = maskBatchLayout.$.destination[pixel]! >> 24;
      loaded = true;
    }
    const info = maskBatchLayout.$.rowInfo[index * 256 + row]!;
    const before = entry >> 8;
    const partial = p.flow !== 1;
    const scaleSource = partial && p.opacity !== 1;
    const flowByte = d.u32(std.clamp(std.fma(p.flow, 255, 0.5), 0, 255));
    const opacityByte = d.u32(std.clamp(std.fma(p.opacity, 255, 0.5), 0, 255));
    let result = d.u32(previous);
    if (scaleSource) {
      // The scale cursor wraps at each row start and then runs on into the table's tail, as in the row kernel.
      value = scalePaintbrushMaskByte(
        value, flowByte, maskBatchLayout.$.rounding[(p.sourceStart + info.x) % p.period + before]!
      );
    }
    if (partial && !scaleSource) {
      const cursor = (p.destinationStart + info.x * 2) % p.period + before * 2;
      const delta = scalePaintbrushMaskByte(value, 255 - previous, maskBatchLayout.$.rounding[cursor]!);
      result = previous + scalePaintbrushMaskByte(delta, flowByte, maskBatchLayout.$.rounding[cursor + 1]!);
    } else if (previous < opacityByte) {
      result = previous +
        scalePaintbrushMaskByte(value, opacityByte - previous, maskBatchLayout.$.rounding[info.y + x]!);
    }
    if (result !== previous) {
      previous = result;
      color = d.vec3f(p.color.rgb);
      changed = true;
    }
  }
  if (changed) {
    const alpha = d.f32(previous) / 255;
    maskBatchLayout.$.destination[pixel] = std.pack4x8unorm(d.vec4f(std.mul(color, alpha), alpha));
  }
});

/** The three stages of a batched fixed-color chunk, in dispatch order. */
export function createMaskBatchPipelines(root: TgpuRoot) {
  return {
    rows: root.createComputePipeline({ compute: maskRowCountKernel }),
    cursors: root.createComputePipeline({ compute: maskRowCursorKernel }),
    pixels: root.createComputePipeline({ compute: maskPixelKernel })
  };
}

const batchIndex = tgpu.privateVar(d.u32);

/** Separate bindings keep sampled-tip resources within the eight-storage-buffer device minimum. */
export const maskCoverageLayout = tgpu.bindGroupLayout({
  params: { storage: d.arrayOf(MaskAccumulationParams), access: 'readonly' },
  source: { storage: d.arrayOf(d.u32), access: 'mutable' },
  range: { uniform: MaskChunkRange }
});
const coverageByte = tgpu.slot<(x: number, row: number) => number>();
const coverageKernel = tgpu.computeFn({ workgroupSize: [8, 8], in: { id: d.builtin.globalInvocationId } })(({ id }) => {
  'use gpu';
  const index = maskCoverageLayout.$.range.first + id.z;
  batchIndex.$ = index;
  const p = maskCoverageLayout.$.params[index]!;
  if (id.x >= p.width || id.y >= p.height) return;
  maskCoverageLayout.$.source[p.sourceOffset + id.y * p.sourceStride + id.x] = coverageByte.$(id.x, id.y);
});

/** Prepares independent stamp coverage in parallel; destination accumulation remains ordered. */
export function createMaskCoveragePipeline(root: TgpuRoot, sample: (x: number, row: number) => number) {
  return root.with(coverageByte, sample).with(maskParams, readCoverageParams).createComputePipeline({ compute: coverageKernel });
}
function readCoverageParams() { 'use gpu'; return MaskAccumulationParams(maskCoverageLayout.$.params[batchIndex.$]!); }
