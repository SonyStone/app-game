import { blendModeId, dualCoverage, grain, textureCoverage, textureTone } from '@app-game/abr-brush/effects';
import type { BrushFormValues } from '@app-game/abr-brush/form';
import { paintBlend, paintModes } from '@app-game/abr-brush/paintBlend';
import { common, d, std, tgpu, type TgpuRoot } from 'typegpu';
import type { Dab } from '../brush';
import type { BrushResource } from '../composition/brushResources';
import { linearSourceOver } from './colorMixing';

/** Immutable preset resources pinned by the brush session. */
export type AbrRasterSettings = {
  values: BrushFormValues;
  tip: BrushResource;
  pattern?: BrushResource;
  dual?: BrushResource;
  /** Scales the secondary tip relative to the edited primary diameter. */
  size: number;
  mixing: 'linear' | 'classic';
  blendMode?: string;
};

/** Device-owned ABR rasterizer. Tile scratch is allocated lazily and participates in Paint's eviction.
 * The primary color, flow/opacity ceiling and secondary coverage remain separate until compositing.
 */
export function createAbrStamps(root: TgpuRoot) {
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' });
  const repeat = root.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat'
  });
  const primary = root.createRenderPipeline({
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
          color: { srcFactor: 'one', dstFactor: 'one-minus-src' },
          alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' }
        }
      }
    }
  });
  const secondary = root.createRenderPipeline({
    attribs: abrStampLayout.attrib,
    vertex,
    fragment: secondaryFragment,
    targets: {
      format: 'rgba8unorm',
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
      }
    }
  });
  const composite = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: compositeFragment,
    targets: { format: 'rgba8unorm' }
  });
  type Uploaded = ReturnType<typeof coverageTexture>;
  let textures: Uploaded[] = [];
  const lookup = new WeakMap<BrushResource, Uploaded>();
  const budget = 64 * 1024 * 1024;
  const bytes = (image: Uploaded) => (image.props.size[0] * image.props.size[1] * 4) / 3;
  let uploads = 0;
  let settings: AbrRasterSettings | undefined;
  let tip: Uploaded, pattern: Uploaded, dual: Uploaded;
  function upload(resource: BrushResource) {
    if (
      resource.width > root.device.limits.maxTextureDimension2D ||
      resource.height > root.device.limits.maxTextureDimension2D
    )
      throw new Error('ABR resource exceeds this device’s texture size.');
    const cached = lookup.get(resource);
    if (cached && textures.includes(cached)) {
      textures.splice(textures.indexOf(cached), 1);
      textures.push(cached);
      return cached;
    }
    const mipLevelCount = Math.floor(Math.log2(Math.max(resource.width, resource.height))) + 1;
    const texture = coverageTexture(root, resource.width, resource.height, mipLevelCount);
    textures.push(texture);
    uploads++;
    root.device.queue.writeTexture(
      { texture: root.unwrap(texture) },
      resource.pixels,
      { bytesPerRow: resource.width },
      [resource.width, resource.height]
    );
    texture.generateMipmaps();
    lookup.set(resource, texture);
    return texture;
  }
  return {
    prepare(value: AbrRasterSettings) {
      const required = [value.tip, ...(value.pattern ? [value.pattern] : []), ...(value.dual ? [value.dual] : [])];
      const keep = new Set(required.map((resource) => lookup.get(resource)).filter(Boolean));
      const missing = required.filter(
        (resource) => !keep.has(lookup.get(resource)) || !textures.includes(lookup.get(resource)!)
      );
      const additional = missing.reduce((sum, resource) => sum + (resource.width * resource.height * 4) / 3, 0);
      if (required.reduce((sum, resource) => sum + (resource.width * resource.height * 4) / 3, 0) > budget)
        throw new Error('ABR mipmaps exceed the 64 MiB GPU brush budget.');
      for (const old of [...textures]) {
        if (
          textures.reduce((sum, texture) => sum + bytes(texture), additional) <= budget &&
          textures.length + missing.length <= 256
        )
          break;
        if (keep.has(old)) continue;
        old.destroy();
        textures.splice(textures.indexOf(old), 1);
      }
      settings = value;
      try {
        tip = upload(value.tip);
        pattern = value.pattern ? upload(value.pattern) : tip;
        dual = value.dual ? upload(value.dual) : tip;
      } catch (error) {
        for (const texture of textures) texture.destroy();
        textures = [];
        throw error;
      }
    },
    /** Creates device scratch without owning the base or mask supplied by the tile cache. */
    createTile: (base: Texture, mask: Texture, capacity: number) => createAbrTile(root, base, mask, capacity),
    /** All writes are tile-local; uniforms carry world origin for a continuous pattern across seams. */
    draw(tile: AbrTile, encoder: GPUCommandEncoder, dabs: readonly Dab[], tx: number, ty: number) {
      const s = settings!;
      const v = s.values;
      tile.params.write({
        origin: d.vec4f((tx * 256) % 65536, (ty * 256) % 65536, 256, s.mixing === 'linear' ? 1 : 0),
        phase: d.vec4f(
          (tx * 256) % (((s.pattern?.width ?? 1) * v.texture.scale) / 100),
          (ty * 256) % (((s.pattern?.height ?? 1) * v.texture.scale) / 100),
          0,
          0
        ),
        texture: d.vec4f(
          s.pattern?.width ?? 1,
          s.pattern?.height ?? 1,
          v.texture.scale / 100,
          blendModeId(v.texture.mode)
        ),
        tone: d.vec4f(v.texture.invert ? 1 : 0, v.texture.brightness, v.texture.contrast, 0),
        flags: d.vec4f(
          v.useTexture && s.pattern ? 1 : 0,
          v.texture.eachTip ? 1 : 0,
          v.useDualBrush && s.dual ? 1 : 0,
          v.useNoise ? 1 : 0
        ),
        extra: d.vec4f(
          v.texture.depth / 100,
          blendModeId(v.dualBrush.mode),
          v.useWetEdges ? 1 : 0,
          Math.max(
            0,
            paintModes.findIndex((mode) => mode === (s.blendMode ?? 'Nrml'))
          )
        )
      });
      // One upload, separate vertex ranges: never overwrite a buffer before its draws are submitted.
      const ordered = [...dabs.filter((dab) => dab.abr?.secondary), ...dabs.filter((dab) => !dab.abr?.secondary)];
      const data = new Float32Array(ordered.length * 16);
      ordered.forEach((dab, i) => {
        if (!dab.abr) throw new Error('ABR rasterizer requires ABR stamp attributes.');
        data.set(dab.abr.data, i * 16);
        data[i * 16] = dab.x - tx * 256;
        data[i * 16 + 1] = dab.y - ty * 256;
      });
      root.device.queue.writeBuffer(root.unwrap(tile.stamps), 0, data);
      const secondCount = ordered.filter((dab) => dab.abr?.secondary).length;
      const group = (image: Uploaded) =>
        root.createBindGroup(layout, { params: tile.params, tip: image, pattern, sampler, repeat });
      if (secondCount) {
        const pass = encoder.beginRenderPass({
          colorAttachments: [{ view: tile.dualView, loadOp: 'load', storeOp: 'store' }]
        });
        secondary.with(pass).with(group(dual)).with(abrStampLayout, tile.stamps).draw(6, secondCount);
        pass.end();
      }
      if (ordered.length > secondCount) {
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            { view: tile.paintView, loadOp: 'load', storeOp: 'store' },
            { view: root.unwrap(tile.mask).createView(), loadOp: 'load', storeOp: 'store' }
          ]
        });
        primary
          .with(pass)
          .with(group(tip))
          .with(abrStampLayout, tile.stamps)
          .draw(6, ordered.length - secondCount, 0, secondCount);
        pass.end();
      }
    },
    composite(tile: AbrTile, pass: GPURenderPassEncoder) {
      composite
        .with(pass)
        .with(
          root.createBindGroup(compositeLayout, {
            base: tile.base,
            mask: tile.mask,
            paint: tile.paint,
            dual: tile.dualMask,
            pattern,
            repeat,
            params: tile.params
          })
        )
        .draw(3);
    },
    stats: () => ({
      uploads,
      textures: textures.length,
      bytes: textures.reduce((sum, texture) => sum + (texture.props.size[0] * texture.props.size[1] * 4) / 3, 0)
    }),
    destroy() {
      for (const texture of textures) texture.destroy();
      textures = [];
    }
  };
}

