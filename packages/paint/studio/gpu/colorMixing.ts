import { d, std, tgpu } from 'typegpu';

/** Source-over in linear light; input/output remain premultiplied sRGB RGBA8-compatible values. */
export const linearSourceOver = tgpu.fn(
  [d.vec4f, d.vec4f],
  d.vec4f
)((base, source) => {
  'use gpu';
  if (source.a <= 0) return d.vec4f(base);
  if (base.a <= 0 || source.a >= 1) return d.vec4f(source);
  const alpha = source.a + base.a * (1 - source.a);
  const b = std.clamp(std.div(base.rgb, base.a), d.vec3f(0), d.vec3f(1));
  const s = std.clamp(std.div(source.rgb, source.a), d.vec3f(0), d.vec3f(1));
  const baseLinear = d.vec3f(decodeChannel(b.x), decodeChannel(b.y), decodeChannel(b.z));
  const sourceLinear = d.vec3f(decodeChannel(s.x), decodeChannel(s.y), decodeChannel(s.z));
  const color = std.div(std.add(std.mul(sourceLinear, source.a), std.mul(baseLinear, base.a * (1 - source.a))), alpha);
  const encoded = d.vec3f(encodeChannel(color.x), encodeChannel(color.y), encodeChannel(color.z));
  return d.vec4f(std.mul(encoded, alpha), alpha);
});

/** sRGB transfer function, as specified by https://www.w3.org/TR/css-color-4/#color-conversion-code. */
const decodeChannel = tgpu.fn(
  [d.f32],
  d.f32
)((value) => {
  'use gpu';
  if (value <= 0.04045) return value / 12.92;
  return std.pow((value + 0.055) / 1.055, 2.4);
});
const encodeChannel = tgpu.fn(
  [d.f32],
  d.f32
)((value) => {
  'use gpu';
  if (value <= 0.0031308) return value * 12.92;
  return 1.055 * std.pow(value, 1 / 2.4) - 0.055;
});
