import { planCanvasPickup, sampleMixing } from '@app-game/abr-brush/effects';
import { common, d, std, tgpu, type SampledFlag, type TgpuRoot, type TgpuTexture } from 'typegpu';
import type { Layer } from '../document';
import { commandBatch } from './commandBatch';
import { commandSlots } from './commandSlots';
import { compositeFragment, compositeLayout } from './shaders';
export { planCanvasPickup } from '@app-game/abr-brush/effects';

/** World-space rectangle. Pixel centers, rather than tile origins, determine sampling. */
export type PickupRegion = { x: number; y: number; width: number; height: number };

/** Captures committed/current-stroke pixels into a reusable GPU patch for tools that sample the canvas.
 * The host supplies current level-zero tiles; pending writes must precede reads in the borrowed batch or be submitted.
 * getTile receives the highest mip needed by capture and must call flush(texture) before destroying/recycling a source; flush() submits unconditionally.
 * Each returned texture is borrowed; submit consumers or encode them in the same batch before recapturing.
 * Capture calls must be serialized. No GPU-to-CPU readback is performed by this module.
 */
export function createCanvasPickup(
  root: TgpuRoot,
  getTile: (
    layer: Layer,
    key: string,
    minify: boolean,
    flush: (source?: TgpuTexture) => void,
    requiredMip: number
  ) => Promise<(TgpuTexture & SampledFlag) | undefined>
) {
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' });
  const mixing = root.createBuffer(d.u32).$usage('uniform');
  // One placement per encoded draw. Reusing a shared uniform would move earlier
  // tiles when the queue receives the final write before a batched submission.
  const slots = Array.from({ length: 32 }, () => ({
    placement: root.createBuffer(d.vec4f).$usage('uniform'),
    groups: new WeakMap<TgpuTexture, ReturnType<typeof root.createBindGroup<typeof tileLayout.entries>>>()
  }));
  const reserve = commandSlots(slots.length);
  let uploadedMixing: boolean | undefined;
  const layerParams = root.createBuffer(d.vec4f).$usage('uniform');
  const tilePipeline = root.createRenderPipeline({
    vertex: tileVertex,
    fragment: tileFragment,
    targets: { format: 'rgba8unorm' }
  });
  const composite = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: compositeFragment,
    targets: { format: 'rgba8unorm' }
  });
  let scratch: ReturnType<typeof createScratch> | undefined;
  let disposed = false,
    busy = false;
  return {
    /** Single-layer pickup ignores layer opacity/visibility by default. allLayers applies visible layers' blend/opacity.
     * linear decodes premultiplied sRGB before bilinear sampling, for Smudge/Blur working-space support.
     * Large regions are filtered into a bounded patch; maxDimension defaults to 1024 and cannot exceed 2048.
     */
    async capture(
      region: PickupRegion,
      layers: readonly Layer[],
      options: {
        allLayers?: boolean;
        maxDimension?: number;
        exact?: boolean;
        linear?: boolean;
        /** Borrow a batch for single-layer capture; consumers must use this batch or submit it before texture reuse. */
        commands?: ReturnType<typeof commandBatch>;
      } = {}
    ) {
      if (disposed) throw new Error('Canvas pickup has been disposed.');
      if (busy) throw new Error('Canvas pickup calls must be serialized.');
      const plan = planCanvasPickup(region, options.maxDimension ?? 1024, options.exact);
      // Trilinear filtering needs at most the next level above its largest derivative.
      const ratio = Math.max(region.width / plan.width, region.height / plan.height);
      const minify = !options.linear && ratio > 1;
      const requiredMip = minify ? Math.min(8, Math.ceil(Math.log2(ratio)) + 1) : 0;
      busy = true;
      if (uploadedMixing !== !!options.linear) {
        options.commands?.flush();
        mixing.write(options.linear ? 1 : 0);
        uploadedMixing = !!options.linear;
      }
      try {
        if (!scratch || scratch.width !== plan.width || scratch.height !== plan.height) {
          options.commands?.flush();
          scratch?.destroy();
          scratch = createScratch(root, plan.width, plan.height);
        }
        const patch = scratch;
        let result = patch.a,
          output = patch.b;
        // Current-layer pickup is already the final premultiplied image. It needs
        // neither a transparent base nor a full-screen identity composite per dab.
        const direct = layers.length === 1 && !options.allLayers;
        const commands = direct ? (options.commands ?? commandBatch(root.device)) : commandBatch(root.device);
        if (!direct) {
          // Layer compositing submits independently and must see earlier encoded dabs.
          options.commands?.flush();
          clear(root, result);
        }
        for (const layer of layers) {
          if (options.allLayers && (!layer.visible || layer.opacity <= 0)) continue;
          const target = direct ? result : patch.layer;
          const targetView = root.unwrap(target).createView();
          let populated = false;
          let pass: GPURenderPassEncoder | undefined;
          const pendingSources = new Set<TgpuTexture>();
          const flush = (source?: TgpuTexture) => {
            if (source && !options.commands && !pendingSources.has(source)) return;
            pass?.end();
            pass = undefined;
            pendingSources.clear();
            commands.flush();
          };
          try {
            for (let y = plan.minY; y <= plan.maxY; y++)
              for (let x = plan.minX; x <= plan.maxX; x++) {
                // Smooth sampling explicitly reads level zero before decoding color.
                // Its unused mip chain must not be rebuilt for every changed source tile.
                const tile = await getTile(layer, `${x},${y}`, minify, flush, requiredMip);
                if (disposed) throw new Error('Canvas pickup was disposed during capture.');
                if (!tile) continue;
                // Subtract the world origin on the CPU so large coordinates retain local pixel precision.
                const slot = slots[reserve(commands, flush)]!;
                slot.placement.write(
                  d.vec4f(
                    (x * 256 - region.x) / region.width,
                    (y * 256 - region.y) / region.height,
                    256 / region.width,
                    256 / region.height
                  )
                );
                pass ??= commands.encoder().beginRenderPass({
                  colorAttachments: [{ view: targetView, loadOp: populated ? 'load' : 'clear', storeOp: 'store' }]
                });
                let group = slot.groups.get(tile);
                if (!group) {
                  group = root.createBindGroup(tileLayout, { image: tile, sampler, placement: slot.placement, mixing });
                  slot.groups.set(tile, group);
                }
                tilePipeline.with(pass).with(group).draw(6);
                pendingSources.add(tile);
                populated = true;
              }
            if (direct && options.commands) {
              pass?.end();
              pass = undefined;
            } else flush();
          } catch (error) {
            // Close the pass on failure. Owned commands are discarded; a borrowed
            // batch may submit scratch-only writes during owner cleanup. No patch escapes.
            pass?.end();
            throw error;
          }
          // An empty capture must not expose pixels left by the preceding dab.
          if (!populated) {
            commands
              .encoder()
              .beginRenderPass({
                colorAttachments: [{ view: targetView, loadOp: 'clear', storeOp: 'store' }]
              })
              .end();
            if (!direct || !options.commands) commands.flush();
          }
          if (direct) continue;
          layerParams.write(
            d.vec4f(
              options.allLayers ? layer.opacity : 1,
              options.allLayers ? ['normal', 'multiply', 'screen', 'overlay', 'linear'].indexOf(layer.blend) : 0,
              0,
              0
            )
          );
          const compositeEncoder = root.device.createCommandEncoder();
          const compositePass = compositeEncoder.beginRenderPass({
            colorAttachments: [{ view: root.unwrap(output).createView(), loadOp: 'clear', storeOp: 'store' }]
          });
          composite
            .with(compositePass)
            .with(root.createBindGroup(compositeLayout, { base: result, layer: patch.layer, settings: layerParams }))
            .draw(3);
          compositePass.end();
          root.device.queue.submit([compositeEncoder.finish()]);
          [result, output] = [output, result];
        }
        return { texture: result, region: { ...region }, width: plan.width, height: plan.height };
      } finally {
        busy = false;
      }
    },
    /** Persistent memory stays bounded independently of canvas area and document tile count. */
    bytes: () => (scratch ? scratch.width * scratch.height * 4 * 3 : 0),
    destroy() {
      if (disposed) return;
      disposed = true;
      scratch?.destroy();
      scratch = undefined;
      mixing.destroy();
      for (const slot of slots) slot.placement.destroy();
      layerParams.destroy();
    }
  };
}

