import tgpu, { d, std } from 'typegpu';
import { curveLayout, shapeOnlySlot } from './curveBindings';
import { clipCoverage, projected, transformed } from './curveShader';
import { radialLayout, radialUv } from './radialGradient';
import { lookupSize, tileExtent, tileSize } from './virtualTiles';

/** Per-image addressing; all mip tails and detail tiles share two document-wide atlases. */
export const RasterImage = d.struct({
  size: d.vec2u,
  id: d.u32,
  tailLevel: d.u32,
  tailOrigin: d.vec2u,
  interpolate: d.u32
});

export const rasterLayout = tgpu.bindGroupLayout({
  image: { texture: d.texture2d(d.f32) },
  tails: { texture: d.texture2d(d.f32) },
  lookup: { storage: d.arrayOf(d.vec4u) },
  metadata: { uniform: RasterImage },
  sampler: { sampler: 'filtering' }
});

/** Raster quads use the same page transforms and clipping coordinates as vector outlines. */
export const rasterVertex = tgpu.vertexFn({
  in: { vertex: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
  out: { position: d.builtin.position, uv: d.vec2f, pagePosition: d.vec2f, instance: d.interpolate('flat', d.u32) }
})((input) => {
  'use gpu';
  const item = curveLayout.$.instances[input.instance]!;
  const uv = d.vec2f(
    std.select(0, 1, input.vertex === 1 || input.vertex === 4 || input.vertex === 5),
    std.select(0, 1, input.vertex >= 2 && input.vertex !== 4)
  );

  return { position: projected(item, uv), uv, pagePosition: transformed(item, uv), instance: input.instance };
});

/** Premultiplied samples keep transparent borders clean when filtering and generating mipmaps. */
export const rasterFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f, pagePosition: d.vec2f, instance: d.interpolate('flat', d.u32) },
  out: d.vec4f
})((input) => {
  'use gpu';
  const item = curveLayout.$.instances[input.instance]!;
  const gradient = radialLayout.$.gradients[item.info.x]!;
  const sample = radialUv(input.uv, gradient);
  const size = d.vec2f(rasterLayout.$.metadata.size);
  const dx = std.mul(std.dpdx(sample.xy), size);
  const dy = std.mul(std.dpdy(sample.xy), size);
  const lod = std.max(0, std.log2(std.max(std.length(dx), std.length(dy))));
  const low = d.u32(std.floor(lod));
  const ramp = std.mix(sampleVirtual(sample.xy, low), sampleVirtual(sample.xy, low + 1), std.fract(lod));
  const pixel = std.mix(gradient.background, ramp, sample.z);
  let opacity = clipCoverage(
    item.clipReference,
    input.pagePosition,
    std.dpdx(input.pagePosition),
    std.dpdy(input.pagePosition)
  );

  if (
    input.pagePosition.x < item.clip.x ||
    input.pagePosition.y < item.clip.y ||
    input.pagePosition.x > item.clip.z ||
    input.pagePosition.y > item.clip.w
  ) {
    opacity = 0;
  }

  if (shapeOnlySlot.$) {
    return d.vec4f(pixel.a * opacity);
  }

  opacity *= item.color.a;
  return std.mul(pixel, d.vec4f(std.mul(item.color.rgb, opacity), opacity));
});

/** Missing detail falls back through resident parents, ending in the pinned mip tail. */
function sampleVirtual(uv: d.v2f, requestedLevel: number) {
  'use gpu';
  const metadata = rasterLayout.$.metadata;
  const last = d.u32(std.floor(std.log2(d.f32(std.max(metadata.size.x, metadata.size.y)))));
  let level = std.min(d.u32(requestedLevel), last);

  for (let attempt = d.u32(0); attempt < 16; attempt++) {
    const size = std.max(d.vec2u(1), d.vec2u(std.floor(std.div(d.vec2f(metadata.size), std.exp2(d.f32(level))))));
    let pixel = std.mul(std.clamp(uv, d.vec2f(0), d.vec2f(1)), d.vec2f(size));

    if (metadata.interpolate === 0) {
      pixel = std.add(std.min(std.floor(pixel), std.sub(d.vec2f(size), 1)), 0.5);
    }

    if (level >= metadata.tailLevel) {
      let x = d.u32(metadata.tailOrigin.x);

      for (let l = metadata.tailLevel; l < level; l++) {
        x += std.max(d.u32(1), d.u32(d.f32(metadata.size.x) / std.exp2(d.f32(l)))) + 2;
      }

      const position = std.add(d.vec2f(d.f32(x + 1), d.f32(metadata.tailOrigin.y + 1)), pixel);
      return std.textureSampleLevel(
        rasterLayout.$.tails,
        rasterLayout.$.sampler,
        std.div(position, d.vec2f(std.textureDimensions(rasterLayout.$.tails))),
        0
      );
    }

    const tile = d.vec2u(std.floor(std.div(std.min(pixel, std.sub(d.vec2f(size), 0.0001)), tileSize)));
    const address = (level * 512 + tile.y) * 512 + tile.x;
    let hash = (((metadata.id + 1) * d.u32(2654435761)) ^ (address * d.u32(2246822519))) & d.u32(lookupSize - 1);

    for (let probe = d.u32(0); probe < lookupSize; probe++) {
      const entry = rasterLayout.$.lookup[hash]!;

      if (entry.x === 0) {
        break;
      }

      if (entry.x === metadata.id + 1 && entry.y === address) {
        const origin = std.mul(d.vec2f(entry.z, entry.w), tileExtent);
        const position = std.add(std.add(origin, 1), std.sub(pixel, std.mul(d.vec2f(tile), tileSize)));
        return std.textureSampleLevel(
          rasterLayout.$.image,
          rasterLayout.$.sampler,
          std.div(position, d.vec2f(std.textureDimensions(rasterLayout.$.image))),
          0
        );
      }

      hash = (hash + 1) & d.u32(lookupSize - 1);
    }

    level++;
  }

  return d.vec4f(0);
}
