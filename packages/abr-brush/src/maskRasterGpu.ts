import { d, tgpu, type TgpuRoot } from 'typegpu';
import {
  MaskAccumulationParams, maskAccumulationLayout, paintbrushMaskKernel, maskBatchLayout,
  createMaskBatchPipeline, maskCoverageLayout, createMaskCoveragePipeline
} from './maskAccumulationGpu';
import { maskRasterMaskAddresses, maskRasterAddresses, maskRasterColorBytes, type MaskRasterRect } from './maskRaster';
import { createMaskRoundingTable } from './maskRounding';
import { ColorMaskParams, colorMaskLayout, colorPaintbrushKernel } from './colorMaskAccumulationGpu';
import { maskRoundingOffset } from './maskAccumulation';

/**
 * Bridges per-dab RGBA8 source rendering to Photoshop mask accumulation in a persistent RGBA8 texture.
 * All copies and compute dispatches use the caller's encoder. No pixel data leaves the GPU.
 * Shared scratch can serve multiple destinations in command order; batches belong to their callers.
 * directSource optionally returns byte coverage at rectangle-local x/row. It reads record data through maskParams.
 * Its GPU bindings are supplied when recording a batch.
 */
export function createMaskRasterGpu(root: TgpuRoot, width: number, height: number, directSource?: (x: number, row: number) => number) {
  const sourceTexture = root.createTexture({ size: [width, height], format: 'rgba8unorm' }).$usage('render');
  const entries = Math.ceil(Math.min(width, 2048) / 64) * 64 * Math.min(height, 256);
  const source = root.createBuffer(d.arrayOf(d.u32, entries)).$usage('storage');
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
  const accumulationPipeline = directSource ? createMaskBatchPipeline(root) : undefined;
  const sourceView = root.unwrap(sourceTexture).createView();
  let colorState: ReturnType<typeof createColorState> | undefined;
  return {
    sourceView,
    /** Shared scratch only. Caller-owned batch memory is reported separately. */
    get bytes() {
      return width * height * 4 + entries * 8 + rounding.bytes.length * 4 + d.sizeOf(MaskAccumulationParams) +
        (colorState ? entries * 4 + d.sizeOf(ColorMaskParams) : 0);
    },
    /** Allocate once per scratch tile or preview target; retain until its queued commands have been submitted.
     * direct selects bounded two-dispatch coverage/accumulation for fixed-color sampled stamps.
     */
    createBatch(capacity: number, mode: 1 | 2 = 1, direct = false) {
      if (direct && (!directPipeline || mode !== 1 || width % 64 !== 0 || width > 2048 || height > 256))
        throw new Error('Direct mask batches require a source sampler and an aligned fixed-color target.');
      const color = mode === 2 ? (colorState ??= createColorState()) : undefined;
      const buffer = color ? undefined : root.createBuffer(d.arrayOf(MaskAccumulationParams, capacity)).$usage('storage');
      const colorBuffer = color ? root.createBuffer(d.arrayOf(ColorMaskParams, capacity)) : undefined;
      const upload = color ? undefined : new ArrayBuffer(capacity * d.sizeOf(MaskAccumulationParams));
      const words = upload ? new Uint32Array(upload) : undefined;
      const floats = upload ? new Float32Array(upload) : undefined;
      const count = direct ? root.createBuffer(d.u32).$usage('uniform') : undefined;
      const batchGroup = direct ? root.createBindGroup(maskBatchLayout, { params: buffer!, source, destination, rounding: noise, count: count! }) : undefined;
      const coverageGroup = direct ? root.createBindGroup(maskCoverageLayout, { params: buffer!, source }) : undefined;
      let rects: readonly MaskRasterRect[] = [];
      return {
        mode, direct,
        bytes: capacity * d.sizeOf(color ? ColorMaskParams : MaskAccumulationParams) + (count ? d.sizeOf(d.u32) : 0),
        /** Writes once before encoding this batch; do not overwrite it until the encoder has been submitted. */
        write(rectangles: readonly MaskRasterRect[], sources?: readonly { firstRow: number; x?: number; y?: number; data: ArrayLike<number>; offset?: number }[]) {
          if (direct && sources?.length !== rectangles.length) throw new Error('Direct mask source count differs from rectangles.');
          if (rectangles.length > capacity) throw new RangeError('Mask batch exceeds its allocated capacity.');
          rects = rectangles;
          count?.write(rectangles.length);
          if (colorBuffer) {
            colorBuffer.write(rectangles.map(rect => {
              const address = maskRasterAddresses(rect, width, rounding.period);
              const start = (c: number) => maskRoundingOffset(address.colorAddresses[c]!, rect.y, rect.x, rounding.period);
              return {
                sourceOffset: 0, sourceStride: address.stride, destinationOffset: 0, destinationStride: address.stride,
                width: rect.width, height: rect.height, flow: rect.flow, opacity: rect.opacity,
                period: rounding.period, sourceStart: address.sourceStart, alphaStart: address.destinationStart,
                colorStart: d.vec3u(start(0), start(1), start(2)), color: d.vec3u(...maskRasterColorBytes(rect.color))
              };
            }));
            return;
          }
          let sourceOffset = 0;
          for (let index = 0; index < rectangles.length; index++) {
            const rect = rectangles[index]!;
            const address = maskRasterMaskAddresses(rect, width, rounding.period);
            const source = sources?.[index];
            const at = index * maskParamWords;
            const o = maskParamOffsets;
            const stride = Math.ceil(rect.width / 4) * 4;
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
          if (direct && sourceOffset > entries) throw new RangeError('Direct mask coverage exceeds shared scratch capacity.');
          // Queue writes snapshot bytes now; the caller submits prior readers before reusing a batch.
          if (rectangles.length) root.device.queue.writeBuffer(root.unwrap(buffer!), 0, upload!, 0, rectangles.length * d.sizeOf(MaskAccumulationParams));
        },
        /** Prepares coverage in parallel, then accumulates ordered stamps in a second dispatch.
         * Both stages and the final copy use shared scratch; encode them together before any other batch.
         */
        recordBatch(encoder: GPUCommandEncoder, target: GPUTexture,
          bind: (pipeline: NonNullable<typeof directPipeline>) => NonNullable<typeof directPipeline>) {
          if (!directPipeline || !batchGroup || !coverageGroup || !accumulationPipeline) throw new Error('This mask batch has no direct source sampler.');
          if (!rects.length) return;
          encoder.copyTextureToBuffer({ texture: target },
            { buffer: root.unwrap(destination), bytesPerRow: width * 4 }, { width, height });
            bind(directPipeline.with(coverageGroup)).with(encoder).dispatchWorkgroups(
              Math.ceil(Math.max(...rects.map(rect => rect.width)) / 8),
              Math.ceil(Math.max(...rects.map(rect => rect.height)) / 8), rects.length);
            accumulationPipeline.with(batchGroup).with(encoder).dispatchWorkgroups(1);
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
        destroy() { buffer?.destroy(); colorBuffer?.destroy(); count?.destroy(); }
      };
    },
    destroy() {
      sourceTexture.destroy(); source.destroy(); destination.destroy(); noise.destroy(); params.destroy();
      colorState?.params.destroy(); colorState?.ratio.destroy();
    }
  };

  function createColorState() {
    const params = root.createBuffer(ColorMaskParams).$usage('uniform');
    const ratio = root.createBuffer(d.arrayOf(d.u32, entries)).$usage('storage');
    const group = root.createBindGroup(colorMaskLayout, { params, source, destination, ratio, rounding: noise });
    return { params, ratio, pipeline: root.createComputePipeline({ compute: colorPaintbrushKernel }).with(group) };
  }
}


const maskParamWords = d.sizeOf(MaskAccumulationParams) / Uint32Array.BYTES_PER_ELEMENT;
const maskParamOffsets = Object.fromEntries(Object.keys(MaskAccumulationParams.propTypes).map(key => [key,
  d.memoryLayoutOf(MaskAccumulationParams, value => value[key as keyof d.InferInput<typeof MaskAccumulationParams>]).offset / Uint32Array.BYTES_PER_ELEMENT
])) as Record<keyof d.InferInput<typeof MaskAccumulationParams>, number>;
