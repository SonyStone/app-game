import { sampleTipPlanByte } from '@app-game/abr-brush/tipRasterGpu';
import { linearSourceOver } from '@app-game/abr-brush/effects';
import { paintBlend } from '@app-game/abr-brush/paintBlend';
import { pencilCoverage } from '@app-game/abr-brush/pencil';
import { common, d, std, tgpu } from 'typegpu';
import { dualCoverage, grain, textureCoverage, textureTone } from './effects';
import { eraserPreviewColor } from './eraser';

/** One instanced quad per stamp. Colors and texture depth vary independently per tip. */
export const stamps = tgpu.vertexLayout(
  d.arrayOf(d.struct({ bounds: d.vec4f, transform: d.vec4f, dynamics: d.vec4f, color: d.vec4f })),
  'instance'
);
/** Viewport stores width/height/DPR/eraser operation (0 paint, 1 erase, 2 restore); remaining fields hold effects. */
export const Params = d.struct({
  viewport: d.vec4f,
  texture: d.vec4f,
  tone: d.vec4f,
  flags: d.vec4f,
  extra: d.vec4f,
  colorMixing: d.vec4f,
  /** Global tool opacity applied after all mask operations. */
  compositeOpacity: d.f32,
  maskAccumulation: d.u32,
  maskColor: d.vec4f
});
export const brushLayout = tgpu.bindGroupLayout({
  params: { uniform: Params },
  tip: { texture: d.texture2d() },
  pattern: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' }
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
  const coverage = stampCoverage(input.position, input.uv, input.dynamics);
  const flow = coverage * input.dynamics.x;
  return {
    paint: d.vec4f(std.mul(input.color.rgb, flow), flow),
    mask: d.vec4f(coverage, std.select(0, input.dynamics.y, coverage > 0), 0, coverage * input.dynamics.y)
  };
});

/** Affine secondary samples are bytes before source-over into their byte mask. */
export const secondaryFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f }, out: { paint: d.vec4f, mask: d.vec4f }
})((input) => {
  'use gpu';
  const coverage = std.floor(std.textureSample(brushLayout.$.tip, brushLayout.$.sampler, input.uv).r * 255 + 0.5) / 255;
  return { paint: d.vec4f(coverage), mask: d.vec4f(coverage) };
});

/** Rasterizes unaccumulated coverage for the verified byte-mask compute pass. */
export const maskSourceFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, uv: d.vec2f, dynamics: d.vec4f }, out: d.vec4f
})((input) => {
  'use gpu';
  return d.vec4f(stampCoverage(input.position, input.uv, input.dynamics));
});

/** Bounds plan storage for long preview strokes without changing stamp order. */
export const sampledTipBatchSize = 64;

/** Covers the viewport; a scissor limits work to the primary tip's verified bounds. */
export const sampledTipVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex, instance: d.builtin.instanceIndex, dynamics: d.vec4f },
  out: { position: d.builtin.position, firstRow: d.interpolate('flat', d.u32), dynamics: d.vec4f }
})((input) => {
  'use gpu';
  const x = d.f32((input.index << 1) & 2);
  const y = d.f32(input.index & 2);
  return { position: d.vec4f(x * 2 - 1, 1 - y * 2, 0, 1),
    firstRow: (input.instance % sampledTipBatchSize) * d.u32(brushLayout.$.params.viewport.y),
    dynamics: input.dynamics };
});

/** Executes Photoshop row commands, then the brush's per-tip effects. */
export const sampledTipFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, firstRow: d.interpolate('flat', d.u32), dynamics: d.vec4f }, out: d.vec4f
})((input) => {
  'use gpu';
  const byte = sampleTipPlanByte(d.u32(input.position.x), input.firstRow + d.u32(input.position.y));
  return d.vec4f(stampEffects(d.f32(std.max(byte, 0)) / 255, input.position, input.dynamics));
});

/** Secondary row coverage accumulates directly, without primary texture or transfer effects. */
export const sampledSecondaryFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, firstRow: d.interpolate('flat', d.u32) },
  out: { paint: d.vec4f, mask: d.vec4f }
})((input) => {
  'use gpu';
  const byte = sampleTipPlanByte(d.u32(input.position.x), input.firstRow + d.u32(input.position.y));
  const coverage = d.f32(std.max(byte, 0)) / 255;
  return { paint: d.vec4f(coverage), mask: d.vec4f(coverage) };
});

function stampCoverage(position: d.v4f, uv: d.v2f, dynamics: d.v4f): number {
  'use gpu';
  const coverage = std.textureSampleLevel(brushLayout.$.tip, brushLayout.$.sampler, uv, 0).r;
  return stampEffects(coverage, position, dynamics);
}

