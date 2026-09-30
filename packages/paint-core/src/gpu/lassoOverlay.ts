import { common, d, std, tgpu, type TgpuBuffer, type TgpuRoot, type UniformFlag } from 'typegpu';
import { worldToScreen, type Camera, type Point, type ViewSize } from '../camera';

/** TypeGPU port of the lasso example's filled mask and animated edge passes.
 * Uses the painting root/device and draws into its existing presentation attachment.
 * Stencil parity handles concave/crossing paths; animation reuses the mask until geometry or camera changes.
 * Pipelines and world-space geometry are shared; each canvas target owns its screen-space points, mask and stencil,
 * so presenting targets of different sizes or cameras never recreates or re-uploads another target's state.
 */
export function createLassoOverlay(root: TgpuRoot, format: GPUTextureFormat) {
  const parity = root.createRenderPipeline({
    vertex: lassoVertex,
    fragment: lassoFill,
    targets: { format: 'r8unorm', writeMask: 0 },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      format: 'stencil8',
      stencilReadMask: 1,
      stencilWriteMask: 1,
      stencilFront: { compare: 'always', passOp: 'invert' },
      stencilBack: { compare: 'always', passOp: 'invert' }
    }
  });
  const fill = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: lassoFill,
    targets: { format: 'r8unorm' },
    depthStencil: {
      format: 'stencil8',
      stencilReadMask: 1,
      stencilWriteMask: 0,
      stencilFront: { compare: 'equal' },
      stencilBack: { compare: 'equal' }
    }
  });
  const edges = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: lassoEdge,
    targets: {
      format,
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
      }
    }
  });
  let points: readonly Point[] = [];
  const targets = new Set<LassoTarget>();

  return {
    /** Replaces transient geometry only; resource updates happen in the renderer's serialized draw. */
    set(next: readonly Point[]) {
      points = next;
    },
    /** Creates one canvas target's overlay state. GPU resources are allocated on its first visible selection. */
    target(): LassoTarget {
      const target = createTarget();
      targets.add(target);
      return target;
    },
    /** Bytes currently allocated by every target. */
    bytes: () => [...targets].reduce((sum, target) => sum + target.bytes(), 0),
    destroy() {
      for (const target of targets) target.destroy();
    }
  };

  function createTarget(): LassoTarget {
    let state: ReturnType<typeof createTargetBuffers> | undefined;
    let lastPoints: readonly Point[] | undefined;
    let signature = '';
    let mask: ReturnType<typeof createMask> | undefined;
    const release = () => {
      mask?.destroy();
      mask = undefined;
      lastPoints = undefined;
      signature = '';
    };
    const target: LassoTarget = {
      render(view, camera, size, width, height, seconds, encoder) {
        if (points.length < 3) {
          release();
          return;
        }
        if (points.length > 4096) throw new Error('Lasso path exceeds its point budget.');
        state ??= createTargetBuffers(root);
        const nextSignature = `${camera.x},${camera.y},${camera.zoom},${camera.angle},${camera.mirrored},${size.width},${size.height},${width},${height}`;
        if (!mask || mask.width !== width || mask.height !== height) {
          mask?.destroy();
          mask = createMask(root, state.settings, width, height);
          signature = '';
        }
        if (lastPoints !== points || signature !== nextSignature) {
          const data = new Float32Array(4096 * 2);
          points.forEach((point, i) => {
            const screen = worldToScreen(point, camera, size);
            data[i * 2] = (screen.x / size.width) * 2 - 1;
            data[i * 2 + 1] = 1 - (screen.y / size.height) * 2;
          });
          state.points.write(data);
          const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: mask.render, loadOp: 'clear', storeOp: 'store' }],
            depthStencilAttachment: {
              view: mask.stencilView,
              stencilClearValue: 0,
              stencilLoadOp: 'clear',
              stencilStoreOp: 'discard'
            }
          });
          parity
            .with(pass)
            .with(state.pointsGroup)
            .draw((points.length - 2) * 3);
          fill.with(pass).withStencilReference(1).draw(3);
          pass.end();
          lastPoints = points;
          signature = nextSignature;
        }
        state.settings.write(d.vec4f(seconds, width, height, width / size.width));
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }] });
        edges.with(pass).with(mask.group).draw(3);
        pass.end();
      },
      bytes: () => (state ? 4096 * 8 + 16 : 0) + (mask ? mask.width * mask.height * 2 : 0),
      destroy() {
        release();
        state?.points.destroy();
        state?.settings.destroy();
        state = undefined;
        targets.delete(target);
      }
    };
    return target;
  }
}

