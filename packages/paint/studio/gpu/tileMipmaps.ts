import { common, d, std, tgpu, type RenderFlag, type TgpuRoot, type TgpuTexture } from 'typegpu';

/** Device-owned RGBA8 mip generator. Reuses pipelines/views and submits a whole mip chain together.
 * Requires a single-layer 2D texture and integer 0 <= base <= last < mipLevelCount.
 * Source writes must already be submitted. Does not own textures or track their dirty levels.
 * Pixel filtering matches TypeGPU's generateMipmaps helper, including premultiplied stored values.
 */
export function createTileMipmaps(root: TgpuRoot) {
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const pipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment,
    targets: { format: 'rgba8unorm' }
  });
  type Level = { view: GPUTextureView; group: ReturnType<typeof root.createBindGroup<typeof layout.entries>> };
  const textures = new WeakMap<TgpuTexture, Map<number, Level>>();
  return (texture: TgpuTexture & RenderFlag, base: number, last: number) => {
    if (texture.props.format !== 'rgba8unorm') throw new Error('Tile mipmaps require rgba8unorm.');
    if (last <= base) return;
    let levels = textures.get(texture);
    if (!levels) textures.set(texture, (levels = new Map()));
    const encoder = root.device.createCommandEncoder();
    for (let mip = base + 1; mip <= last; mip++) {
      let level = levels.get(mip);
      if (!level) {
        const source = root.unwrap(texture).createView({ baseMipLevel: mip - 1, mipLevelCount: 1 });
        level = {
          view: root.unwrap(texture).createView({ baseMipLevel: mip, mipLevelCount: 1 }),
          group: root.createBindGroup(layout, { image: source, sampler })
        };
        levels.set(mip, level);
      }
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: level.view, loadOp: 'clear', storeOp: 'store' }]
      });
      pipeline.with(pass).with(level.group).draw(3);
      pass.end();
    }
    root.device.queue.submit([encoder.finish()]);
  };
}

const layout = tgpu.bindGroupLayout({ image: { texture: d.texture2d() }, sampler: { sampler: 'filtering' } });
const fragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
  'use gpu';
  return std.textureSample(layout.$.image, layout.$.sampler, uv);
});