function stampEffects(source: number, position: d.v4f, dynamics: d.v4f): number {
  'use gpu';
  let coverage = source;
  const p = brushLayout.$.params;
  if (p.flags.x > 0 && p.flags.y > 0) {
    // Each tip changes depth, while the pattern stays anchored to the canvas.
    const sample = std.textureLoad(brushLayout.$.pattern, d.vec2i(position.xy), 0).r;
    const tone = textureTone(sample, p.tone.x, p.tone.y, p.tone.z);
    coverage = textureCoverage(coverage, tone, p.texture.w, dynamics.z);
  }
  if (p.flags.w > 0) coverage *= 0.35 + 0.65 * grain(position.x, position.y, dynamics.w);
  if (p.tone.w > 0) coverage = pencilCoverage(coverage);
  return coverage;
}

/** Stroke-wide texture and edge treatment run after stamp accumulation. */
export const compositeLayout = tgpu.bindGroupLayout({
  dual: { texture: d.texture2d() },
  mask: { texture: d.texture2d() },
  paint: { texture: d.texture2d() },
  pattern: { texture: d.texture2d() },
  params: { uniform: Params },
  background: { uniform: d.vec4f }
});
/** Final brush mask shared by painting and each retouch step. */
export function previewCoverage(position: d.v4f) {
  'use gpu';
  const p = compositeLayout.$.params;
  const xy = d.vec2i(position.xy);
  const mask = std.textureLoad(compositeLayout.$.mask, xy, 0);
  const paint = std.textureLoad(compositeLayout.$.paint, xy, 0);
  let coverage = std.min(paint.a, mask.a);
  if (p.tone.w > 0 || p.flags.z > 0 || p.maskAccumulation > 0) coverage = paint.a;
  if (p.flags.x > 0 && p.flags.y === 0) {
    const sample = std.textureLoad(compositeLayout.$.pattern, xy, 0).r;
    const tone = textureTone(sample, p.tone.x, p.tone.y, p.tone.z);
    coverage = textureCoverage(coverage, tone, p.texture.w, p.extra.x);
  }
  if (p.flags.z > 0)
    coverage = dualCoverage(coverage, std.textureLoad(compositeLayout.$.dual, xy, 0).r, p.extra.y);
  if (p.extra.z > 0) {
    const limit = std.sub(d.vec2i(p.viewport.xy), d.vec2i(1));
    const up = std.textureLoad(compositeLayout.$.paint, std.clamp(std.add(xy, d.vec2i(0, -1)), d.vec2i(0), limit), 0).a;
    const down = std.textureLoad(
      compositeLayout.$.paint,
      std.clamp(std.add(xy, d.vec2i(0, 1)), d.vec2i(0), limit),
      0
    ).a;
    const left = std.textureLoad(
      compositeLayout.$.paint,
      std.clamp(std.add(xy, d.vec2i(-1, 0)), d.vec2i(0), limit),
      0
    ).a;
    const right = std.textureLoad(
      compositeLayout.$.paint,
      std.clamp(std.add(xy, d.vec2i(1, 0)), d.vec2i(0), limit),
      0
    ).a;
    coverage = std.min(1, coverage * 0.65 + std.max(0, paint.a - std.min(std.min(up, down), std.min(left, right))) * 2);
  }
  if (p.tone.w > 0) coverage = std.min(pencilCoverage(coverage), mask.a);
  if (p.flags.z > 0 && p.maskAccumulation === 0) coverage = std.min(coverage, std.select(mask.a, mask.g, p.extra.y === 7));
  return coverage * p.compositeOpacity;
}
export const compositeFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const p = compositeLayout.$.params;
  const xy = d.vec2i(input.position.xy);
  const paint = std.textureLoad(compositeLayout.$.paint, xy, 0);
  let coverage = previewCoverage(input.position);
  if (p.viewport.w > 0)
    return d.vec4f(
      eraserPreviewColor(compositeLayout.$.background.rgb, coverage, d.vec2f(xy), p.viewport.z, p.viewport.w === 2),
      1
    );
  let color = std.div(paint.rgb, std.max(0.00001, paint.a));
  if (p.maskAccumulation === 1) color = d.vec3f(p.maskColor.rgb);
  else if (p.maskAccumulation === 2) color = d.vec3f(paint.rgb);
  if (p.extra.w === 1) coverage = std.select(0, 1, grain(input.position.x, input.position.y, 13.75) < coverage);
  if (p.extra.w < 2 && p.colorMixing.x > 0)
    return linearSourceOver(d.vec4f(compositeLayout.$.background.rgb, 1), d.vec4f(std.mul(color, coverage), coverage));
  const mixed = paintBlend(compositeLayout.$.background.rgb, color, p.extra.w);
  if (p.extra.w === 27 || p.extra.w === 28) return d.vec4f(compositeLayout.$.background.rgb, 1);
  return d.vec4f(std.mix(compositeLayout.$.background.rgb, mixed, coverage), 1);
});
export const compositeVertex = common.fullScreenTriangle;
