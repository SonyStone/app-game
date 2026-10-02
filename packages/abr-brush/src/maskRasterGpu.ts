import { d, tgpu, type TgpuRoot } from 'typegpu';
import {
  MaskAccumulationParams, MaskChunkRange, maskAccumulationLayout, paintbrushMaskKernel, maskBatchLayout,
  maskChunkRecords, createMaskBatchPipelines, maskCoverageLayout, createMaskCoveragePipeline
} from './maskAccumulationGpu';
import { maskRasterMaskAddresses, maskRasterAddresses, maskRasterColorBytes, type MaskRasterRect } from './maskRaster';
import { createMaskRoundingTable } from './maskRounding';
import {
  ColorMaskParams, colorMaskLayout, colorPaintbrushKernel, colorBatchLayout, createColorBatchPipelines
} from './colorMaskAccumulationGpu';
import { maskRoundingOffset } from './maskAccumulation';

/**
 * Bridges per-dab RGBA8 source rendering to Photoshop mask accumulation in a persistent RGBA8 texture.
 * All copies and compute dispatches use the caller's encoder. No pixel data leaves the GPU.
 * Shared scratch can serve multiple destinations in command order; batches belong to their callers.
 * directSource optionally returns byte coverage at rectangle-local x/row. It reads record data through maskParams.
 * Its GPU bindings are supplied when recording a batch.
 * coverageEntries sizes the shared coverage scratch of direct batches, in bytes of coverage; it is at least one
 * full rectangle. A batch whose stamps exceed it is accumulated in consecutive chunks.
 */
