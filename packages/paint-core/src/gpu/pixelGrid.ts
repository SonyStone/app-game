import { common, d, std, tgpu, type TgpuRoot } from 'typegpu';
import type { Camera, ViewSize } from '../camera';

/**
 * Lines between document pixels over the presented view, as Photoshop's pixel grid: one screen pixel wide, drawn in
 * the presentation pass from the camera of the frame itself, so they sit on the edges of the pixels shown and move
 * with them. They fade in from {@link pixelGridZoom} and never enter tiles, history or exports. Each target keeps its
 * own uniforms.
 */
export function createPixelGrid(root: TgpuRoot, format: GPUTextureFormat) {
  const pipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: gridFragment,
    targets: {
      format,
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
      }
    }
  });
  const perTarget = new WeakMap<object, { buffer: ReturnType<typeof createBuffer>; group: ReturnType<typeof bind> }>();
  const createBuffer = () => root.createBuffer(gridUniform).$usage('uniform');
  const bind = (buffer: ReturnType<typeof createBuffer>) => root.createBindGroup(gridLayout, { grid: buffer });

  return {
    /**
     * Encodes the grid over `view`, the presented swapchain texture of `target`, which is `width` × `height` backing
     * pixels for a `size` of CSS pixels showing `camera`. Draws nothing below {@link pixelGridZoom}.
     */
    render(
      encoder: GPUCommandEncoder,
      target: object,
      view: GPUTextureView,
      camera: Camera,
      size: ViewSize,
      width: number,
      height: number
    ) {
      if (camera.zoom < pixelGridZoom) {
        return;
      }

      let state = perTarget.get(target);
      if (!state) {
        const buffer = createBuffer();
        state = { buffer, group: bind(buffer) };
        perTarget.set(target, state);
      }

      state.buffer.write({
        size: d.vec2f(size.width, size.height),
        backing: d.vec2f(width, height),
        // Whole document pixels do not move the grid; their fraction keeps precision far from the origin.
        camera: d.vec2f(camera.x - Math.floor(camera.x), camera.y - Math.floor(camera.y)),
        zoom: camera.zoom,
        angle: camera.angle,
        mirror: camera.mirrored ? -1 : 1,
        opacity: Math.min(1, (camera.zoom - pixelGridZoom) / 2 + 0.4)
      });
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }] });
      pipeline.with(pass).with(state.group).draw(3);
      pass.end();
    }
  };
}

/** Zoom, in CSS pixels per document pixel, from which the pixel grid shows. */
export const pixelGridZoom = 6;

const gridUniform = d.struct({
  size: d.vec2f,
  backing: d.vec2f,
  camera: d.vec2f,
  zoom: d.f32,
  angle: d.f32,
  mirror: d.f32,
  opacity: d.f32
});

const gridLayout = tgpu.bindGroupLayout({ grid: { uniform: gridUniform } });

/**
 * The document position under each screen pixel, as `screenToWorld` computes it, then a line wherever that position
 * is within one screen pixel of a whole document pixel.
 */
const gridFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const grid = gridLayout.$.grid;
  const css = std.mul(input.position.xy, std.div(grid.size, grid.backing));
  const x = (css.x - grid.size.x / 2) / grid.zoom;
  const y = (css.y - grid.size.y / 2) / grid.zoom;
  const c = std.cos(grid.angle);
  const s = std.sin(grid.angle);
  const document = d.vec2f(grid.camera.x + (x * c + y * s) * grid.mirror, grid.camera.y - x * s + y * c);
  // Distance to the nearest pixel edge, in document pixels, against the size of one screen pixel there.
  const edge = std.abs(std.sub(std.fract(std.add(document, 0.5)), 0.5));
  const width = std.max(std.fwidth(document), d.vec2f(0.0001));
  const line = std.sub(d.vec2f(1), std.smoothstep(d.vec2f(0), width, edge));
  const alpha = std.max(line.x, line.y) * 0.3 * grid.opacity;
  return d.vec4f(std.mul(d.vec3f(0.45), alpha), alpha);
});
