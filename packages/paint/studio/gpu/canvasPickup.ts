import { planCanvasPickup, sampleMixing } from '@app-game/abr-brush/effects';
import { common, d, std, tgpu, type SampledFlag, type TgpuRoot, type TgpuTexture } from 'typegpu';
import type { Layer } from '../document';
import { compositeFragment, compositeLayout } from './shaders';
export { planCanvasPickup } from '@app-game/abr-brush/effects';

/** World-space rectangle. Pixel centers, rather than tile origins, determine sampling. */
export type PickupRegion = { x: number; y: number; width: number; height: number };

/** Captures committed/current-stroke pixels into a reusable GPU patch for tools that sample the canvas.
 * The host supplies current level-zero tiles and submits their pending writes before resolving getTile.
 * Each returned texture is borrowed until the next capture or destroy; submit consumers before recapturing.
 * Capture calls must be serialized. No GPU-to-CPU readback is performed by this module.
 */
export function createCanvasPickup(
  root: TgpuRoot,
  getTile: (layer: Layer, key: string, minify: boolean) => Promise<(TgpuTexture & SampledFlag) | undefined>
) {
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' });
  const mixing = root.createBuffer(d.u32).$usage('uniform');
  const tileParams = root.createBuffer(d.vec4f).$usage('uniform');
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
      options: { allLayers?: boolean; maxDimension?: number; exact?: boolean; linear?: boolean } = {}
    ) {
      if (disposed) throw new Error('Canvas pickup has been disposed.');
      if (busy) throw new Error('Canvas pickup calls must be serialized.');
      const plan = planCanvasPickup(region, options.maxDimension ?? 1024, options.exact);
      busy = true;
      mixing.write(options.linear ? 1 : 0);
      try {
        if (!scratch || scratch.width !== plan.width || scratch.height !== plan.height) {
          scratch?.destroy();
          scratch = createScratch(root, plan.width, plan.height);
        }
        const patch = scratch;
        let result = patch.a,
          output = patch.b;
        // Current-layer pickup is already the final premultiplied image. It needs
        // neither a transparent base nor a full-screen identity composite per dab.
        const direct = layers.length === 1 && !options.allLayers;
        if (!direct) clear(root, result);
        for (const layer of layers) {
          if (options.allLayers && (!layer.visible || layer.opacity <= 0)) continue;
          const target = direct ? result : patch.layer;
          let populated = false;
          for (let y = plan.minY; y <= plan.maxY; y++)
            for (let x = plan.minX; x <= plan.maxX; x++) {
              // Smooth sampling explicitly reads level zero before decoding color.
              // Its unused mip chain must not be rebuilt for every changed source tile.
              const minify = !options.linear && (plan.width < region.width || plan.height < region.height);
              const tile = await getTile(layer, `${x},${y}`, minify);
              if (disposed) throw new Error('Canvas pickup was disposed during capture.');
              if (!tile) continue;
              // Subtract the world origin on the CPU so large coordinates retain local pixel precision.
              tileParams.write(
                d.vec4f(
                  (x * 256 - region.x) / region.width,
                  (y * 256 - region.y) / region.height,
                  256 / region.width,
                  256 / region.height
                )
              );
              const encoder = root.device.createCommandEncoder();
              const pass = encoder.beginRenderPass({
                colorAttachments: [
                  { view: root.unwrap(target).createView(), loadOp: populated ? 'load' : 'clear', storeOp: 'store' }
                ]
              });
              tilePipeline
                .with(pass)
                .with(root.createBindGroup(tileLayout, { image: tile, sampler, placement: tileParams, mixing }))
                .draw(6);
              pass.end();
              // Submit before the next lookup may recycle this tile's cache slot or rewrite the shared uniform.
              root.device.queue.submit([encoder.finish()]);
              populated = true;
            }
          // An empty capture must not expose pixels left by the preceding dab.
          if (!populated) clear(root, target);
          if (direct) continue;
          layerParams.write(
            d.vec4f(
              options.allLayers ? layer.opacity : 1,
              options.allLayers ? ['normal', 'multiply', 'screen', 'overlay', 'linear'].indexOf(layer.blend) : 0,
              0,
              0
            )
          );
          const encoder = root.device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: root.unwrap(output).createView(), loadOp: 'clear', storeOp: 'store' }]
          });
          composite
            .with(pass)
            .with(root.createBindGroup(compositeLayout, { base: result, layer: patch.layer, settings: layerParams }))
            .draw(3);
          pass.end();
          root.device.queue.submit([encoder.finish()]);
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
      tileParams.destroy();
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
