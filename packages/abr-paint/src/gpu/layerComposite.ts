import { d, std, tgpu } from 'typegpu';
import { decodePremultiplied, encodePremultiplied, linearSourceOver } from '@app-game/abr-brush/effects';

/**
 * Full viewport layer compositing uses two alternating result textures and a temporary layer image. `settings` holds
 * opacity, blend mode index, in `z` whether the layer is clipped: its alpha is then multiplied by the alpha of `clip`,
 * the clipping base layer's own pixels (without clipping, `clip` may be any texture), and in `w` whether the blend
 * happens in linear light: both colors are decoded from sRGB first and the result encoded again, for every mode, as
 * Photoshop's "Blend RGB colors using gamma 1.0". Mode 4 is the older source-over in linear light, kept for callers
 * that pass it.
 */
export const compositeLayout = tgpu.bindGroupLayout({
  base: { texture: d.texture2d() },
  layer: { texture: d.texture2d() },
  clip: { texture: d.texture2d() },
  settings: { uniform: d.vec4f }
});
export const compositeFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const pixel = d.vec2i(input.position.xy);
  const encodedBase = std.textureLoad(compositeLayout.$.base, pixel, 0);
  let encodedSource = std.textureLoad(compositeLayout.$.layer, pixel, 0);
  if (compositeLayout.$.settings.z > 0.5) {
    encodedSource = std.mul(encodedSource, std.textureLoad(compositeLayout.$.clip, pixel, 0).a);
  }
  if (compositeLayout.$.settings.y > 3.5) {
    return linearSourceOver(encodedBase, std.mul(encodedSource, compositeLayout.$.settings.x));
  }
  const linear = compositeLayout.$.settings.w > 0.5;
  const base = std.select(encodedBase, decodePremultiplied(encodedBase), linear);
  const source = std.select(encodedSource, decodePremultiplied(encodedSource), linear);
  const alpha = source.a * compositeLayout.$.settings.x;
  const cb = std.div(base.rgb, std.max(base.a, 0.000001));
  const cs = std.div(source.rgb, std.max(source.a, 0.000001));
  let blend = d.vec3f(cs);
  const mode = compositeLayout.$.settings.y;
  if (mode > 0.5 && mode < 1.5) blend = std.mul(cb, cs);
  if (mode > 1.5 && mode < 2.5) blend = std.sub(d.vec3f(1), std.mul(std.sub(d.vec3f(1), cb), std.sub(d.vec3f(1), cs)));
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
