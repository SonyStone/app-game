import { common, d, std, tgpu } from 'typegpu';
import { dualCoverage, grain, textureCoverage, textureTone } from './effects';

/** One instanced quad per stamp. Colors and texture depth vary independently per tip. */
export const stamps = tgpu.vertexLayout(
  d.arrayOf(d.struct({ bounds: d.vec4f, transform: d.vec4f, dynamics: d.vec4f, color: d.vec4f })),
  'instance'
);
/** Shared effect uniforms: viewport, texture size/scale/mode, tone, enabled flags and depth. */
export const Params = d.struct({ viewport: d.vec4f, texture: d.vec4f, tone: d.vec4f, flags: d.vec4f, extra: d.vec4f });
export const brushLayout = tgpu.bindGroupLayout({
  params: { uniform: Params },
  tip: { texture: d.texture2d() },
  pattern: { texture: d.texture2d() },
  dual: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
  repeat: { sampler: 'filtering' }
});

/** Places the tip with native aspect ratio, rotation, roundness and flips. */
export const stampVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex, bounds: d.vec4f, transform: d.vec4f, dynamics: d.vec4f, color: d.vec4f },
  out: { position: d.builtin.position, uv: d.vec2f, local: d.vec2f, dynamics: d.vec4f, color: d.vec4f }
})((input) => {
  'use gpu';
  const corners = d.arrayOf(
    d.vec2f,
    6
  )([d.vec2f(-1, -1), d.vec2f(1, -1), d.vec2f(-1, 1), d.vec2f(-1, 1), d.vec2f(1, -1), d.vec2f(1, 1)]);
  const corner = corners[input.index]!;
  const local = std.mul(corner, input.bounds.zw);
  const pixel = std.add(
    input.bounds.xy,
    d.vec2f(
      local.x * input.transform.x - local.y * input.transform.y,
      local.x * input.transform.y + local.y * input.transform.x
    )
  );
  const uv = std.add(std.mul(std.mul(corner, input.transform.zw), 0.5), d.vec2f(0.5));
  return {
    position: d.vec4f(
      (pixel.x / brushLayout.$.params.viewport.x) * 2 - 1,
      1 - (pixel.y / brushLayout.$.params.viewport.y) * 2,
      0,
      1
    ),
    uv,
    local: std.mul(uv, std.mul(input.bounds.zw, 2)),
    dynamics: d.vec4f(input.dynamics),
    color: d.vec4f(input.color)
  };
});

/** Premultiplied color and a separate opacity ceiling prevent flow from overriding opacity. */
export const stampFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, uv: d.vec2f, local: d.vec2f, dynamics: d.vec4f, color: d.vec4f },
  out: { paint: d.vec4f, mask: d.vec4f }
})((input) => {
  'use gpu';
  const p = brushLayout.$.params;
  let coverage = std.textureSampleLevel(brushLayout.$.tip, brushLayout.$.sampler, input.uv, 0).r;
  if (p.flags.x > 0 && p.flags.y > 0) {
    // Each tip changes depth, while the pattern stays anchored to the canvas.
    const uv = std.div(input.position.xy, std.mul(p.texture.xy, p.texture.z));
    const sample = std.textureSampleLevel(brushLayout.$.pattern, brushLayout.$.repeat, uv, 0).r;
    const tone = textureTone(sample, p.tone.x, p.tone.y, p.tone.z);
    coverage = textureCoverage(coverage, tone, p.texture.w, input.dynamics.z);
  }
  if (p.flags.z > 0) {
    const second = std.textureLoad(brushLayout.$.dual, d.vec2i(input.position.xy), 0).r;
    coverage = dualCoverage(coverage, second, p.extra.y);
  }
  if (p.flags.w > 0) coverage *= 0.35 + 0.65 * grain(input.position.x, input.position.y, input.dynamics.w);
  const flow = coverage * input.dynamics.x;
  return {
    paint: d.vec4f(std.mul(input.color.rgb, flow), flow),
    mask: d.vec4f(flow, flow, flow, coverage * input.dynamics.y)
  };
});

/** Stroke-wide texture and edge treatment run after stamp accumulation. */
export const compositeLayout = tgpu.bindGroupLayout({
  mask: { texture: d.texture2d() },
  paint: { texture: d.texture2d() },
  pattern: { texture: d.texture2d() },
  repeat: { sampler: 'filtering' },
  params: { uniform: Params },
  background: { uniform: d.vec4f }
});
export const compositeFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const p = compositeLayout.$.params;
  const xy = d.vec2i(input.position.xy);
  const mask = std.textureLoad(compositeLayout.$.mask, xy, 0);
  const paint = std.textureLoad(compositeLayout.$.paint, xy, 0);
  let coverage = std.min(mask.r, mask.a);
  if (p.flags.x > 0 && p.flags.y === 0) {
    const uv = std.div(d.vec2f(xy), std.mul(p.texture.xy, p.texture.z));
    const sample = std.textureSampleLevel(compositeLayout.$.pattern, compositeLayout.$.repeat, uv, 0).r;
    const tone = textureTone(sample, p.tone.x, p.tone.y, p.tone.z);
    coverage = textureCoverage(coverage, tone, p.texture.w, p.extra.x);
  }
  if (p.extra.z > 0) {
    const limit = std.sub(d.vec2i(p.viewport.xy), d.vec2i(1));
    const up = std.textureLoad(compositeLayout.$.mask, std.clamp(std.add(xy, d.vec2i(0, -1)), d.vec2i(0), limit), 0).r;
    const down = std.textureLoad(compositeLayout.$.mask, std.clamp(std.add(xy, d.vec2i(0, 1)), d.vec2i(0), limit), 0).r;
    const left = std.textureLoad(
      compositeLayout.$.mask,
      std.clamp(std.add(xy, d.vec2i(-1, 0)), d.vec2i(0), limit),
      0
    ).r;
    const right = std.textureLoad(
      compositeLayout.$.mask,
      std.clamp(std.add(xy, d.vec2i(1, 0)), d.vec2i(0), limit),
      0
    ).r;
    coverage = std.min(1, coverage * 0.65 + std.max(0, mask.r - std.min(std.min(up, down), std.min(left, right))) * 2);
  }
  const color = std.div(paint.rgb, std.max(0.00001, paint.a));
  return d.vec4f(std.mix(compositeLayout.$.background.rgb, color, coverage), 1);
});
export const compositeVertex = common.fullScreenTriangle;
