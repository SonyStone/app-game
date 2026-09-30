import { maskParams } from '@app-game/abr-brush/maskAccumulationGpu';
import {
  blendModeId,
  dualCoverage,
  fingerPaintCompositeInSpace,
  grain,
  linearSourceOver,
  mixerComposite,
  retouchCompositeInSpace,
  sampleMixing,
  textureCoverage,
  textureTone
} from '@app-game/abr-brush/effects';
import { paintBlend, paintModes } from '@app-game/abr-brush/paintBlend';
import { pencilCoverage } from '@app-game/abr-brush/pencil';
import { affineSecondaryBlend } from '@app-game/abr-brush/secondaryMask';
import { sampleTipPlanByte } from '@app-game/abr-brush/tipRasterGpu';
import { common, d, std, tgpu, type TgpuRoot } from 'typegpu';

/** Creates every render pipeline and the shared sampler used by ABR stamping on one device. */
export function createAbrPipelines(root: TgpuRoot) {
  return {
    sampler: root.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' }),
    /** Paint plus max-blended coverage mask targets for ordinary stamp accumulation. */
    primary: root.createRenderPipeline({
      attribs: abrStampLayout.attrib,
      vertex,
      fragment,
      targets: {
        paint: {
          format: 'rgba8unorm',
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
          }
        },
        mask: {
          format: 'rgba8unorm',
          blend: {
            color: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
            alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' }
          }
        }
      }
    }),
    /** Max-accumulates each primary stamp's transfer opacity into the mask's green lane.
     * Byte-exact mask accumulation uses it to cap Dual Hard Mix, which otherwise re-saturates capped alpha.
     */
    ceiling: root.createRenderPipeline({
      attribs: abrStampLayout.attrib,
      vertex,
      fragment: ceilingFragment,
      targets: {
        format: 'rgba8unorm',
        blend: {
          color: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
          alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' }
        }
      }
    }),
    /** Renders one stamp's coverage into the mask rasterizer's source view. */
    maskSource: root.createRenderPipeline({
      attribs: abrStampLayout.attrib,
      vertex,
      fragment: maskSourceFragment,
      targets: { format: 'rgba8unorm' }
    }),
    /** Current secondary tips are affine; Photoshop accumulates their byte coverage. */
    secondary: root.createRenderPipeline({
      attribs: abrStampLayout.attrib,
      vertex,
      fragment: secondaryFragment,
      targets: { format: 'rgba8unorm', blend: affineSecondaryBlend }
    }),
    composite: root.createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: compositeFragment,
      targets: { format: 'rgba8unorm' }
    }),
    /** Composites one stamp straight into a caller-owned destination pass. */
    direct: root.createRenderPipeline({
      attribs: abrStampLayout.attrib,
      vertex,
      fragment: directFragment,
      targets: { format: 'rgba8unorm' }
    }),
    /** Direct variant whose vertex placement comes from the pickup uniform for shared-area deposits. */
    sharedDirect: root.with(sharedStamp, true).createRenderPipeline({
      attribs: abrStampLayout.attrib,
      vertex,
      fragment: directFragment,
      targets: { format: 'rgba8unorm' }
    }),
    sampledTip: root.createRenderPipeline({
      attribs: { dynamics: abrStampLayout.attrib.dynamics },
      vertex: sampledTipVertex,
      fragment: sampledTipFragment,
      targets: { format: 'rgba8unorm' }
    }),
    sampledSecondary: root.createRenderPipeline({
      attribs: { dynamics: abrStampLayout.attrib.dynamics },
      vertex: sampledTipVertex,
      fragment: sampledSecondaryFragment,
      targets: { format: 'rgba8unorm', blend: affineSecondaryBlend }
    })
  };
}

