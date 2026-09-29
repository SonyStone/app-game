import tgpu, { d, std, type TgpuRoot } from 'typegpu';
import { fontRows, glyphColumns, glyphRows, type PanelQuad } from './layoutPerformancePanel';

/**
 * Owns the performance panel's GPU resources on `root`: a quad buffer, the pixel-font buffer and a bind group. The
 * pipeline is shared per root and format. Framework-free: any TypeGPU app can `write` a layout, then `draw` into an
 * open render pass targeting `format`. Quads beyond `maxPanelQuads` are dropped. The caller calls `destroy`.
 */
export function makePerformancePanelRenderer(root: TgpuRoot, format: GPUTextureFormat) {
  const quads = root.createBuffer(d.arrayOf(PanelQuadSchema, maxPanelQuads)).$usage('storage');
  const font = root.createBuffer(d.arrayOf(d.u32, fontRows.length), fontRows).$usage('storage');
  const bindGroup = root.createBindGroup(panelLayout, { quads, font });
  const pipeline = panelPipeline(root, format);
  const staging = new Float32Array(maxPanelQuads * quadFloats);
  let count = 0;

  return {
    /** Uploads a layout for subsequent draws. Call before the pass that draws it is submitted. */
    write(layout: readonly PanelQuad[]) {
      count = Math.min(layout.length, maxPanelQuads);

      // Matches PanelQuadSchema's layout: rect, color, glyph, then padding to its 16-byte alignment.
      for (let index = 0; index < count; index++) {
        const { rect, color, glyph } = layout[index]!;
        staging.set(rect, index * quadFloats);
        staging.set(color, index * quadFloats + 4);
        staging[index * quadFloats + 8] = glyph;
      }

      quads.write(staging.buffer);
    },

    /** Records the uploaded layout into `pass`. */
    draw(pass: GPURenderPassEncoder) {
      if (count > 0) {
        pipeline.with(pass).with(bindGroup).draw(4, count);
      }
    },

    destroy() {
      quads.destroy();
      font.destroy();
    }
  };
}

/** Quads a panel can draw; the default layout needs about 200. */
export const maxPanelQuads = 320;

const PanelQuadSchema = d.struct({ rect: d.vec4f, color: d.vec4f, glyph: d.f32 });

/** Floats per quad in the storage buffer, including the struct's trailing padding. */
const quadFloats = 12;

const panelLayout = tgpu.bindGroupLayout({
  quads: { storage: d.arrayOf(PanelQuadSchema), access: 'readonly' },
  font: { storage: d.arrayOf(d.u32), access: 'readonly' }
});

/** Returns this root's panel pipeline for `format`, creating it on first use. */
function panelPipeline(root: TgpuRoot, format: GPUTextureFormat) {
  const cache = pipelines.get(root) ?? new Map<GPUTextureFormat, ReturnType<typeof createPanelPipeline>>();
  const pipeline = cache.get(format) ?? createPanelPipeline(root, format);

  cache.set(format, pipeline);
  pipelines.set(root, cache);

  return pipeline;
}

function createPanelPipeline(root: TgpuRoot, format: GPUTextureFormat) {
  return root.createRenderPipeline({
    vertex: panelVertex,
    fragment: panelFragment,
    primitive: { topology: 'triangle-strip' },
    targets: {
      format,
      blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      }
    }
  });
}

/** Pipelines hold no destroyable resources and live as long as their root. */
const pipelines = new WeakMap<TgpuRoot, Map<GPUTextureFormat, ReturnType<typeof createPanelPipeline>>>();

const panelVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
  out: { position: d.builtin.position, uv: d.vec2f, color: d.vec4f, glyph: d.f32 }
})(({ index, instance }) => {
  'use gpu';
  const quad = panelLayout.$.quads[instance]!;
  const corner = d.vec2f(d.f32(index & 1), d.f32(index >> 1));

  return {
    position: d.vec4f(std.mix(quad.rect.xy, quad.rect.zw, corner), 0, 1),
    uv: corner,
    color: quad.color,
    glyph: quad.glyph
  };
});

// A glyph quad spans whole font pixels, so each fragment maps to one bit of its glyph's row.
const panelFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f, color: d.vec4f, glyph: d.f32 },
  out: d.vec4f
})(({ uv, color, glyph }) => {
  'use gpu';
  if (glyph < 0) {
    return color;
  }

  const column = d.u32(std.min(uv.x * glyphColumns, glyphColumns - 0.5));
  const row = d.u32(std.min(uv.y * glyphRows, glyphRows - 0.5));
  const bits = panelLayout.$.font[d.u32(glyph + 0.5) * glyphRows + row]!;
  const lit = (bits >> (glyphColumns - 1 - column)) & 1;

  return d.vec4f(color.xyz, color.w * d.f32(lit));
});
