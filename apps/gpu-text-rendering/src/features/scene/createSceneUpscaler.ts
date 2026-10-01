import type { GpuContext } from '@app-game/solid-gpu/gpu';
import tgpu, { d, std } from 'typegpu';

/**
 * Holds one offscreen render target for scenes drawn below the canvas resolution, and stretches it over the canvas
 * with linear filtering. GPU resources are created by the first `target` call, so loops that never scale allocate
 * nothing; the target is reallocated when its size changes and destroyed with `destroy`.
 */
export function createSceneUpscaler({ root, format }: Pick<GpuContext, 'root' | 'format'>) {
  let resources:
    | { sampler: ReturnType<typeof root.createSampler>; pipeline: ReturnType<typeof createPipeline> }
    | undefined;
  let target: ReturnType<typeof allocate> | undefined;

  return {
    /** Render target view of `width`×`height` physical pixels, reused while the size stays the same. */
    target(width: number, height: number) {
      if (target?.width !== width || target.height !== height) {
        target?.texture.destroy();
        target = allocate(width, height);
      }

      return target.view;
    },
    /** Draws the latest target over the whole of `pass`. */
    blit(pass: GPURenderPassEncoder) {
      if (target && resources) {
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
    resources ??= {
      sampler: root.createSampler({ minFilter: 'linear', magFilter: 'linear' }),
      pipeline: createPipeline()
    };
    const texture = root.createTexture({ size: [width, height], format }).$usage('sampled', 'render');

    return {
      width,
      height,
      texture,
      view: root.unwrap(texture).createView(),
      group: root.createBindGroup(layout, { source: texture.createView(), sampler: resources.sampler })
    };
  }

  function createPipeline() {
    return root.createRenderPipeline({ vertex, fragment, targets: { format } });
  }
}

const layout = tgpu.bindGroupLayout({
  source: { texture: d.texture2d(d.f32) },
  sampler: { sampler: 'filtering' }
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
  return std.textureSample(layout.$.source, layout.$.sampler, input.uv);
});