/** Per-tile stamp uniforms. Vector lanes are addressed through the named lane constants below. */
export const Params = d.struct({
  /** xy: world origin of the tile modulo 65536; w: linear color mixing. See originLane. */
  origin: d.vec4f,
  /** Pattern width, height, scale and texture blend mode. See textureLane. */
  texture: d.vec4f,
  /** Pattern invert, brightness, contrast and pencil coverage. See toneLane. */
  tone: d.vec4f,
  /** Feature toggles. See flagsLane. */
  flags: d.vec4f,
  /** Texture depth, dual mode, wet edges and paint blend mode. See extraLane. */
  extra: d.vec4f,
  /** Global tool opacity applied after all mask operations. */
  compositeOpacity: d.f32,
  tipLodBias: d.f32,
  /** Document pixels covered by one adaptive mask pixel; detailed paths use one. */
  rasterScale: d.f32,
  /** One of maskAccumulation. Fixed and straight color modes already contain accumulated alpha. */
  maskAccumulation: d.u32,
  maskColor: d.vec4f
});

/** Float offsets derived from the shader schema, including struct alignment and padding. */
export const paramsOffsets = {
  origin: d.memoryLayoutOf(Params, (value) => value.origin).offset / 4,
  texture: d.memoryLayoutOf(Params, (value) => value.texture).offset / 4,
  tone: d.memoryLayoutOf(Params, (value) => value.tone).offset / 4,
  flags: d.memoryLayoutOf(Params, (value) => value.flags).offset / 4,
  extra: d.memoryLayoutOf(Params, (value) => value.extra).offset / 4,
  tipLodBias: d.memoryLayoutOf(Params, (value) => value.tipLodBias).offset / 4,
  rasterScale: d.memoryLayoutOf(Params, (value) => value.rasterScale).offset / 4,
  compositeOpacity: d.memoryLayoutOf(Params, (value) => value.compositeOpacity).offset / 4,
  maskAccumulation: d.memoryLayoutOf(Params, (value) => value.maskAccumulation).offset / 4,
  maskColor: d.memoryLayoutOf(Params, (value) => value.maskColor).offset / 4
};

/** Lanes of Params.origin. */
export const originLane = { x: 0, y: 1, linearMixing: 3 } as const;

/** Lanes of Params.texture. */
export const textureLane = { width: 0, height: 1, scale: 2, mode: 3 } as const;

/** Lanes of Params.tone. */
export const toneLane = { invert: 0, brightness: 1, contrast: 2, pencil: 3 } as const;

/** Lanes of Params.flags; each is 1 when enabled. */
export const flagsLane = { texture: 0, textureEachTip: 1, dual: 2, noise: 3 } as const;

/** Lanes of Params.extra. blendMode holds an index into paintModes. */
export const extraLane = { depth: 0, dualMode: 1, wetEdges: 2, blendMode: 3 } as const;

/** Values of Params.maskAccumulation. The first three match paintbrushMaskMode. */
export const maskAccumulation = { stamp: 0, fixedColor: 1, straightColor: 2, approximate: 3 } as const;

/** Paint blend mode indices with dedicated compositing branches. */
const dissolveMode = paintModes.indexOf('Dslv');
const behindMode = paintModes.indexOf('Bhnd');
const clearMode = paintModes.indexOf('Cler');

/** Dual-brush mode whose coverage keeps the unclamped per-stamp opacity. */
const dualHardMixMode = blendModeId('hardMix');

/** One ABR stamp: 16 floats, matching the sampler's stamp stride. */
export const Stamp = d.struct({ bounds: d.vec4f, transform: d.vec4f, dynamics: d.vec4f, color: d.vec4f });

/** Instance-rate vertex layout for ABR stamps. */
export const abrStampLayout = tgpu.vertexLayout(d.arrayOf(Stamp), 'instance');

/** Tip, pattern and uniforms shared by stamp shaders. */
export const stampLayout = tgpu.bindGroupLayout({
  params: { uniform: Params },
  tip: { texture: d.texture2d() },
  pattern: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' }
});

/** Canvas pickup placement uniforms for composites. Vector lanes are addressed through pickupFlagsLane. */
export const PickupParams = d.struct({
  placement: d.vec4f,
  /** Pickup active, strength, finger painting and mode. See pickupFlagsLane. */
  flags: d.vec4f,
  clip: d.vec4f,
  sampleSize: d.vec2f,
  center: d.vec2f
});

