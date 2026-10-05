import type { GpuContext } from '@app-game/solid-gpu/gpu';
import tgpu, { d, std } from 'typegpu';

/**
 * Holds one offscreen render target of the canvas size for scenes drawn below the canvas resolution, and stretches
 * the part a scene drew, its top-left `width`×`height` pixels, over the canvas with linear filtering. Scenes of any
 * scale share the target, so changing the scale from frame to frame allocates nothing. GPU resources are created by
 * the first `target` call, so loops that never scale allocate nothing; the target is reallocated when the canvas size
 * changes and destroyed with `destroy`.
 */
export function createSceneUpscaler({ root, format }: Pick<GpuContext, 'root' | 'format'>) {
  let resources: ReturnType<typeof createResources> | undefined;
  let target: ReturnType<typeof allocate> | undefined;

  return {
    /** Render target view of `width`×`height` physical pixels, the canvas size, reused while it stays the same. */
    target(width: number, height: number) {
      if (target?.width !== width || target.height !== height) {
        target?.texture.destroy();
        target = allocate(width, height);
      }

      return target.view;
    },
    /** Stretches the top-left `width`×`height` pixels of the latest target over the whole of `pass`. */
    blit(pass: GPURenderPassEncoder, width: number, height: number) {
      if (target && resources) {
        // Sampling stays half a texel inside the drawn part, so the stale pixels beside it never blend in.
        resources.region.write({
          scale: d.vec2f(width / target.width, height / target.height),
          limit: d.vec2f((width - 0.5) / target.width, (height - 0.5) / target.height)
        });
        resources.pipeline.with(pass).with(target.group).draw(3);
      }
    },
    /** Releases the target texture. */
    destroy() {
      target?.texture.destroy();
      target = undefined;
    }
  };

  function allocate(width: number, height: number) {
    resources ??= createResources();
    const texture = root.createTexture({ size: [width, height], format }).$usage('sampled', 'render');

    return {
      width,
      height,
      texture,
      view: root.unwrap(texture).createView(),
      group: root.createBindGroup(layout, {
        source: texture.createView(),
        sampler: resources.sampler,
        region: resources.region
      })
    };
  }

  function createResources() {
    return {
      sampler: root.createSampler({ minFilter: 'linear', magFilter: 'linear' }),
      region: root.createBuffer(Region).$usage('uniform'),
      pipeline: root.createRenderPipeline({ vertex, fragment, targets: { format } })
    };
  }
}

/** The drawn part of the target in texture coordinates: its extent, and the last sampling position inside it. */
const Region = d.struct({ scale: d.vec2f, limit: d.vec2f });

const layout = tgpu.bindGroupLayout({
  source: { texture: d.texture2d(d.f32) },
  sampler: { sampler: 'filtering' },
  region: { uniform: Region }
});

/** One triangle covering clip space; uv runs top to bottom like texture rows. */
const vertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex },
  out: { position: d.builtin.position, uv: d.vec2f }
})((input) => {
  'use gpu';
  const corner = d.vec2f(d.f32((input.index << 1) & 2), d.f32(input.index & 2));
  return {
    position: d.vec4f(corner.x * 2 - 1, corner.y * 2 - 1, 0, 1),
    uv: d.vec2f(corner.x, 1 - corner.y)
  };
});

const fragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
  'use gpu';
  const uv = std.min(std.mul(input.uv, layout.$.region.scale), layout.$.region.limit);
  return std.textureSample(layout.$.source, layout.$.sampler, uv);
});