export function createMaskRasterGpu(root: TgpuRoot, width: number, height: number, directSource?: (x: number, row: number) => number, coverageEntries = 0) {
  const sourceTexture = root.createTexture({ size: [width, height], format: 'rgba8unorm' }).$usage('render');
  const entries = Math.ceil(Math.min(width, 2048) / 64) * 64 * Math.min(height, 256);
  const sourceEntries = Math.max(entries, coverageEntries);
  const source = root.createBuffer(d.arrayOf(d.u32, sourceEntries)).$usage('storage');
  const destination = root.createBuffer(d.arrayOf(d.u32, entries)).$usage('storage');
  const rounding = createMaskRoundingTable();
  const noise = root.createBuffer(d.arrayOf(d.u32, rounding.bytes.length)).$usage('storage');
  noise.write(Uint32Array.from(rounding.bytes).buffer);
  const params = root.createBuffer(MaskAccumulationParams).$usage('uniform');
  const group = root.createBindGroup(maskAccumulationLayout, { params, source, destination, rounding: noise });
  const pipeline = root.createComputePipeline({ compute: paintbrushMaskKernel }).with(group);
  const directPipeline = directSource
    ? createMaskCoveragePipeline(root, directSource)
    : undefined;
  const batchPipelines = directSource ? createMaskBatchPipelines(root) : undefined;
  // Per chunk record and rectangle row: earlier non-zero pixels and the row's rounding cursor.
  const rowInfo = directSource
    ? root.createBuffer(d.arrayOf(d.vec2u, maskChunkRecords * 256)).$usage('storage')
    : undefined;
  const sourceView = root.unwrap(sourceTexture).createView();
  let colorState: ReturnType<typeof createColorState> | undefined;
  return {
    sourceView,
    /** Shared scratch only. Caller-owned batch memory is reported separately. */
    get bytes() {
      return width * height * 4 + (entries + sourceEntries) * 4 + rounding.bytes.length * 4 + d.sizeOf(MaskAccumulationParams) +
        (rowInfo ? maskChunkRecords * 256 * 8 : 0) +
        (colorState ? sourceEntries * 4 + d.sizeOf(ColorMaskParams) : 0);
    },
    /** Allocate once per scratch tile or preview target; retain until its queued commands have been submitted.
     * direct selects coverage/accumulation dispatches shared by many fixed-color sampled stamps of any size.
     */
    createBatch(capacity: number, mode: 1 | 2 = 1, direct = false) {
      if (direct && (!directPipeline || width % 64 !== 0 || width > 2048 || height > 256))
        throw new Error('Direct mask batches require a source sampler and an aligned target.');
      const color = mode === 2 ? (colorState ??= createColorState()) : undefined;
      // Direct Color Dynamics batches also need mask records: the shared coverage stage reads them.
      const buffer = color && !direct ? undefined : root.createBuffer(d.arrayOf(MaskAccumulationParams, capacity)).$usage('storage');
      const colorBuffer = color ? root.createBuffer(d.arrayOf(ColorMaskParams, capacity)).$usage('storage') : undefined;
      const upload = buffer ? new ArrayBuffer(capacity * d.sizeOf(MaskAccumulationParams)) : undefined;
      const words = upload ? new Uint32Array(upload) : undefined;
      const floats = upload ? new Float32Array(upload) : undefined;
      // Chunk ranges are staged per batch and copied into the uniform in encoder order, between dispatches.
      const ranges = direct ? root.createBuffer(d.arrayOf(MaskChunkRange, capacity)) : undefined;
      const range = direct ? root.createBuffer(MaskChunkRange).$usage('uniform') : undefined;
      const rangeWords = direct ? new Uint32Array(capacity * rangeWordCount) : undefined;
      const batchGroup = direct && !color ? root.createBindGroup(maskBatchLayout, {
        params: buffer!, source, destination, rounding: noise, rowInfo: rowInfo!, range: range!
      }) : undefined;
      // One binding per row stage: the stage number is a constant uniform, selected by the bind group.
      const colorBatchGroups = direct && color ? color.batch().stages.map((stage) => root.createBindGroup(colorBatchLayout, {
        params: colorBuffer!, source, destination, ratio: color.ratio, rounding: noise,
        rowInfo: color.batch().rowInfo, range: range!, stage
      })) : undefined;
      const coverageGroup = direct ? root.createBindGroup(maskCoverageLayout, { params: buffer!, source, range: range! }) : undefined;
      let rects: readonly MaskRasterRect[] = [];
      /** Consecutive records whose coverage fits the shared scratch together. */
      const chunks: {
        first: number; count: number; width: number; height: number;
        left: number; top: number; right: number; bottom: number;
      }[] = [];
      return {
        mode, direct,
        bytes: capacity * ((buffer ? d.sizeOf(MaskAccumulationParams) : 0) + (colorBuffer ? d.sizeOf(ColorMaskParams) : 0)) +
          (ranges ? (capacity + 1) * d.sizeOf(MaskChunkRange) : 0),
        /** Writes once before encoding this batch; do not overwrite it until the encoder has been submitted. */
        write(rectangles: readonly MaskRasterRect[], sources?: readonly { firstRow: number; x?: number; y?: number; data: ArrayLike<number>; offset?: number }[]) {
          if (direct && sources?.length !== rectangles.length) throw new Error('Direct mask source count differs from rectangles.');
          if (rectangles.length > capacity) throw new RangeError('Mask batch exceeds its allocated capacity.');
          rects = rectangles;
          chunks.length = 0;
          let sourceOffset = 0;
          let chunk: (typeof chunks)[number] | undefined;
          const colorRecords: d.Infer<typeof ColorMaskParams>[] = [];
          for (let index = 0; index < rectangles.length; index++) {
            const rect = rectangles[index]!;
            if (direct) {
              const size = Math.ceil(rect.width / 4) * 4 * rect.height;
              if (size > sourceEntries) throw new RangeError('Direct mask coverage exceeds shared scratch capacity.');
              if (!chunk || sourceOffset + size > sourceEntries || chunk.count === maskChunkRecords) {
                chunk = { first: index, count: 0, width: 0, height: 0, left: width, top: height, right: 0, bottom: 0 };
                chunks.push(chunk);
                sourceOffset = 0;
              }

              chunk.count++;
              chunk.width = Math.max(chunk.width, rect.width);
              chunk.height = Math.max(chunk.height, rect.height);
              chunk.left = Math.min(chunk.left, rect.x);
              chunk.top = Math.min(chunk.top, rect.y);
              chunk.right = Math.max(chunk.right, rect.x + rect.width);
              chunk.bottom = Math.max(chunk.bottom, rect.y + rect.height);
            }

            const stride = Math.ceil(rect.width / 4) * 4;
            if (colorBuffer) {
              const address = maskRasterAddresses(rect, width, rounding.period);
              const start = (c: number) => maskRoundingOffset(address.colorAddresses[c]!, rect.y, rect.x, rounding.period);
              colorRecords.push({
                sourceOffset: direct ? sourceOffset : 0, sourceStride: direct ? stride : address.stride,
                destinationOffset: direct ? rect.y * width + rect.x : 0, destinationStride: direct ? width : address.stride,
                width: rect.width, height: rect.height, flow: rect.flow, opacity: rect.opacity,
                period: rounding.period, sourceStart: address.sourceStart, alphaStart: address.destinationStart,
                colorStart: d.vec3u(start(0), start(1), start(2)), color: d.vec3u(...maskRasterColorBytes(rect.color))
              });
              if (!direct) continue;
            }

            const address = maskRasterMaskAddresses(rect, width, rounding.period);
            const source = sources?.[index];
            const at = index * maskParamWords;
            const o = maskParamOffsets;
            words![at + o.sourceOffset] = direct ? sourceOffset : 0;
            words![at + o.sourceStride] = direct ? stride : address.stride;
            words![at + o.sourceAddress] = address.sourceAddress;
            words![at + o.destinationOffset] = direct ? rect.y * width + rect.x : 0;
            words![at + o.destinationStride] = direct ? width : address.stride;
            words![at + o.scaledSourceAddress] = address.scaledSourceAddress;
            words![at + o.width] = rect.width;
            words![at + o.height] = rect.height;
            floats![at + o.flow] = rect.flow;
            floats![at + o.opacity] = rect.opacity;
            words![at + o.period] = rounding.period;
            words![at + o.sourceStart] = address.sourceStart;
            words![at + o.destinationStart] = address.destinationStart;
            words![at + o.packedRgba] = 1;
            for (let c = 0; c < 3; c++) floats![at + o.color + c] = rect.color[c]!;
            floats![at + o.color + 3] = 1;
            for (let c = 0; c < 4; c++) floats![at + o.sourceData + c] = source?.data[(source.offset ?? 0) + c] ?? 0;
            words![at + o.planRow] = source ? source.firstRow + rect.y + (source.y ?? 0) : 0;
            words![at + o.planX] = source?.x ?? 0;
            sourceOffset += stride * rect.height;
          }
          // Queue writes snapshot bytes now; the caller submits prior readers before reusing a batch.
          if (colorRecords.length) colorBuffer!.write(colorRecords);
          if (buffer && rectangles.length) root.device.queue.writeBuffer(root.unwrap(buffer!), 0, upload!, 0, rectangles.length * d.sizeOf(MaskAccumulationParams));
          if (chunks.length) {
            chunks.forEach((item, index) => {
              rangeWords!.set([
                item.first, item.count, item.left, item.top, item.right - item.left, item.bottom - item.top
              ], index * rangeWordCount);
            });
            root.device.queue.writeBuffer(root.unwrap(ranges!), 0, rangeWords!, 0, chunks.length * rangeWordCount);
          }
        },
        /** Per chunk, prepares coverage in parallel and then accumulates its ordered stamps in parallel stages:
         * row counts, row cursors and pixels for fixed color; three row and total stages, then pixels, for Color
         * Dynamics.
         * The destination is copied in once and out once. Every stage uses shared scratch; encode them together
         * before any other batch.
         */
        recordBatch(encoder: GPUCommandEncoder, target: GPUTexture,
          bind: (pipeline: NonNullable<typeof directPipeline>) => NonNullable<typeof directPipeline>) {
          if (!directPipeline || !coverageGroup || !(batchGroup || colorBatchGroups)) throw new Error('This mask batch has no direct source sampler.');
          if (!rects.length) return;
          encoder.copyTextureToBuffer({ texture: target },
            { buffer: root.unwrap(destination), bytesPerRow: width * 4 }, { width, height });
          chunks.forEach((chunk, index) => {
            encoder.copyBufferToBuffer(root.unwrap(ranges!), index * d.sizeOf(MaskChunkRange), root.unwrap(range!), 0, d.sizeOf(MaskChunkRange));
            bind(directPipeline.with(coverageGroup)).with(encoder).dispatchWorkgroups(
              Math.ceil(chunk.width / 8), Math.ceil(chunk.height / 8), chunk.count);
            const columns = Math.ceil((chunk.right - chunk.left) / 8), lines = Math.ceil((chunk.bottom - chunk.top) / 8);
            if (colorBatchGroups) {
              const { pipelines } = color!.batch();
              for (const group of colorBatchGroups) {
                pipelines.rows.with(group).with(encoder).dispatchWorkgroups(Math.ceil(chunk.height / 64), chunk.count);
                pipelines.totals.with(group).with(encoder).dispatchWorkgroups(Math.ceil(chunk.count / 64));
              }

              pipelines.pixels.with(colorBatchGroups[0]!).with(encoder).dispatchWorkgroups(columns, lines);
              return;
            }

            const stages = batchPipelines!;
            stages.rows.with(batchGroup!).with(encoder).dispatchWorkgroups(Math.ceil(chunk.height / 64), chunk.count);
            stages.cursors.with(batchGroup!).with(encoder).dispatchWorkgroups(Math.ceil(chunk.count / 64));
            stages.pixels.with(batchGroup!).with(encoder).dispatchWorkgroups(columns, lines);
          });
          encoder.copyBufferToTexture({ buffer: root.unwrap(destination), bytesPerRow: width * 4 },
            { texture: target }, { width, height });
        },
        /** Source view contains coverage in red unless direct mode supplies it through its bound sampler. */
        record(encoder: GPUCommandEncoder, index: number, target: GPUTexture) {
          if (direct) throw new Error('Use recordBatch for a direct mask batch.');
          const rect = rects[index];
          if (!rect) throw new RangeError('Mask rectangle has not been uploaded.');
          const bytesPerRow = Math.ceil(rect.width / 64) * 256;
          const extent = { width: rect.width, height: rect.height };
          const origin = { x: rect.x, y: rect.y };
          encoder.copyTextureToBuffer({ texture: root.unwrap(sourceTexture), origin },
              { buffer: root.unwrap(source), bytesPerRow }, extent);
            encoder.copyTextureToBuffer({ texture: target, origin },
              { buffer: root.unwrap(destination), bytesPerRow }, extent);
          if (color && colorBuffer) {
            encoder.copyBufferToBuffer(root.unwrap(colorBuffer), index * d.sizeOf(ColorMaskParams),
              root.unwrap(color.params), 0, d.sizeOf(ColorMaskParams));
            color.pipeline.with(encoder).dispatchWorkgroups(1);
          } else {
            encoder.copyBufferToBuffer(root.unwrap(buffer!), index * d.sizeOf(MaskAccumulationParams),
              root.unwrap(params), 0, d.sizeOf(MaskAccumulationParams));
            pipeline.with(encoder).dispatchWorkgroups(1);
          }
          encoder.copyBufferToTexture({ buffer: root.unwrap(destination), bytesPerRow }, { texture: target, origin }, extent);
        },
        destroy() { buffer?.destroy(); colorBuffer?.destroy(); ranges?.destroy(); range?.destroy(); }
      };
    },
    destroy() {
      sourceTexture.destroy(); source.destroy(); destination.destroy(); noise.destroy(); params.destroy();
      rowInfo?.destroy();
      colorState?.destroy();
    }
  };

  function createColorState() {
    const params = root.createBuffer(ColorMaskParams).$usage('uniform');
    const ratio = root.createBuffer(d.arrayOf(d.u32, sourceEntries)).$usage('storage');
    const group = root.createBindGroup(colorMaskLayout, { params, source, destination, ratio, rounding: noise });
    let batch: ReturnType<typeof createColorBatch> | undefined;
    return {
      params, ratio,
      pipeline: root.createComputePipeline({ compute: colorPaintbrushKernel }).with(group),
      /** Created on first use: only direct Color Dynamics batches need it. */
      batch: () => (batch ??= createColorBatch()),
      destroy() {
        params.destroy(); ratio.destroy();
        batch?.rowInfo.destroy();
        batch?.stages.forEach((stage) => stage.destroy());
      }
    };
  }

  /** Pipelines, per-row cursor bases and the three constant stage numbers of batched Color Dynamics chunks. */
  function createColorBatch() {
    return {
      pipelines: createColorBatchPipelines(root),
      rowInfo: root.createBuffer(d.arrayOf(d.vec4u, maskChunkRecords * 256)).$usage('storage'),
      stages: [0, 1, 2].map((stage) => root.createBuffer(d.u32, stage).$usage('uniform'))
    };
  }
}


/** Words of one MaskChunkRange: first, count, origin and size. */
const rangeWordCount = d.sizeOf(MaskChunkRange) / Uint32Array.BYTES_PER_ELEMENT;
const maskParamWords = d.sizeOf(MaskAccumulationParams) / Uint32Array.BYTES_PER_ELEMENT;
const maskParamOffsets = Object.fromEntries(Object.keys(MaskAccumulationParams.propTypes).map(key => [key,
  d.memoryLayoutOf(MaskAccumulationParams, value => value[key as keyof d.InferInput<typeof MaskAccumulationParams>]).offset / Uint32Array.BYTES_PER_ELEMENT
])) as Record<keyof d.InferInput<typeof MaskAccumulationParams>, number>;
