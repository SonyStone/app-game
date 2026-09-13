import { d, tgpu, type TgpuRoot } from 'typegpu';
import { MaskAccumulationParams, maskAccumulationLayout, paintbrushMaskKernel } from './maskAccumulationGpu';
import { maskRasterAddresses, maskRasterColorBytes, type MaskRasterRect } from './maskRaster';
import { createMaskRoundingTable } from './maskRounding';
import { ColorMaskParams, colorMaskLayout, colorPaintbrushKernel } from './colorMaskAccumulationGpu';
import { maskRoundingOffset } from './maskAccumulation';

/**
 * Bridges per-dab RGBA8 source rendering to Photoshop mask accumulation in a persistent RGBA8 texture.
 * All copies and compute dispatches use the caller's encoder. No pixel data leaves the GPU.
 * Shared scratch can serve multiple destinations in command order; batches belong to their callers.
 */
export function createMaskRasterGpu(root: TgpuRoot, width: number, height: number) {
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
  const sourceView = root.unwrap(sourceTexture).createView();
  let colorState: ReturnType<typeof createColorState> | undefined;
  return {
    sourceView,
    /** Shared scratch only. Caller-owned batch memory is reported separately. */
    get bytes() {
      return width * height * 4 + entries * 8 + rounding.bytes.length * 4 + d.sizeOf(MaskAccumulationParams) +
        (colorState ? entries * 4 + d.sizeOf(ColorMaskParams) : 0);
    },
    /** Allocate once per scratch tile or preview target; retain until its queued commands have been submitted. */
    createBatch(capacity: number, mode: 1 | 2 = 1) {
      const color = mode === 2 ? (colorState ??= createColorState()) : undefined;
      const buffer = color ? undefined : root.createBuffer(d.arrayOf(MaskAccumulationParams, capacity));
      const colorBuffer = color ? root.createBuffer(d.arrayOf(ColorMaskParams, capacity)) : undefined;
      let rects: readonly MaskRasterRect[] = [];
      return {
        mode,
        bytes: capacity * d.sizeOf(color ? ColorMaskParams : MaskAccumulationParams),
        /** Writes once before encoding this batch; do not overwrite it until the encoder has been submitted. */
        write(rectangles: readonly MaskRasterRect[]) {
          if (rectangles.length > capacity) throw new RangeError('Mask batch exceeds its allocated capacity.');
          rects = rectangles;
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
          buffer!.write(rectangles.map(rect => {
            const address = maskRasterAddresses(rect, width, rounding.period);
            return {
              sourceOffset: 0, sourceStride: address.stride, sourceAddress: address.sourceAddress,
              destinationOffset: 0, destinationStride: address.stride, scaledSourceAddress: address.scaledSourceAddress,
              width: rect.width, height: rect.height, flow: rect.flow, opacity: rect.opacity,
              period: rounding.period, sourceStart: address.sourceStart, destinationStart: address.destinationStart,
              packedRgba: 1, color: d.vec4f(...rect.color, 1)
            };
          }));
        },
        /** Source view must contain this dab's coverage in red, with its exterior cleared. */
        record(encoder: GPUCommandEncoder, index: number, target: GPUTexture) {
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
        destroy() { buffer?.destroy(); colorBuffer?.destroy(); }
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
