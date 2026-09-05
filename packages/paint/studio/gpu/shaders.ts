import { common, d, std, tgpu } from 'typegpu';
import { linearSourceOver } from './colorMixing';

/** All brush settings are stable for the lifetime of a stroke. */
export const brushLayout = tgpu.bindGroupLayout({
  settings: { uniform: d.struct({ color: d.vec4f, params: d.vec4f }) }
});
/** Stamp instances carry tile-local center, radius, and flow. */
export const stampLayout = tgpu.vertexLayout(d.arrayOf(d.vec4f), 'instance');

/** Rasterizes round stamps into an alpha mask using hardware source-over blending. */
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

/** Reads immutable pre-stroke pixels and the accumulated mask, writing a separate result texture. */
export const strokeLayout = tgpu.bindGroupLayout({
  base: { texture: d.texture2d() },
  mask: { texture: d.texture2d() }
});
export const fullscreenVertex = common.fullScreenTriangle;

/** Applies stroke opacity exactly once, supporting destination-out erasing. */
export const strokeFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const pixel = d.vec2i(input.position.xy);
  const base = std.textureLoad(strokeLayout.$.base, pixel, 0);
  const mask = std.textureLoad(strokeLayout.$.mask, pixel, 0).a;
  const alpha = mask * brushLayout.$.settings.params.y;
  if (brushLayout.$.settings.params.z > 0.5) return std.mul(base, 1 - alpha);
  if (brushLayout.$.settings.params.w > 0.5)
    return linearSourceOver(base, std.mul(d.vec4f(brushLayout.$.settings.color.rgb, 1), alpha));
  return std.add(std.mul(d.vec4f(brushLayout.$.settings.color.rgb, 1), alpha), std.mul(base, 1 - alpha));
});

/** Camera uses tile positions relative to the view center to preserve precision far from the origin. */
export const viewLayout = tgpu.bindGroupLayout({
  view: {
    uniform: d.struct({ size: d.vec2f, zoom: d.f32, angle: d.f32, mirror: d.f32, padding: d.f32, offset: d.vec2f })
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
export const tileFragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
  'use gpu';
  return std.textureSample(viewLayout.$.image, viewLayout.$.sampler, input.uv);
});

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

/** Presents the composed document over a neutral paper background. */
export const presentLayout = tgpu.bindGroupLayout({ image: { texture: d.texture2d() } });
export const presentFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const color = std.textureLoad(presentLayout.$.image, d.vec2i(input.position.xy), 0);
  return d.vec4f(std.add(color.rgb, std.mul(d.vec3f(0.98, 0.974, 0.957), 1 - color.a)), 1);
});
