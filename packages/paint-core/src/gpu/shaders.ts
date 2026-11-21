export { compositeLayout, compositeFragment } from '@app-game/abr-paint/gpu/layerComposite';
import { decodePremultiplied, encodePremultiplied, mixPremultiplied } from '@app-game/abr-brush/effects';
import { d, std, tgpu } from 'typegpu';
export { brushLayout, stampLayout, stampVertex, stampFragment, strokeLayout, fullscreenVertex, strokeFragment } from '@app-game/abr-paint/gpu/paintRound';

/**
 * Camera uses tile positions relative to the view center to preserve precision far from the origin. `sharp` set draws
 * magnified pixels as flat squares; see `tileFragment`.
 */
export const viewLayout = tgpu.bindGroupLayout({
  view: {
    uniform: d.struct({ size: d.vec2f, zoom: d.f32, angle: d.f32, mirror: d.f32, sharp: d.f32, offset: d.vec2f })
  },
  image: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' }
});
export const tileVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex },
  out: { position: d.builtin.position, uv: d.vec2f }
})((input) => {
  'use gpu';
  const corners = d.arrayOf(
    d.vec2f,
    6
  )([d.vec2f(0, 0), d.vec2f(1, 0), d.vec2f(0, 1), d.vec2f(0, 1), d.vec2f(1, 0), d.vec2f(1, 1)]);
  const uv = corners[input.index]!;
  const p = std.add(viewLayout.$.view.offset, std.mul(uv, 256));
  const x = p.x * viewLayout.$.view.mirror;
  const c = std.cos(viewLayout.$.view.angle);
  const s = std.sin(viewLayout.$.view.angle);
  const screen = std.mul(d.vec2f(x * c - p.y * s, x * s + p.y * c), viewLayout.$.view.zoom);
  return {
    position: d.vec4f((screen.x * 2) / viewLayout.$.view.size.x, (-screen.y * 2) / viewLayout.$.view.size.y, 0, 1),
    uv
  };
});
/**
 * Samples a tile. With `sharp`, magnified pixels are flat squares whose edges blend over one screen pixel; see
 * {@link sharpTexel}. The original derivatives keep the mip level from jumping at texel edges.
 */
export const tileFragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
  'use gpu';
  const texel = std.mul(input.uv, 256);
  const snapped = std.div(sharpTexel(texel, std.fwidth(texel)), 256);
  const uv = std.select(input.uv, snapped, viewLayout.$.view.sharp > 0.5);
  return std.textureSampleGrad(
    viewLayout.$.image,
    viewLayout.$.sampler,
    uv,
    std.dpdx(input.uv),
    std.dpdy(input.uv)
  );
});

/**
 * Where a linearly filtered texture is sampled so that magnified texels show as flat squares ("sharp bilinear"):
 * `texel` is the position in texels, `width` the texels one screen pixel spans. The position moves to the center of
 * its texel, except within half a screen pixel of a texel edge, where it crosses the edge so the two texels blend over
 * one screen pixel. Minified (`width` of 1 or more), it stays where it was, which is smooth sampling.
 */
export const sharpTexel = tgpu.fn(
  [d.vec2f, d.vec2f],
  d.vec2f
)((texel, width) => {
  'use gpu';
  const edge = std.floor(std.add(texel, d.vec2f(0.5)));
  const span = std.clamp(width, d.vec2f(0.0001), d.vec2f(1));
  return std.add(edge, std.clamp(std.div(std.sub(texel, edge), span), d.vec2f(-0.5), d.vec2f(0.5)));
});

/** Presents the composed document over a neutral paper background. */
export const presentLayout = tgpu.bindGroupLayout({ image: { texture: d.texture2d() } });
export const presentFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const color = std.textureLoad(presentLayout.$.image, d.vec2i(input.position.xy), 0);
  // The literal is `paperColor`; keep both in step.
  return d.vec4f(std.add(color.rgb, std.mul(d.vec3f(0.98, 0.974, 0.957), 1 - color.a)), 1);
});

/** The paper shown under transparent pixels by `presentFragment`, in presented 0–1 channel values. */
export const paperColor = [0.98, 0.974, 0.957] as const;

/** Converts the float composition result to the 8-bit composed image, unchanged apart from rounding. */
export const resolveFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  return std.textureLoad(presentLayout.$.image, d.vec2i(input.position.xy), 0);
});

/** Writes transparent pixels; with a scissor it clears only a damaged region instead of the whole attachment. */
export const clearFragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
  'use gpu';
  return d.vec4f(0);
});

/**
 * Ends a fading Pass Through folder: `layer`, the folder's layers composited onto the backdrop it entered with,
 * interpolated from `base`, that backdrop, by the folder's opacity `settings.x`, in linear light when `settings.w` is
 * set, as `mixPremultiplied` mixes; `fadePixels` of `layerStack` is its CPU port.
 */
export const fadeLayout = tgpu.bindGroupLayout({
  base: { texture: d.texture2d() },
  layer: { texture: d.texture2d() },
  settings: { uniform: d.vec4f }
});
export const fadeFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const pixel = d.vec2i(input.position.xy);
  return mixPremultiplied(
    std.textureLoad(fadeLayout.$.base, pixel, 0),
    std.textureLoad(fadeLayout.$.layer, pixel, 0),
    fadeLayout.$.settings.x,
    fadeLayout.$.settings.w > 0.5
  );
});

