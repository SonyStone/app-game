import { d, tgpu, type TgpuRoot } from 'typegpu';
import type { TipLevel } from './tipSampling';
import type { planPatternSampling } from './patternSampling';

/** Uploads one selected pattern level and executes host-prepared sampling plans.
 * Source bytes are packed once. Each batch owns immutable axis/rectangle buffers;
 * later preparation cannot overwrite commands awaiting GPU submission. Destroy
 * batches after submitting their last use, and the source after all its batches.
 */
export function createPatternSamplingGpu(root: TgpuRoot, source: TipLevel) {
  const packed = new Uint32Array(Math.max(1, Math.ceil(source.width * source.height / 4)));
  for (let i = 0; i < source.width * source.height; i++) packed[i >> 2]! |= source.data[i]! << ((i & 3) * 8);
  const pixels = root.createBuffer(d.arrayOf(d.u32, packed.length), packed).$usage('storage');
  const size = root.createBuffer(d.vec2u, d.vec2u(source.width, source.height)).$usage('uniform');
  return {
    /** Prepares only O(width + height) coordinate entries per rectangle, not pixels. */
    prepare(plans: readonly ReturnType<typeof planPatternSampling>[]) {
      const axes = new Uint32Array(Math.max(2, plans.reduce((sum, plan) => sum + plan.x.length + plan.y.length, 0)));
      let axisOffset = 0;
      const windows: d.InferInput<typeof PatternWindow>[] = [];
      let length = 0;
      for (const plan of plans) {
        windows.push({ xStart: axisOffset / 2, yStart: axisOffset / 2 + plan.width,
          width: plan.width, height: plan.height, outputStart: length });
        axes.set(plan.x, axisOffset); axisOffset += plan.x.length;
        axes.set(plan.y, axisOffset); axisOffset += plan.y.length;
        length += plan.width * plan.height;
      }
      const axisBuffer = root.createBuffer(d.arrayOf(d.vec2u, axes.length / 2), buffer => buffer.write(axes.buffer)).$usage('storage');
      const windowBuffer = root.createBuffer(d.arrayOf(PatternWindow, Math.max(1, windows.length)), windows.length ? windows : [PatternWindow()]).$usage('storage');
      return {
        group: root.createBindGroup(patternSamplingLayout, { pixels, size, axes: axisBuffer, windows: windowBuffer }),
        length,
        /** Owned coordinate/descriptor bytes; excludes the shared source. */
        bytes: axes.byteLength + Math.max(1, windows.length) * 20,
        destroy() { axisBuffer.destroy(); windowBuffer.destroy(); }
      };
    },
    destroy() { pixels.destroy(); size.destroy(); }
  };
}

const PatternWindow = d.struct({ xStart: d.u32, yStart: d.u32, width: d.u32, height: d.u32, outputStart: d.u32 });

/** Bindings shared by the compute verifier and future fragment consumers. */
export const patternSamplingLayout = tgpu.bindGroupLayout({
  pixels: { storage: d.arrayOf(d.u32) }, size: { uniform: d.vec2u },
  axes: { storage: d.arrayOf(d.vec2u) }, windows: { storage: d.arrayOf(PatternWindow) }
});

/** Samples a local pixel from a prepared rectangle, before tone and inversion. */
export function samplePatternPlanByte(window: number, x: number, y: number) {
  'use gpu';
  const rect = patternSamplingLayout.$.windows[d.u32(window)]!;
  const horizontal = patternSamplingLayout.$.axes[rect.xStart + d.u32(x)]!;
  const vertical = patternSamplingLayout.$.axes[rect.yStart + d.u32(y)]!;
  const size = patternSamplingLayout.$.size;
  const nextX = (horizontal.x + 1) % size.x;
  const nextY = (vertical.x + 1) % size.y;
  const a = patternByte(vertical.x * size.x + horizontal.x);
  const b = patternByte(vertical.x * size.x + nextX);
  const c = patternByte(nextY * size.x + horizontal.x);
  const e = patternByte(nextY * size.x + nextX);
  const fx = d.i32(horizontal.y);
  const fy = d.i32(vertical.y);
  const top = a * 256 + (b - a) * fx;
  const bottom = c * 256 + (e - c) * fx;
  return ((bottom - top) * fy + top * 256 + 32768) >> 16;
}

function patternByte(index: number) {
  'use gpu';
  const offset = d.u32(index);
  return d.i32((patternSamplingLayout.$.pixels[offset >> 2]! >> ((offset & 3) * 8)) & 255);
}

/** Separate destination bindings allow multiple immutable batches in one submission. */
export const patternSamplingOutputLayout = tgpu.bindGroupLayout({ output: { storage: d.arrayOf(d.u32), access: 'mutable' } });

/** One workgroup per 8×8 pixels; Z selects the prepared rectangle. */
export const patternSamplingKernel = tgpu.computeFn({ workgroupSize: [8, 8], in: { id: d.builtin.globalInvocationId } })(({ id }) => {
  'use gpu';
  const rect = patternSamplingLayout.$.windows[id.z]!;
  if (id.x >= rect.width || id.y >= rect.height) return;
  patternSamplingOutputLayout.$.output[rect.outputStart + id.y * rect.width + id.x] = d.u32(samplePatternPlanByte(id.z, id.x, id.y));
});
