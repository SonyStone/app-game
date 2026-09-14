import { d, std, tgpu } from 'typegpu';
import { linearSourceOver } from '@app-game/abr-brush/effects';

/** Full viewport layer compositing uses two alternating result textures and a temporary layer image. */
export const compositeLayout = tgpu.bindGroupLayout({
  base: { texture: d.texture2d() },
  layer: { texture: d.texture2d() },
  settings: { uniform: d.vec4f }
});
export const compositeFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const pixel = d.vec2i(input.position.xy);
  const base = std.textureLoad(compositeLayout.$.base, pixel, 0);
  const source = std.textureLoad(compositeLayout.$.layer, pixel, 0);
  const alpha = source.a * compositeLayout.$.settings.x;
  if (compositeLayout.$.settings.y > 3.5) return linearSourceOver(base, std.mul(source, compositeLayout.$.settings.x));
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
  return d.vec4f(rgb, alpha + base.a * (1 - alpha));
});