/** Float offsets derived from the shader schema, including struct alignment and padding. */
export const pickupOffsets = {
  placement: d.memoryLayoutOf(PickupParams, (value) => value.placement).offset / 4,
  flags: d.memoryLayoutOf(PickupParams, (value) => value.flags).offset / 4,
  clip: d.memoryLayoutOf(PickupParams, (value) => value.clip).offset / 4,
  sampleSize: d.memoryLayoutOf(PickupParams, (value) => value.sampleSize).offset / 4,
  center: d.memoryLayoutOf(PickupParams, (value) => value.center).offset / 4
};

/** Lanes of PickupParams.flags. mode holds one of pickupMode. */
export const pickupFlagsLane = { active: 0, strength: 1, fingerPainting: 2, mode: 3 } as const;

/** Values of the PickupParams.flags mode lane. */
export const pickupMode = { retouch: 0, mixer: 1, history: 2 } as const;

/** Tile scratch, pickup patch and uniforms read by the composite and direct paths. */
export const compositeLayout = tgpu.bindGroupLayout({
  pickup: { texture: d.texture2d() },
  pickupSampler: { sampler: 'filtering' },
  pickupParams: { uniform: PickupParams },
  base: { texture: d.texture2d() },
  mask: { texture: d.texture2d() },
  paint: { texture: d.texture2d() },
  dual: { texture: d.texture2d() },
  pattern: { texture: d.texture2d() },
  params: { uniform: Params }
});

/** Samples the same byte plan/effects as the fragment path, without a temporary render target. */
export function sampledMaskByte(x: number, row: number): number {
  'use gpu';
  const p = maskParams.$();
  const at = p.destinationOffset + row * p.destinationStride + x;
  const px = at % 256;
  const py = d.u32(at / 256);
  const byte = sampleTipPlanByte(d.u32(d.i32(px) + p.planX), p.planRow + row);
  const position = d.vec4f(d.f32(px) + 0.5, d.f32(py) + 0.5, 0, 1);
  const coverage = stampEffects(d.f32(std.max(byte, 0)) / 255, position, p.sourceData);
  return d.u32(std.round(std.clamp(coverage, 0, 1) * 255));
}

const sharedStamp = tgpu.slot(false);

const vertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex, bounds: d.vec4f, transform: d.vec4f, dynamics: d.vec4f, color: d.vec4f },
  out: { position: d.builtin.position, uv: d.vec2f, dynamics: d.vec4f, color: d.vec4f }
})((input) => {
  'use gpu';
  const corners = d.arrayOf(
    d.vec2f,
    6
  )([d.vec2f(-1, -1), d.vec2f(1, -1), d.vec2f(-1, 1), d.vec2f(-1, 1), d.vec2f(1, -1), d.vec2f(1, 1)]);
  const corner = corners[input.index]!;
  const local = std.mul(corner, input.bounds.zw);
  let center = d.vec2f(input.bounds.xy);
  let halfTarget = d.vec2f(128);
  if (sharedStamp.$) {
    // CPU subtraction preserves local precision at large document coordinates.
    center = d.vec2f(compositeLayout.$.pickupParams.center);
    halfTarget = std.mul(d.vec2f(std.textureDimensions(compositeLayout.$.base)), 0.5);
  }
  const pixel = std.add(
    center,
    d.vec2f(
      local.x * input.transform.x - local.y * input.transform.y,
      local.x * input.transform.y + local.y * input.transform.x
    )
  );
  return {
    position: d.vec4f(pixel.x / halfTarget.x - 1, 1 - pixel.y / halfTarget.y, 0, 1),
    uv: std.add(std.mul(std.mul(corner, input.transform.zw), 0.5), d.vec2f(0.5)),
    dynamics: d.vec4f(input.dynamics),
    color: d.vec4f(input.color)
  };
});

const fragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, uv: d.vec2f, dynamics: d.vec4f, color: d.vec4f },
  out: { paint: d.vec4f, mask: d.vec4f }
})((input) => {
  'use gpu';
  const position = d.vec4f(std.mul(input.position.xy, stampLayout.$.params.rasterScale), input.position.zw);
  const coverage = shadeStamp(position, input.uv, input.dynamics, input.color);
  return { paint: coverage.paint, mask: coverage.mask };
});

const maskSourceFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, uv: d.vec2f, dynamics: d.vec4f, color: d.vec4f },
  out: d.vec4f
})((input) => {
  'use gpu';
  return d.vec4f(shadeStamp(input.position, input.uv, input.dynamics, input.color).mask.r);
});

const sampledTipVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex, instance: d.builtin.instanceIndex, dynamics: d.vec4f },
  out: { position: d.builtin.position, firstRow: d.interpolate('flat', d.u32), dynamics: d.vec4f }
})((input) => {
  'use gpu';
  const x = d.f32((input.index << 1) & 2);
  const y = d.f32(input.index & 2);
  return { position: d.vec4f(x * 2 - 1, 1 - y * 2, 0, 1), firstRow: input.instance * 256, dynamics: input.dynamics };
});

const sampledTipFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, firstRow: d.interpolate('flat', d.u32), dynamics: d.vec4f },
  out: d.vec4f
})((input) => {
  'use gpu';
  const byte = sampleTipPlanByte(d.u32(input.position.x), input.firstRow + d.u32(input.position.y));
  return d.vec4f(stampEffects(d.f32(std.max(byte, 0)) / 255, input.position, input.dynamics));
});

const sampledSecondaryFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, firstRow: d.interpolate('flat', d.u32) },
  out: d.vec4f
})((input) => {
  'use gpu';
  const byte = sampleTipPlanByte(d.u32(input.position.x), input.firstRow + d.u32(input.position.y));
  return d.vec4f(d.f32(std.max(byte, 0)) / 255);
});

/** Covers the whole stamp quad: outside real coverage the accumulated primary alpha is zero,
 * and Hard Mix of zero primary coverage stays zero, so the ceiling cannot add ink there.
 */
const ceilingFragment = tgpu.fragmentFn({ in: { dynamics: d.vec4f }, out: d.vec4f })((input) => {
  'use gpu';
  return d.vec4f(0, input.dynamics.y, 0, 0);
});

const Coverage = d.struct({ paint: d.vec4f, mask: d.vec4f });

function shadeStamp(position: d.v4f, tipUv: d.v2f, dynamics: d.v4f, color: d.v4f) {
  'use gpu';
  const p = stampLayout.$.params;
  // Texture modes such as Height are nonlinear: averaging the tip before applying
  // them can erase fine ink entirely. Retain document-scale filtering for those tips.
  const bias = std.select(std.max(0, p.tipLodBias - std.log2(p.rasterScale)), 0, p.flags[flagsLane.texture]! > 0);
  const coverage = stampEffects(
    std.textureSampleBias(stampLayout.$.tip, stampLayout.$.sampler, tipUv, bias).r,
    position,
    dynamics
  );
  const flow = coverage * dynamics.x;
  const ceiling = std.select(0, dynamics.y, coverage > 0);
  // Approximate accumulation caps by transfer opacity, not by one tip's filtered
  // coverage. Repeated soft stamps must still be able to build dense pencil ink.
  return Coverage({
    paint: d.vec4f(std.mul(color.rgb, flow), flow),
    mask: d.vec4f(
      coverage,
      ceiling,
      0,
      std.select(coverage * dynamics.y, ceiling, p.maskAccumulation === maskAccumulation.approximate)
    )
  });
}

function stampEffects(source: number, position: d.v4f, dynamics: d.v4f): number {
  'use gpu';
  const p = stampLayout.$.params;
  let coverage = source;
  if (p.flags[flagsLane.texture]! > 0 && p.flags[flagsLane.textureEachTip]! > 0) {
    const sample = std.textureLoad(stampLayout.$.pattern, d.vec2i(position.xy), 0).r;
    const tone = textureTone(sample, p.tone[toneLane.invert]!, p.tone[toneLane.brightness]!, p.tone[toneLane.contrast]!);
    coverage = textureCoverage(coverage, tone, p.texture[textureLane.mode]!, dynamics.z);
  }
  if (p.flags[flagsLane.noise]! > 0) {
    coverage *= 0.35 + 0.65 * grain(position.x + p.origin[originLane.x]!, position.y + p.origin[originLane.y]!, dynamics.w);
  }
  if (p.tone[toneLane.pencil]! > 0) {
    coverage = pencilCoverage(coverage);
  }
  return coverage;
}