/** One canvas target's selection overlay. */
export type LassoTarget = {
  /**
   * Encodes the outline after artwork presentation into `encoder`, which the caller submits. Never writes into
   * document/cache textures. Updates this target's buffers, so submit before rendering the same target again.
   */
  render(
    view: GPUTextureView,
    camera: Camera,
    size: ViewSize,
    width: number,
    height: number,
    seconds: number,
    encoder: GPUCommandEncoder
  ): void;
  bytes(): number;
  /** Releases this target's buffers and mask; the shared overlay stays usable. */
  destroy(): void;
};

/** Screen-space points and edge settings for one target; points depend on that target's camera. */
function createTargetBuffers(root: TgpuRoot) {
  const points = root.createBuffer(d.arrayOf(d.vec2f, 4096)).$usage('storage');
  return {
    points,
    pointsGroup: root.createBindGroup(lassoPointsLayout, { points }),
    settings: root.createBuffer(d.vec4f).$usage('uniform')
  };
}

/** Pixel masks and stencil share the viewport's bounded dimensions and are cached across animation frames. */
function createMask(
  root: TgpuRoot,
  settings: TgpuBuffer<typeof lassoEdgeLayout.entries.settings.uniform> & UniformFlag,
  width: number,
  height: number
) {
  const texture = root.createTexture({ size: [width, height], format: 'r8unorm' }).$usage('sampled', 'render');
  const stencil = root.device.createTexture({
    size: [width, height],
    format: 'stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  });
  return {
    width,
    height,
    texture,
    render: root.unwrap(texture).createView(),
    stencilView: stencil.createView(),
    group: root.createBindGroup(lassoEdgeLayout, { mask: texture, settings }),
    destroy() {
      texture.destroy();
      stencil.destroy();
    }
  };
}

/** A fan expanded to triangle-list vertex indices, using the same parity rule as pixel selection. */
export const lassoPointsLayout = tgpu.bindGroupLayout({ points: { storage: d.arrayOf(d.vec2f), access: 'readonly' } });
export const lassoVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex },
  out: { position: d.builtin.position }
})((input) => {
  'use gpu';
  const corner = input.index % 3;
  let point = d.u32(0);
  if (corner !== 0) point = d.u32(input.index / 3) + corner;
  return { position: d.vec4f(lassoPointsLayout.$.points[point]!, 0, 1) };
});
/** Fills the parity-tested portion of the mask with one. */
export const lassoFill = tgpu.fragmentFn({ out: d.vec4f })(() => {
  'use gpu';
  return d.vec4f(1);
});
/** Time, backing dimensions and backing pixels per CSS pixel. */
export const lassoEdgeLayout = tgpu.bindGroupLayout({
  mask: { texture: d.texture2d(d.f32) },
  settings: { uniform: d.vec4f }
});
/** The example's 3×3 edge kernel and moving diagonal stripes, adapted to WebGPU's top-left origin. */
export const lassoEdge = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const position = d.vec2i(input.position.xy);
  const limit = d.vec2i(std.sub(lassoEdgeLayout.$.settings.yz, d.vec2f(1)));
  const step = d.i32(std.max(1, std.round(lassoEdgeLayout.$.settings.w)));
  const center = std.textureLoad(lassoEdgeLayout.$.mask, position, 0).r;
  let sum = d.f32(center * 9);
  for (let y = -1; y <= 1; y++)
    for (let x = -1; x <= 1; x++) {
      const sample = std.clamp(std.add(position, d.vec2i(x * step, y * step)), d.vec2i(0), limit);
      sum -= std.textureLoad(lassoEdgeLayout.$.mask, sample, 0).r;
    }
  const alpha = std.clamp(sum, 0, 1);
  const diagonal =
    (input.position.x + input.position.y) / lassoEdgeLayout.$.settings.w - lassoEdgeLayout.$.settings.x * 20;
  const color = std.select(d.f32(0), d.f32(1), (d.i32(std.floor(diagonal)) & 16) !== 0);
  return d.vec4f(d.vec3f(color * alpha), alpha);
});