function createScratch(root: TgpuRoot, width: number, height: number) {
  const texture = () => root.createTexture({ size: [width, height], format: 'rgba8unorm' }).$usage('sampled', 'render');
  const a = texture(),
    b = texture(),
    layer = texture();
  return {
    width,
    height,
    a,
    b,
    layer,
    destroy() {
      a.destroy();
      b.destroy();
      layer.destroy();
    }
  };
}
function clear(root: TgpuRoot, texture: ReturnType<typeof createScratch>['a']) {
  const encoder = root.device.createCommandEncoder();
  encoder
    .beginRenderPass({
      colorAttachments: [{ view: root.unwrap(texture).createView(), loadOp: 'clear', storeOp: 'store' }]
    })
    .end();
  root.device.queue.submit([encoder.finish()]);
}
const tileLayout = tgpu.bindGroupLayout({
  image: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
  placement: { uniform: d.vec4f },
  mixing: { uniform: d.u32 }
});
const tileVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex },
  out: { position: d.builtin.position, uv: d.vec2f }
})((input) => {
  'use gpu';
  const corners = d.arrayOf(
    d.vec2f,
    6
  )([d.vec2f(0, 0), d.vec2f(1, 0), d.vec2f(0, 1), d.vec2f(0, 1), d.vec2f(1, 0), d.vec2f(1, 1)]);
  const uv = corners[input.index]!;
  const position = std.add(tileLayout.$.placement.xy, std.mul(uv, tileLayout.$.placement.zw));
  return { position: d.vec4f(position.x * 2 - 1, 1 - position.y * 2, 0, 1), uv };
});
const tileFragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
  'use gpu';
  if (tileLayout.$.mixing > 0) return sampleMixing(tileLayout.$.image, tileLayout.$.sampler, input.uv, true);
  return std.textureSample(tileLayout.$.image, tileLayout.$.sampler, input.uv);
});