const secondaryFragment = tgpu.fragmentFn({ in: { uv: d.vec2f, dynamics: d.vec4f, color: d.vec4f }, out: d.vec4f })((
  input
) => {
  'use gpu';
  return d.vec4f(std.floor(std.textureSample(stampLayout.$.tip, stampLayout.$.sampler, input.uv).r * 255 + 0.5) / 255);
});

const compositeFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const xy = d.vec2i(std.div(input.position.xy, compositeLayout.$.params.rasterScale));
  return compositePixel(
    input.position,
    std.textureLoad(compositeLayout.$.paint, xy, 0),
    std.textureLoad(compositeLayout.$.mask, xy, 0)
  );
});

/** Preserve the intermediate rgba8unorm rounding even when coverage never leaves the shader. */
const directFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, uv: d.vec2f, dynamics: d.vec4f, color: d.vec4f },
  out: d.vec4f
})((input) => {
  'use gpu';
  const stamp = shadeStamp(input.position, input.uv, input.dynamics, input.color);
  const paint = std.unpack4x8unorm(std.pack4x8unorm(stamp.paint));
  const mask = std.unpack4x8unorm(std.pack4x8unorm(stamp.mask));
  return compositePixel(input.position, paint, mask);
});

function compositePixel(position: d.v4f, paint: d.v4f, mask: d.v4f): d.v4f {
  'use gpu';
  const p = compositeLayout.$.params;
  const xy = d.vec2i(position.xy);
  const base = std.textureLoad(compositeLayout.$.base, xy, 0);
  const blendMode = p.extra[extraLane.blendMode]!;
  const linear = p.origin[originLane.linearMixing]! > 0;
  const dualEnabled = p.flags[flagsLane.dual]! > 0;
  let alpha = d.f32(paint.a);
  if (p.flags[flagsLane.texture]! > 0 && p.flags[flagsLane.textureEachTip]! === 0) {
    const sample = std.textureLoad(compositeLayout.$.pattern, xy, 0).r;
    const tone = textureTone(sample, p.tone[toneLane.invert]!, p.tone[toneLane.brightness]!, p.tone[toneLane.contrast]!);
    alpha = textureCoverage(alpha, tone, p.texture[textureLane.mode]!, p.extra[extraLane.depth]!);
  }
  if (dualEnabled) {
    alpha = dualCoverage(alpha, std.textureLoad(compositeLayout.$.dual, xy, 0).r, p.extra[extraLane.dualMode]!);
  }
  // Local edge approximation; exact wet-edge diffusion requires a halo exchange between tiles.
  if (p.extra[extraLane.wetEdges]! > 0) {
    const up = std.textureLoad(
      compositeLayout.$.paint,
      std.clamp(std.add(xy, d.vec2i(0, -1)), d.vec2i(0), d.vec2i(255)),
      0
    ).a;
    const down = std.textureLoad(
      compositeLayout.$.paint,
      std.clamp(std.add(xy, d.vec2i(0, 1)), d.vec2i(0), d.vec2i(255)),
      0
    ).a;
    const left = std.textureLoad(
      compositeLayout.$.paint,
      std.clamp(std.add(xy, d.vec2i(-1, 0)), d.vec2i(0), d.vec2i(255)),
      0
    ).a;
    const right = std.textureLoad(
      compositeLayout.$.paint,
      std.clamp(std.add(xy, d.vec2i(1, 0)), d.vec2i(0), d.vec2i(255)),
      0
    ).a;
    alpha = std.min(1, alpha * 0.65 + std.max(0, paint.a - std.min(std.min(up, down), std.min(left, right))) * 2);
  }
  // The legacy dynamic-opacity cap still needs destination-aware byte accumulation.
  // Global tool opacity is separate and applies after mask composition.
  if (p.tone[toneLane.pencil]! > 0) {
    alpha = pencilCoverage(alpha);
  }
  const hardMix = dualEnabled && p.extra[extraLane.dualMode]! === dualHardMixMode;
  const opacity = std.select(mask.a, mask.g, hardMix);
  // Byte-exact accumulation already caps alpha, but Hard Mix re-saturates it; re-apply the ceiling afterwards.
  if (p.maskAccumulation === maskAccumulation.stamp || p.maskAccumulation === maskAccumulation.approximate || hardMix) {
    alpha = std.min(alpha, opacity);
  }
  alpha *= p.compositeOpacity;
  if (blendMode === dissolveMode) {
    const noise = grain(position.x + p.origin[originLane.x]!, position.y + p.origin[originLane.y]!, 13.75);
    alpha = std.select(0, 1, noise < alpha);
  }
  let color = std.div(paint.rgb, std.max(0.00001, paint.a));
  if (p.maskAccumulation === maskAccumulation.fixedColor) {
    color = d.vec3f(p.maskColor.rgb);
  } else if (p.maskAccumulation === maskAccumulation.straightColor) {
    color = d.vec3f(paint.rgb);
  }
  const source = d.vec4f(std.mul(color, alpha), alpha);
  const tool = compositeLayout.$.pickupParams;
  if (tool.flags[pickupFlagsLane.active]! > 0) {
    // Sparse tips leave most covered rectangles empty. Sampling and working-space
    // conversion cannot affect a zero-coverage pixel, including transparent pickup.
    if (alpha <= 0) {
      return base;
    }
    const pickupUv = std.div(std.add(position.xy, tool.placement.xy), tool.placement.zw);
    if (pickupUv.x < tool.clip.x || pickupUv.y < tool.clip.y || pickupUv.x > tool.clip.z || pickupUv.y > tool.clip.w) {
      return base;
    }
    const mode = tool.flags[pickupFlagsLane.mode]!;
    const strength = tool.flags[pickupFlagsLane.strength]!;
    const picked = sampleMixing(
      compositeLayout.$.pickup,
      compositeLayout.$.pickupSampler,
      std.div(
        std.clamp(std.mul(pickupUv, tool.sampleSize), d.vec2f(0.5), std.sub(tool.sampleSize, d.vec2f(0.5))),
        d.vec2f(std.textureDimensions(compositeLayout.$.pickup))
      ),
      linear && mode === pickupMode.retouch
    );
    if (mode === pickupMode.history) {
      return std.mix(base, picked, alpha);
    }
    if (mode > pickupMode.retouch) {
      // The wells emit premultiplied paint. Flow/coverage modulates deposition;
      // transparent pickup must not erase existing canvas pixels.
      return mixerComposite(base, picked, alpha);
    }
    if (tool.flags[pickupFlagsLane.fingerPainting]! > 0) {
      return fingerPaintCompositeInSpace(base, color, alpha * strength, blendMode, linear);
    }
    return retouchCompositeInSpace(base, picked, alpha * strength, blendMode, linear);
  }
  if (blendMode === clearMode) {
    return std.mul(base, 1 - alpha);
  }
  if (blendMode === behindMode) {
    return std.add(base, std.mul(source, 1 - base.a));
  }
  if (blendMode <= dissolveMode && linear) {
    return linearSourceOver(base, source);
  }
  const cb = std.div(base.rgb, std.max(base.a, 0.00001));
  const mixed = paintBlend(cb, color, blendMode);
  const rgb = std.add(
    std.mul(base.rgb, 1 - alpha),
    std.mul(std.add(std.mul(color, 1 - base.a), std.mul(mixed, base.a)), alpha)
  );
  return d.vec4f(rgb, alpha + base.a * (1 - alpha));
}

/** Entry points exposed so tests can resolve WGSL without a device; not part of the package API. */
export const abrShaderEntryPoints = {
  vertex,
  fragment,
  maskSourceFragment,
  sampledTipVertex,
  sampledTipFragment,
  sampledSecondaryFragment,
  secondaryFragment,
  compositeFragment,
  directFragment
};