/** Extra ABR scratch survives eviction and disposable preview copies along with the ordinary mask. */
export type AbrTile = ReturnType<typeof createAbrTile>;
function createAbrTile(root: TgpuRoot, base: Texture, mask: Texture, capacity: number) {
  const paint = texture(root),
    dualMask = texture(root);
  const params = root.createBuffer(Params).$usage('uniform');
  const stamps = root.createBuffer(d.arrayOf(Stamp, capacity)).$usage('vertex');
  return {
    paint,
    dualMask,
    params,
    stamps,
    paintView: root.unwrap(paint).createView(),
    dualView: root.unwrap(dualMask).createView(),
    base,
    mask,
    destroy() {
      paint.destroy();
      dualMask.destroy();
      params.destroy();
      stamps.destroy();
    }
  };
}
function coverageTexture(root: TgpuRoot, width: number, height: number, mipLevelCount: number) {
  return root.createTexture({ size: [width, height], format: 'r8unorm', mipLevelCount }).$usage('sampled', 'render');
}
function texture(root: TgpuRoot) {
  return root.createTexture({ size: [256, 256], format: 'rgba8unorm' }).$usage('sampled', 'render');
}
type Texture = ReturnType<typeof texture>;
const Params = d.struct({
  origin: d.vec4f,
  phase: d.vec4f,
  texture: d.vec4f,
  tone: d.vec4f,
  flags: d.vec4f,
  extra: d.vec4f
});
const Stamp = d.struct({ bounds: d.vec4f, transform: d.vec4f, dynamics: d.vec4f, color: d.vec4f });
export const abrStampLayout = tgpu.vertexLayout(d.arrayOf(Stamp), 'instance');
const layout = tgpu.bindGroupLayout({
  params: { uniform: Params },
  tip: { texture: d.texture2d() },
  pattern: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
  repeat: { sampler: 'filtering' }
});
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
  const pixel = std.add(
    input.bounds.xy,
    d.vec2f(
      local.x * input.transform.x - local.y * input.transform.y,
      local.x * input.transform.y + local.y * input.transform.x
    )
  );
  return {
    position: d.vec4f(pixel.x / 128 - 1, 1 - pixel.y / 128, 0, 1),
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
  const p = layout.$.params;
  let coverage = std.textureSample(layout.$.tip, layout.$.sampler, input.uv).r;
  const uv = std.div(std.add(input.position.xy, p.phase.xy), std.mul(p.texture.xy, p.texture.z));
  const sample = std.textureSample(layout.$.pattern, layout.$.repeat, uv).r;
  if (p.flags.x > 0 && p.flags.y > 0)
    coverage = textureCoverage(
      coverage,
      textureTone(sample, p.tone.x, p.tone.y, p.tone.z),
      p.texture.w,
      input.dynamics.z
    );
  if (p.flags.w > 0)
    coverage *= 0.35 + 0.65 * grain(input.position.x + p.origin.x, input.position.y + p.origin.y, input.dynamics.w);
  const flow = coverage * input.dynamics.x;
  return {
    paint: d.vec4f(std.mul(input.color.rgb, flow), flow),
    mask: d.vec4f(flow, flow, flow, coverage * input.dynamics.y)
  };
});
const secondaryFragment = tgpu.fragmentFn({ in: { uv: d.vec2f, dynamics: d.vec4f, color: d.vec4f }, out: d.vec4f })((
  input
) => {
  'use gpu';
  return d.vec4f(std.textureSample(layout.$.tip, layout.$.sampler, input.uv).r * input.dynamics.x);
});
const compositeLayout = tgpu.bindGroupLayout({
  base: { texture: d.texture2d() },
  mask: { texture: d.texture2d() },
  paint: { texture: d.texture2d() },
  dual: { texture: d.texture2d() },
  pattern: { texture: d.texture2d() },
  repeat: { sampler: 'filtering' },
  params: { uniform: Params }
});
const compositeFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const p = compositeLayout.$.params;
  const xy = d.vec2i(input.position.xy);
  const base = std.textureLoad(compositeLayout.$.base, xy, 0);
  const mask = std.textureLoad(compositeLayout.$.mask, xy, 0);
  const paint = std.textureLoad(compositeLayout.$.paint, xy, 0);
  let alpha = std.min(mask.r, mask.a);
  if (p.flags.z > 0) alpha = dualCoverage(alpha, std.textureLoad(compositeLayout.$.dual, xy, 0).r, p.extra.y);
  const uv = std.div(std.add(input.position.xy, p.phase.xy), std.mul(p.texture.xy, p.texture.z));
  const sample = std.textureSample(compositeLayout.$.pattern, compositeLayout.$.repeat, uv).r;
  if (p.flags.x > 0 && p.flags.y === 0)
    alpha = textureCoverage(alpha, textureTone(sample, p.tone.x, p.tone.y, p.tone.z), p.texture.w, p.extra.x);
  // Local edge approximation; exact wet-edge diffusion requires a halo exchange between tiles.
  if (p.extra.z > 0) {
    const up = std.textureLoad(
      compositeLayout.$.mask,
      std.clamp(std.add(xy, d.vec2i(0, -1)), d.vec2i(0), d.vec2i(255)),
      0
    ).r;
    const down = std.textureLoad(
      compositeLayout.$.mask,
      std.clamp(std.add(xy, d.vec2i(0, 1)), d.vec2i(0), d.vec2i(255)),
      0
    ).r;
    const left = std.textureLoad(
      compositeLayout.$.mask,
      std.clamp(std.add(xy, d.vec2i(-1, 0)), d.vec2i(0), d.vec2i(255)),
      0
    ).r;
    const right = std.textureLoad(
      compositeLayout.$.mask,
      std.clamp(std.add(xy, d.vec2i(1, 0)), d.vec2i(0), d.vec2i(255)),
      0
    ).r;
    alpha = std.min(1, alpha * 0.65 + std.max(0, mask.r - std.min(std.min(up, down), std.min(left, right))) * 2);
  }
  if (p.extra.w === 1)
    alpha = std.select(0, 1, grain(input.position.x + p.origin.x, input.position.y + p.origin.y, 13.75) < alpha);
  const color = std.div(paint.rgb, std.max(0.00001, paint.a));
  const source = d.vec4f(std.mul(color, alpha), alpha);
  if (p.extra.w === 28) return std.mul(base, 1 - alpha);
  if (p.extra.w === 27) return std.add(base, std.mul(source, 1 - base.a));
  if (p.extra.w < 2 && p.origin.w > 0) return linearSourceOver(base, source);
  const cb = std.div(base.rgb, std.max(base.a, 0.00001));
  const mixed = paintBlend(cb, color, p.extra.w);
  const rgb = std.add(
    std.mul(base.rgb, 1 - alpha),
    std.mul(std.add(std.mul(color, 1 - base.a), std.mul(mixed, base.a)), alpha)
  );
  return d.vec4f(rgb, alpha + base.a * (1 - alpha));
});
