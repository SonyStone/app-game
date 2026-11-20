import { linearSourceOver, lockAlpha } from '@app-game/abr-brush/effects';
import { common, d, std, tgpu, type TgpuRoot } from 'typegpu';

/** Analytic round coverage for 256px tiles. Clear the float plane to one at stroke start,
 * draw ordered instances in tile coordinates, then composite against the pre-stroke layer.
 */
export function createPaintRoundPipelines(root: TgpuRoot) {
  return {
    stamp: root.createRenderPipeline({
      attribs: { stamp: stampLayout.attrib },
      vertex: stampVertex,
      fragment: stampFragment,
      targets: { format: 'r16float', blend: transmittanceBlend }
    }),
    stroke: root.createRenderPipeline({
      vertex: fullscreenVertex,
      fragment: strokeFragment,
      targets: { format: 'rgba8unorm' }
    })
  };
}

/** Multiplies transmittance by 1 − stamp alpha, the complement of source-over coverage accumulation. */
export const transmittanceBlend = {
  color: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha' }
} as const satisfies GPUBlendState;

/** All brush settings are stable for the lifetime of a stroke. */
export const brushLayout = tgpu.bindGroupLayout({
  settings: { uniform: d.struct({ color: d.vec4f, params: d.vec4f }) }
});
/** Stamp instances carry tile-local center, radius, and flow. */
export const stampLayout = tgpu.vertexLayout(d.arrayOf(d.vec4f), 'instance');

/** Rasterizes round stamps; the stamp pipeline multiplies transmittance by 1 − alpha with hardware blending. */
export const stampVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex, stamp: d.vec4f },
  out: { position: d.builtin.position, local: d.vec2f, radius: d.f32, flow: d.f32 }
})((input) => {
  'use gpu';
  const corners = d.arrayOf(
    d.vec2f,
    6
  )([d.vec2f(-1, -1), d.vec2f(1, -1), d.vec2f(-1, 1), d.vec2f(-1, 1), d.vec2f(1, -1), d.vec2f(1, 1)]);
  const local = corners[input.index]!;
  const pixel = std.add(input.stamp.xy, std.mul(local, input.stamp.z + 1));
  return {
    position: d.vec4f(pixel.x / 128 - 1, 1 - pixel.y / 128, 0, 1),
    local: std.mul(local, input.stamp.z + 1),
    radius: input.stamp.z,
    flow: input.stamp.w
  };
});

/** Antialiases the outer pixel and blends smoothly from the selected hardness radius. */
export const stampFragment = tgpu.fragmentFn({ in: { local: d.vec2f, radius: d.f32, flow: d.f32 }, out: d.vec4f })((
  input
) => {
  'use gpu';
  const distance = std.length(input.local);
  const inner = std.min(input.radius * brushLayout.$.settings.params.x, input.radius - 0.5);
  const alpha = (1 - std.smoothstep(std.max(0, inner), input.radius + 0.5, distance)) * input.flow;
  return d.vec4f(alpha, alpha, alpha, alpha);
});

/** Reads immutable pre-stroke pixels and the accumulated transmittance (1 − coverage), writing a separate result. */
export const strokeLayout = tgpu.bindGroupLayout({
  base: { texture: d.texture2d() },
  transmittance: { texture: d.texture2d() }
});
export const fullscreenVertex = common.fullScreenTriangle;

/**
 * Applies stroke opacity exactly once, supporting destination-out erasing. `color.w` set locks the layer's alpha;
 * see `lockAlpha`.
 */
export const strokeFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const pixel = d.vec2i(input.position.xy);
  const base = std.textureLoad(strokeLayout.$.base, pixel, 0);
  const mask = 1 - std.textureLoad(strokeLayout.$.transmittance, pixel, 0).x;
  const alpha = mask * brushLayout.$.settings.params.y;
  const source = std.mul(d.vec4f(brushLayout.$.settings.color.rgb, 1), alpha);
  let result = std.add(source, std.mul(base, 1 - alpha));
  if (brushLayout.$.settings.params.z > 0.5) {
    result = std.mul(base, 1 - alpha);
  } else if (brushLayout.$.settings.params.w > 0.5) {
    result = linearSourceOver(base, source);
  }
  if (brushLayout.$.settings.color.w > 0.5) return lockAlpha(base, result);
  return result;
});

