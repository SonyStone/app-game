import type { GpuContext } from '@app-game/solid-gpu/gpu';
import tgpu, { d, std } from 'typegpu';
import type { SceneFrame } from './createFrame';

/**
 * Keeps one rendering of a widened view in a texture, so frames drawn while the camera moves can resample it instead
 * of drawing the document again: a pan within the widened margin, a rotation or a zoom that keeps the texture's pixel
 * density within {@link maxDensityChange} of its own costs one textured triangle. `refresh` renders a new widened view
 * and `draw` composites the texture over a frame while it still covers that frame. The texture holds premultiplied
 * colour on transparency, so whatever the scene drew beneath the view stays visible around its pages. GPU resources
 * are created on first use and released by `destroy`.
 */
export function createMotionCache({ root, device, format }: Pick<GpuContext, 'root' | 'device' | 'format'>) {
  let resources: ReturnType<typeof createResources> | undefined;
  let target: ReturnType<typeof allocate> | undefined;
  /** The widened frame the texture shows and its pixel density relative to the frame it was refreshed for. */
  let cached: { frame: SceneFrame; density: number } | undefined;

  return {
    /**
     * Composites the texture over `pass` for `frame` and returns true, or returns false without drawing when there is
     * nothing cached, or the cached view no longer covers the frame or would be resampled too far from its density.
     */
    draw(pass: GPURenderPassEncoder, frame: SceneFrame) {
      if (!cached || !target || !resources) {
        return false;
      }

      const mapping = frameMapping(frame, cached.frame);
      const density = pixelDensity(mapping, frame, cached.frame);
      const change = density / cached.density;

      if (!covers(mapping) || change > maxDensityChange || change < 1 / maxDensityChange) {
        return false;
      }

      resources.mapping.write(mapping);
      resources.pipeline.with(pass).with(target.group).draw(3);
      return true;
    },
    /**
     * Renders `widened`, a frame showing more than `frame` around the same camera, into the texture by calling
     * `render` with a pass cleared to transparency, and submits it. A failed render leaves nothing cached and is
     * returned without submitting.
     */
    refresh<R extends { isErr(): boolean } | void>(
      frame: SceneFrame,
      widened: SceneFrame,
      render: (pass: GPURenderPassEncoder) => R
    ): R {
      resources ??= createResources();

      if (target?.width !== widened.width || target.height !== widened.height) {
        target?.texture.destroy();
        target = allocate(resources, widened.width, widened.height);
      }

      cached = undefined;
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: target.view, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }]
      });
      const result = render(pass);
      pass.end();

      if (result?.isErr()) {
        return result;
      }

      device.queue.submit([encoder.finish()]);
      cached = { frame: widened, density: pixelDensity(frameMapping(frame, widened), frame, widened) };
      return result;
    },
    /** Forgets the cached view, such as when the view stops moving or its content changes; keeps the texture. */
    invalidate() {
      cached = undefined;
    },
    /** Releases the texture. */
    destroy() {
      cached = undefined;
      target?.texture.destroy();
      target = undefined;
    }
  };

  function createResources() {
    return {
      sampler: root.createSampler({ minFilter: 'linear', magFilter: 'linear' }),
      mapping: root.createBuffer(Mapping).$usage('uniform'),
      pipeline: root.createRenderPipeline({
        vertex,
        fragment,
        targets: {
          format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          }
        }
      })
    };
  }

  function allocate(shared: ReturnType<typeof createResources>, width: number, height: number) {
    const texture = root.createTexture({ size: [width, height], format }).$usage('sampled', 'render');

    return {
      width,
      height,
      texture,
      view: root.unwrap(texture).createView(),
      group: root.createBindGroup(layout, {
        mapping: shared.mapping,
        source: texture.createView(),
        sampler: shared.sampler
      })
    };
  }
}

/** Largest factor by which the cached texture's pixel density may drift from its own before a refresh. */
const maxDensityChange = 2;

/** Affine map from a frame's clip space to the cached frame's clip space: `matrix` columns, then `offset`. */
const Mapping = d.struct({ matrix: d.vec4f, offset: d.vec2f });

/** The affine map from `frame`'s clip space to `cached`'s, through world space. Both frames are similarity transforms. */
function frameMapping(frame: SceneFrame, cached: SceneFrame) {
  const map = (x: number, y: number) => toClip(cached, toWorld(frame, x, y));
  const [ox, oy] = map(0, 0);
  const [xx, xy] = map(1, 0);
  const [yx, yy] = map(0, 1);
  return { matrix: d.vec4f(xx - ox, xy - oy, yx - ox, yy - oy), offset: d.vec2f(ox, oy) };
}

/** Cached texels per frame pixel along each axis, from the clip-space map's area scale. */
function pixelDensity(mapping: ReturnType<typeof frameMapping>, frame: SceneFrame, cached: SceneFrame) {
  const { x, y, z, w } = mapping.matrix;
  return Math.sqrt((Math.abs(x * w - y * z) * cached.width * cached.height) / (frame.width * frame.height));
}

/** Whether all of the frame's clip square maps inside the cached clip square. */
function covers({ matrix, offset }: ReturnType<typeof frameMapping>) {
  return [-1, 1].every((x) =>
    [-1, 1].every((y) => {
      const cx = matrix.x * x + matrix.z * y + offset.x;
      const cy = matrix.y * x + matrix.w * y + offset.y;
      return Math.abs(cx) <= 1 && Math.abs(cy) <= 1;
    })
  );
}

/** World position of a clip-space point: clip = rotation × (mul ⊙ world + add), as in `createFrame`. */
function toWorld(frame: SceneFrame, x: number, y: number) {
  const [r0, r1, r2, r3] = frame.rotation;
  const determinant = r0! * r3! - r1! * r2!;
  const qx = (r3! * x - r2! * y) / determinant;
  const qy = (r0! * y - r1! * x) / determinant;
  return [(qx - frame.add[0]) / frame.mul[0], (qy - frame.add[1]) / frame.mul[1]] as const;
}

/** Clip-space position of a world point in `frame`. */
function toClip(frame: SceneFrame, [x, y]: readonly [number, number]) {
  const [r0, r1, r2, r3] = frame.rotation;
  const px = x * frame.mul[0] + frame.add[0];
  const py = y * frame.mul[1] + frame.add[1];
  return [r0! * px + r2! * py, r1! * px + r3! * py] as const;
}

const layout = tgpu.bindGroupLayout({
  mapping: { uniform: Mapping },
  source: { texture: d.texture2d(d.f32) },
  sampler: { sampler: 'filtering' }
});

/** One triangle covering clip space, passing clip coordinates through. */
const vertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex },
  out: { position: d.builtin.position, clip: d.vec2f }
})((input) => {
  'use gpu';
  const corner = d.vec2f(d.f32((input.index << 1) & 2), d.f32(input.index & 2));
  const clip = d.vec2f(corner.x * 2 - 1, corner.y * 2 - 1);
  return { position: d.vec4f(clip.x, clip.y, 0, 1), clip };
});

/** Samples the cached view where this pixel's clip position lands in it; texture rows run top to bottom. */
const fragment = tgpu.fragmentFn({ in: { clip: d.vec2f }, out: d.vec4f })((input) => {
  'use gpu';
  const m = layout.$.mapping.matrix;
  const cached = std.add(
    d.vec2f(m.x * input.clip.x + m.z * input.clip.y, m.y * input.clip.x + m.w * input.clip.y),
    layout.$.mapping.offset
  );
  return std.textureSample(layout.$.source, layout.$.sampler, d.vec2f(cached.x * 0.5 + 0.5, 0.5 - cached.y * 0.5));
});
