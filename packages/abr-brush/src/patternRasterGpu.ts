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
    /** Submits an immutable region immediately. Destroy after its final reader is submitted. */
    rasterize(
      scale: number,
      bounds: Parameters<typeof preparePatternRegion>[2],
      origin?: Parameters<typeof preparePatternRegion>[3]
    ) {
      const region = createRegion(bounds.width, bounds.height);
      const encoder = root.device.createCommandEncoder();
      try {
        const batch = record(encoder, region, scale, bounds, origin);
        try { root.device.queue.submit([encoder.finish()]); }
        finally { batch.destroy(); }
      } catch (error) {
        region.destroy();
        throw error;
      }
      return region;
    },
    /** Allocates a reusable destination. Record writes and readers in command order. */
    createRegion,
    /** Encodes a region into the caller's batch, avoiding a separate queue submission.
     * The returned coordinate buffers must survive until that batch is submitted.
     * Reusing a destination is safe when all its earlier readers precede this write.
     */
    record,
    destroy() { samplers.forEach(sampler => sampler.destroy()); }
  };

  function createRegion(width: number, height: number) {
    const texture = root.createTexture({ size: [width, height], format: 'rgba8unorm' }).$usage('storage', 'sampled');
    const output = root.createBindGroup(patternRasterOutput, { output: texture });
    return { texture, output, bytes: width * height * 4, destroy() { texture.destroy(); } };
  }

  function record(
    encoder: GPUCommandEncoder, region: ReturnType<typeof createRegion>, scale: number,
    bounds: Parameters<typeof preparePatternRegion>[2], origin?: Parameters<typeof preparePatternRegion>[3]
  ) {
    if (bounds.width !== region.texture.props.size[0] || bounds.height !== region.texture.props.size[1])
      throw new RangeError('Pattern region dimensions must match its destination.');
    const { level, plan } = preparePatternRegion(levels, scale, bounds, origin);
    const batch = samplers[level]!.prepare([plan]);
    try {
      pipeline.with(batch.group).with(region.output).with(encoder)
        .dispatchWorkgroups(Math.ceil(plan.width / 8), Math.ceil(plan.height / 8));
    } catch (error) {
      batch.destroy();
      throw error;
    }
    return batch;
  }
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
