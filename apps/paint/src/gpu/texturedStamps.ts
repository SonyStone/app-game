import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import type { BrushResource } from '../composition/brushResources';
import { stampLayout, stampVertex } from './shaders';

/** Device-local counterpart of the decoded brush cache. Uploads once per resource identity and reuses
 * views/bind groups across strokes. Call prepare only between strokes; it may evict older GPU textures.
 */
export function createTexturedStamps(root: TgpuRoot, maxBytes = 64 * 1024 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    throw new Error('GPU brush cache budget must be a positive integer.');
  const device = root.device;
  const pipeline = root.createRenderPipeline({
    attribs: { stamp: stampLayout.attrib },
    vertex: stampVertex,
    fragment: texturedStampFragment,
    targets: {
      format: 'rgba8unorm',
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
      }
    }
  });
  const transform = root.createBuffer(d.vec4f).$usage('uniform');
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' });
  type Entry = ReturnType<typeof upload>;
  // Weak keys avoid keeping evicted CPU coverage buffers alive merely because their GPU copy is cached.
  const lookup = new WeakMap<BrushResource, Entry>();
  const resident = new Set<Entry>();
  let bytes = 0,
    uploads = 0;
  function upload(resource: BrushResource, mipLevelCount: number, size: number) {
    const texture = root
      .createTexture({ size: [resource.width, resource.height], format: 'r8unorm', mipLevelCount })
      .$usage('sampled', 'render');
    try {
      device.queue.writeTexture({ texture: root.unwrap(texture) }, resource.pixels, { bytesPerRow: resource.width }, [
        resource.width,
        resource.height
      ]);
      texture.generateMipmaps();
      const group = root.createBindGroup(tipLayout, { image: texture, sampler, transform });
      return { texture, group, size };
    } catch (error) {
      texture.destroy();
      throw error;
    }
  }
  return {
    /** Binds native aspect ratio and clockwise radians. Returns the renderer for this stroke's stamps. */
    prepare(resource: BrushResource, angle: number) {
      if (!Number.isFinite(angle)) throw new Error('Brush tip angle must be finite.');
      if (resource.width > device.limits.maxTextureDimension2D || resource.height > device.limits.maxTextureDimension2D)
        throw new Error('Brush tip exceeds this device’s texture dimension limit.');
      let entry = lookup.get(resource);
      if (!entry || !resident.has(entry)) {
        const levels = Math.floor(Math.log2(Math.max(resource.width, resource.height))) + 1;
        let size = 0;
        for (let level = 0; level < levels; level++)
          size += Math.max(1, resource.width >> level) * Math.max(1, resource.height >> level);
        if (size > maxBytes) throw new Error('Brush tip mipmaps exceed the GPU brush cache budget.');
        for (const old of resident) {
          if (bytes + size <= maxBytes && resident.size < 256) break;
          old.texture.destroy();
          resident.delete(old);
          bytes -= old.size;
        }
        entry = upload(resource, levels, size);
        lookup.set(resource, entry);
        bytes += size;
        uploads++;
      }
      resident.delete(entry);
      resident.add(entry);
      const diagonal = Math.hypot(resource.width, resource.height);
      transform.write(d.vec4f(resource.width / diagonal, resource.height / diagonal, Math.cos(angle), Math.sin(angle)));
      return pipeline.with(entry.group);
    },
    /** Logical texture bytes include all mip levels; cached textures do not retain CPU pixel buffers. */
    stats: () => ({ bytes, textures: resident.size, uploads }),
    destroy() {
      for (const entry of resident) entry.texture.destroy();
      resident.clear();
      bytes = 0;
      transform.destroy();
    }
  };
}

const tipLayout = tgpu.bindGroupLayout({
  image: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
  transform: { uniform: d.vec4f }
});

/** Samples native coverage into the same accumulated mask as round stamps. Mips suppress minification
 * shimmer; the rectangle fringe avoids clamp-to-edge smearing outside the rotated tip.
 */
export const texturedStampFragment = tgpu.fragmentFn({
  in: { local: d.vec2f, radius: d.f32, flow: d.f32 },
  out: d.vec4f
})((input) => {
  'use gpu';
  const transform = tipLayout.$.transform;
  const local = d.vec2f(
    input.local.x * transform.z + input.local.y * transform.w,
    -input.local.x * transform.w + input.local.y * transform.z
  );
  const half = std.mul(transform.xy, input.radius);
  const uv = std.add(std.div(local, std.mul(half, 2)), d.vec2f(0.5));
  const coverage = std.textureSample(tipLayout.$.image, tipLayout.$.sampler, uv).r;
  const edge = std.sub(std.abs(local), half);
  const alpha =
    coverage * (1 - std.smoothstep(-0.5, 0.5, edge.x)) * (1 - std.smoothstep(-0.5, 0.5, edge.y)) * input.flow;
  return d.vec4f(alpha);
});
