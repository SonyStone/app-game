import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import { createPatternPyramid } from './patternPyramid';
import { preparePatternRegion } from './patternRaster';
import { createPatternSamplingGpu, samplePatternPlanByte } from './patternSamplingGpu';

/** Owns four pattern levels and a GPU byte-raster pipeline. No hardware filtering
 * or automatic mip generation participates in this operation. Destroy this source
 * after submitting its last use. Each rasterized region has a separate lifetime.
 */
export function createPatternRasterGpu(root: TgpuRoot, source: Parameters<typeof createPatternPyramid>[0]) {
  const levels = createPatternPyramid(source);
  const samplers = levels.map(level => createPatternSamplingGpu(root, level));
  const pipeline = root.createComputePipeline({ compute: patternRasterKernel });
  return {
    /** Resident host pixels, packed GPU source bytes and size uniforms. */
    bytes: levels.reduce((sum, level) => sum + level.data.length + Math.ceil(level.data.length / 4) * 4 + 8, 0),
    /** Submits a complete immutable region. Read it with textureLoad at local
     * integer pixels. Destroy the result only after submitting its final reader.
     */
    rasterize(
      scale: number,
      bounds: Parameters<typeof preparePatternRegion>[2],
      origin?: Parameters<typeof preparePatternRegion>[3]
    ) {
      const { level, plan } = preparePatternRegion(levels, scale, bounds, origin);
      const batch = samplers[level]!.prepare([plan]);
      const texture = root.createTexture({ size: [plan.width, plan.height], format: 'rgba8unorm' }).$usage('storage', 'sampled');
      try {
        const output = root.createBindGroup(patternRasterOutput, { output: texture });
        pipeline.with(batch.group).with(output).dispatchWorkgroups(Math.ceil(plan.width / 8), Math.ceil(plan.height / 8));
      } catch (error) {
        texture.destroy();
        throw error;
      } finally {
        batch.destroy();
      }
      return { texture, bytes: plan.width * plan.height * 4, destroy() { texture.destroy(); } };
    },
    destroy() { samplers.forEach(sampler => sampler.destroy()); }
  };
}

const patternRasterOutput = tgpu.bindGroupLayout({
  output: { storageTexture: d.textureStorage2d('rgba8unorm', 'write-only') }
});

const patternRasterKernel = tgpu.computeFn({ workgroupSize: [8, 8], in: { gid: d.builtin.globalInvocationId } })(({ gid }) => {
  'use gpu';
  const size = std.textureDimensions(patternRasterOutput.$.output);
  if (gid.x >= size.x || gid.y >= size.y) return;
  const byte = samplePatternPlanByte(0, gid.x, gid.y);
  std.textureStore(patternRasterOutput.$.output, d.vec2i(gid.xy), d.vec4f(d.f32(byte) / 255));
});
