import { d, std, tgpu } from 'typegpu';

/** Working-space choice; independent of Photoshop's saved paint mode and ABR descriptors. */
export type ColorMixing = 'linear' | 'classic';

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

/** Converts premultiplied sRGB to premultiplied linear RGB, keeping alpha unchanged. */
export function decodePremultiplied(pixel: d.v4f) {
  'use gpu';
  if (pixel.a <= 0) return d.vec4f(0);
  const rgb = std.clamp(std.div(pixel.rgb, pixel.a), d.vec3f(0), d.vec3f(1));
  return d.vec4f(std.mul(d.vec3f(decodeChannel(rgb.x), decodeChannel(rgb.y), decodeChannel(rgb.z)), pixel.a), pixel.a);
}

/** Encodes premultiplied linear RGB for the document's existing sRGB tile storage. */
export function encodePremultiplied(pixel: d.v4f) {
  'use gpu';
  if (pixel.a <= 0) return d.vec4f(0);
  const rgb = std.clamp(std.div(pixel.rgb, pixel.a), d.vec3f(0), d.vec3f(1));
  return d.vec4f(std.mul(d.vec3f(encodeChannel(rgb.x), encodeChannel(rgb.y), encodeChannel(rgb.z)), pixel.a), pixel.a);
}

/** Interpolates replacement pixels, including alpha loss when Smudge picks up transparency. */
export function mixPremultiplied(base: d.v4f, picked: d.v4f, amount: number, linear: boolean) {
  'use gpu';
  if (amount <= 0) return d.vec4f(base);
  if (amount >= 1) return d.vec4f(picked);
  if (linear) return encodePremultiplied(std.mix(decodePremultiplied(base), decodePremultiplied(picked), amount));
  return std.mix(base, picked, amount);
}

/** Bilinear sampling with decode before interpolation. Classic retains hardware sRGB-value filtering. */
export function sampleMixing(image: d.texture2d<d.F32>, sampler: d.sampler, uv: d.v2f, linear: boolean) {
  'use gpu';
  if (!linear) return std.textureSampleLevel(image, sampler, uv, 0);
  const size = d.vec2f(std.textureDimensions(image));
  const position = std.sub(std.mul(uv, size), d.vec2f(0.5));
  const cell = d.vec2i(std.floor(position));
  const f = std.fract(position);
  const limit = std.sub(d.vec2i(size), d.vec2i(1));
  const a = decodePremultiplied(std.textureLoad(image, std.clamp(cell, d.vec2i(0), limit), 0));
  const b = decodePremultiplied(std.textureLoad(image, std.clamp(std.add(cell, d.vec2i(1, 0)), d.vec2i(0), limit), 0));
  const c = decodePremultiplied(std.textureLoad(image, std.clamp(std.add(cell, d.vec2i(0, 1)), d.vec2i(0), limit), 0));
  const e = decodePremultiplied(std.textureLoad(image, std.clamp(std.add(cell, d.vec2i(1, 1)), d.vec2i(0), limit), 0));
  return encodePremultiplied(std.mix(std.mix(a, b, f.x), std.mix(c, e, f.x), f.y));
}