/**
 * The effective coverage, 0–1, of a mask texture's texel `texel`: mask tiles are opaque grey RGBA holding the stored
 * coverage, and an eraser stroke in progress lowers their alpha towards Hide (see `coverageFromRgba`), so the stored
 * coverage is red over Hide, and the effective one is that, or for an `inverted` mask its reverse, alpha minus red.
 */
export const maskFactor = tgpu.fn(
  [d.vec4f, d.bool],
  d.f32
)((texel, inverted) => {
  'use gpu';
  return std.select(texel.x, texel.w - texel.x, inverted);
});

/**
 * `compositeFragment` with a mask: the layer's premultiplied channels are first scaled by `mask`'s effective coverage
 * (`maskFactor`), then clipped and composited as `compositeFragment` does. `settings` are its settings, except that
 * `z` adds 2 for an inverted mask to 1 for a clipped layer. `composeStack` of `layerStack` is the CPU port.
 */
export const maskedCompositeLayout = tgpu.bindGroupLayout({
  base: { texture: d.texture2d() },
  layer: { texture: d.texture2d() },
  clip: { texture: d.texture2d() },
  mask: { texture: d.texture2d() },
  settings: { uniform: d.vec4f }
});
export const maskedCompositeFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((
  input
) => {
  'use gpu';
  const pixel = d.vec2i(input.position.xy);
  const flags = maskedCompositeLayout.$.settings.z;
  const inverted = flags > 1.5;
  const clipped = (flags > 0.5 && flags < 1.5) || flags > 2.5;
  const encodedBase = std.textureLoad(maskedCompositeLayout.$.base, pixel, 0);
  const k = maskFactor(std.textureLoad(maskedCompositeLayout.$.mask, pixel, 0), inverted);
  let encodedSource = std.mul(std.textureLoad(maskedCompositeLayout.$.layer, pixel, 0), k);
  if (clipped) {
    encodedSource = std.mul(encodedSource, std.textureLoad(maskedCompositeLayout.$.clip, pixel, 0).a);
  }
  const linear = maskedCompositeLayout.$.settings.w > 0.5;
  const base = std.select(encodedBase, decodePremultiplied(encodedBase), linear);
  const source = std.select(encodedSource, decodePremultiplied(encodedSource), linear);
  const alpha = source.a * maskedCompositeLayout.$.settings.x;
  const cb = std.div(base.rgb, std.max(base.a, 0.000001));
  const cs = std.div(source.rgb, std.max(source.a, 0.000001));
  let blend = d.vec3f(cs);
  const mode = maskedCompositeLayout.$.settings.y;
  if (mode > 0.5 && mode < 1.5) {
    blend = std.mul(cb, cs);
  }
  if (mode > 1.5 && mode < 2.5) {
    blend = std.sub(d.vec3f(1), std.mul(std.sub(d.vec3f(1), cb), std.sub(d.vec3f(1), cs)));
  }
  if (mode > 2.5) {
    const low = std.mul(std.mul(cb, cs), 2);
    const high = std.sub(d.vec3f(1), std.mul(std.mul(std.sub(d.vec3f(1), cb), std.sub(d.vec3f(1), cs)), 2));
    blend = d.vec3f(
      std.select(low.x, high.x, cb.x > 0.5),
      std.select(low.y, high.y, cb.y > 0.5),
      std.select(low.z, high.z, cb.z > 0.5)
    );
  }
  const rgb = std.add(
    std.mul(base.rgb, 1 - alpha),
    std.mul(std.add(std.mul(cs, 1 - base.a), std.mul(blend, base.a)), alpha)
  );
  const result = d.vec4f(rgb, alpha + base.a * (1 - alpha));
  return std.select(result, encodePremultiplied(result), linear);
});

/**
 * `fadeFragment` with a mask: a fading Pass Through folder with a mask fades by its opacity `settings.x` times the
 * mask's effective coverage, inverted when `settings.z` is set; `fadePixels` of `layerStack` is the CPU port.
 */
export const maskedFadeLayout = tgpu.bindGroupLayout({
  base: { texture: d.texture2d() },
  layer: { texture: d.texture2d() },
  mask: { texture: d.texture2d() },
  settings: { uniform: d.vec4f }
});
export const maskedFadeFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const pixel = d.vec2i(input.position.xy);
  const k = maskFactor(std.textureLoad(maskedFadeLayout.$.mask, pixel, 0), maskedFadeLayout.$.settings.z > 0.5);
  return mixPremultiplied(
    std.textureLoad(maskedFadeLayout.$.base, pixel, 0),
    std.textureLoad(maskedFadeLayout.$.layer, pixel, 0),
    maskedFadeLayout.$.settings.x * k,
    maskedFadeLayout.$.settings.w > 0.5
  );
});

/**
 * Writes `layer` with every premultiplied channel scaled by `mask`'s effective coverage, inverted when `settings.z` is
 * set: the masked shape a clipping base or a folder's kept coverage gives the layers clipped to it.
 */
export const maskApplyLayout = tgpu.bindGroupLayout({
  layer: { texture: d.texture2d() },
  mask: { texture: d.texture2d() },
  settings: { uniform: d.vec4f }
});
export const maskApplyFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const pixel = d.vec2i(input.position.xy);
  const k = maskFactor(std.textureLoad(maskApplyLayout.$.mask, pixel, 0), maskApplyLayout.$.settings.z > 0.5);
  return std.mul(std.textureLoad(maskApplyLayout.$.layer, pixel, 0), k);
});
