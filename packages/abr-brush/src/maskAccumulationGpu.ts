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

/** One batch owns its immutable records; destination and rounding storage may be shared in submission order. */
export const maskBatchLayout = tgpu.bindGroupLayout({
  source: { storage: d.arrayOf(d.u32), access: 'readonly' },
  params: { storage: d.arrayOf(MaskAccumulationParams), access: 'readonly' },
  destination: { storage: d.arrayOf(d.u32), access: 'mutable' },
  rounding: { storage: d.arrayOf(d.u32), access: 'readonly' },
  count: { uniform: d.u32 }
});
const batchIndex = tgpu.privateVar(d.u32);

/** Exactly one workgroup processes ordered stamps. Both barriers precede the next stamp's destination reads. */
const paintbrushMaskBatchKernel = tgpu.computeFn({
  workgroupSize: [256], in: { row: d.builtin.localInvocationIndex }
})(({ row }) => {
  'use gpu';
  for (let index = d.u32(0); index < maskBatchLayout.$.count; index++) {
    batchIndex.$ = index;
    accumulateMaskRow(row);
    std.workgroupBarrier();
    std.storageBarrier();
  }
});

/** Binds batch storage to the common accumulation routine and specializes its source sampling. */
export function createMaskBatchPipeline(root: TgpuRoot) {
  return root.with(maskSourceByte, readBatchSource).with(maskParams, readBatchParams)
    .with(maskDestinationRead, readBatchDestination).with(maskDestinationWrite, writeBatchDestination)
    .with(maskRoundingRead, readBatchRounding).createComputePipeline({ compute: paintbrushMaskBatchKernel });
}

function readBatchParams() { 'use gpu'; return MaskAccumulationParams(maskBatchLayout.$.params[batchIndex.$]!); }
function readBatchDestination(at: number): number { 'use gpu'; return maskBatchLayout.$.destination[at]!; }
function writeBatchDestination(at: number, value: number) { 'use gpu'; maskBatchLayout.$.destination[at] = value; }
function readBatchRounding(at: number): number { 'use gpu'; return maskBatchLayout.$.rounding[at]!; }

function readBatchSource(x: number, row: number): number {
  'use gpu';
  const p = maskBatchLayout.$.params[batchIndex.$]!;
  return maskBatchLayout.$.source[p.sourceOffset + row * p.sourceStride + x]!;
}

/** Separate bindings keep sampled-tip resources within the eight-storage-buffer device minimum. */
export const maskCoverageLayout = tgpu.bindGroupLayout({
  params: { storage: d.arrayOf(MaskAccumulationParams), access: 'readonly' },
  source: { storage: d.arrayOf(d.u32), access: 'mutable' }
});
const coverageByte = tgpu.slot<(x: number, row: number) => number>();
const coverageKernel = tgpu.computeFn({ workgroupSize: [8, 8], in: { id: d.builtin.globalInvocationId } })(({ id }) => {
  'use gpu';
  batchIndex.$ = id.z;
  const p = maskCoverageLayout.$.params[id.z]!;
  if (id.x >= p.width || id.y >= p.height) return;
  maskCoverageLayout.$.source[p.sourceOffset + id.y * p.sourceStride + id.x] = coverageByte.$(id.x, id.y);
});

/** Prepares independent stamp coverage in parallel; destination accumulation remains ordered. */
export function createMaskCoveragePipeline(root: TgpuRoot, sample: (x: number, row: number) => number) {
  return root.with(coverageByte, sample).with(maskParams, readCoverageParams).createComputePipeline({ compute: coverageKernel });
}
function readCoverageParams() { 'use gpu'; return MaskAccumulationParams(maskCoverageLayout.$.params[batchIndex.$]!); }
