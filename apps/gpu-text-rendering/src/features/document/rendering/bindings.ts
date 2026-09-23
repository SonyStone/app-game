import tgpu, { d } from 'typegpu';

/** Per-frame transform shared by all pages; flags also select raster fallback and diagnostics. */
export const View = d.struct({
  mul: d.vec2f,
  add: d.vec2f,
  rotation: d.vec4f,
  rasterTexel: d.vec2f,
  debug: d.u32,
  vectorOnly: d.u32
});

/** Page offsets are static; instanceIndex selects the page without a uniform write per draw. */
export const viewLayout = tgpu.bindGroupLayout({
  view: { uniform: View },
  pages: { storage: d.arrayOf(d.vec2f), access: 'readonly' }
});

/** The curve atlas is read as exact texels; only the prerendered atlas uses filtering. */
export const atlasLayout = tgpu.bindGroupLayout({
  curves: { texture: d.texture2d(d.f32) },
  raster: { texture: d.texture2d(d.f32) },
  sampler: { sampler: 'filtering' }
});

/** The legacy glyph stream uses twelve bytes per vertex. */
export const glyphLayout = tgpu.vertexLayout(
  d.disarrayOf(
    d.unstruct({
      position: d.snorm16x2,
      curves: d.uint16x2,
      color: d.unorm8x4
    })
  )
);

/** Lossless packed glyph record; each u32 position contains two original i16 coordinates. */
export const GlyphInstance = d.struct({
  corner0: d.u32,
  corner1: d.u32,
  corner2: d.u32,
  corner3: d.u32,
  curves: d.u32,
  color: d.u32,
  page: d.u32
});

/** Vertex pulling retains the original six-vertex draw order with one record per glyph. */
export const glyphInstanceLayout = tgpu.bindGroupLayout({
  glyphs: { storage: d.arrayOf(GlyphInstance), access: 'readonly' }
});

/** Page backgrounds retain the shared triangle-strip geometry. */
export const pageLayout = tgpu.vertexLayout(d.disarrayOf(d.float32x2));

/** Image records are padded to twelve bytes because WebGPU vertex strides must be multiples of four. */
export const imageLayout = tgpu.vertexLayout(
  d.disarrayOf(
    d.unstruct({
      position: d.unorm16x2,
      uv: d.unorm16x2,
      alphaInvert: d.unorm8x4
    })
  )
);

/** Image content is independent from glyph atlases. */
export const imageTextureLayout = tgpu.bindGroupLayout({
  image: { texture: d.texture2d(d.f32) },
  sampler: { sampler: 'filtering' }
});
