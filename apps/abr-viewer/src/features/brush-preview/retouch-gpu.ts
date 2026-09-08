import {
  decodePremultiplied,
  encodePremultiplied,
  fingerPaintCompositeInSpace,
  mixerComposite,
  mixerPaint,
  mixerPickup,
  mixerReservoir,
  mixPremultiplied,
  retouchColor,
  retouchCompositeInSpace,
  sampleMixing
} from '@app-game/abr-brush/effects';
import { common, d, std, tgpu, type TgpuBindGroup, type TgpuRoot } from 'typegpu';
import { mixerSteps } from './mixer';
import { retouchBounds, retouchFixture } from './retouch-image';
import { compositeLayout, previewCoverage } from './shaders';
import { smudgeSourceBounds, smudgeStep } from './smudge';
import type { PreviewInput, PreviewStroke } from './stroke';
import { previewColor } from './stroke';

/** Bounded GPU scratch for sequential retouching. Each stamp reads an unchanged one-pixel halo. */
export function createRetouchPreview(root: TgpuRoot, format: GPUTextureFormat) {
  const colorMixing = root.createBuffer(d.u32).$usage('uniform');
  const settings = root.createBuffer(d.vec4f).$usage('uniform');
  const steps = root.createBuffer(d.arrayOf(d.vec4f, 65536)).$usage('storage');
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const capture = root.createRenderPipeline({
    vertex: stepVertex,
    fragment: captureFragment,
    targets: { format: 'rgba8unorm' }
  });
  const updateWells = root.createRenderPipeline({
    vertex: stepVertex,
    fragment: mixerUpdateFragment,
    targets: { reservoir: { format: 'rgba16float' }, pickup: { format: 'rgba16float' } }
  });
  const composeWells = root.createRenderPipeline({
    vertex: stepVertex,
    fragment: mixerComposeFragment,
    targets: { format: 'rgba16float' }
  });
  const filter = root.createRenderPipeline({
    vertex: stepVertex,
    fragment: filterFragment,
    targets: { format: 'rgba8unorm' }
  });
  const present = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: presentFragment,
    targets: { format }
  });
  let target: ReturnType<typeof createTarget> | undefined;
  return {
    /** `mask` records one stamp into the ordinary coverage attachments before its filtered pixels are applied. */
    render(
      input: PreviewInput,
      stroke: PreviewStroke,
      coverage: TgpuBindGroup<typeof compositeLayout.entries>,
      mask: (encoder: GPUCommandEncoder, index: number) => void,
      output: GPUTextureView
    ) {
      colorMixing.write(input.colorMixing === 'linear' && input.values.tool.type !== 'MixB' ? 1 : 0);
      const mixer = input.values.tool.type === 'MixB';
      if (
        !target ||
        target.mixer !== mixer ||
        target.width !== input.width ||
        target.height !== input.height ||
        target.dpr !== input.dpr
      ) {
        target?.destroy();
        target = createTarget(input.width, input.height, input.dpr, mixer);
      }
      const smudge = input.values.tool.type === 'SmTl';
      const mixing = mixer ? mixerSteps(input, stroke) : undefined;
      const placements = mixing
        ? mixing
        : smudge
          ? Array.from({ length: stroke.count }, (_, i) => smudgeStep(stroke, i))
          : [];
      if (smudge || mixer) {
        const data = new Float32Array(stroke.count * 16);
        for (const [i, step] of placements.entries()) {
          data.set([step.x, step.y, step.radius, step.size, step.sourceX, step.sourceY, 0, 0], i * 16);
          const controls = mixing?.[i];
          if (controls)
            data.set(
              [controls.wet, controls.mix, controls.exchange, controls.flow, controls.available, 0, 0, 0],
              i * 16 + 8
            );
        }
        if (data.length) steps.write(data.buffer);
      }
      settings.write([
        mixer ? 1 : input.values.tool.strength / 100,
        mixer ? 3 : smudge ? 2 : Number(input.values.tool.type === 'ShTl'),
        Number(smudge ? input.values.tool.fingerPainting : input.values.tool.protectDetail),
        Number(
          mixer
            ? input.values.tool.sampleAllLayers
            : smudge
              ? input.values.tool.smudgeAllLayers
              : input.values.tool.sharpenAllLayers
        )
      ]);
      const encoder = root.device.createCommandEncoder();
      encoder.copyTextureToTexture({ texture: root.unwrap(target.seed) }, { texture: root.unwrap(target.layer) }, [
        input.width,
        input.height
      ]);
      let front = 0;
      if (target.wells) {
        const color = previewColor(input.color);
        const init = encoder.beginRenderPass({
          colorAttachments: [
            { view: target.wells.reservoirViews[0]!, loadOp: 'clear', storeOp: 'store', clearValue: [...color, 1] },
            { view: target.wells.pickupViews[0]!, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }
          ]
        });
        init.end();
      }
      for (let index = 0; index < stroke.count; index++) {
        const bounds = retouchBounds(input, stroke, index);
        if (!mixer && (!bounds || input.values.tool.strength === 0)) continue;
        if (smudge && index === 0 && !input.values.tool.fingerPainting) continue;
        if (bounds) {
          const x = Math.max(0, bounds.x - 1),
            y = Math.max(0, bounds.y - 1);
          const width = Math.min(input.width, bounds.x + bounds.width + 1) - x;
          const height = Math.min(input.height, bounds.y + bounds.height + 1) - y;
          encoder.copyTextureToTexture(
            { texture: root.unwrap(target.layer), origin: [x, y] },
            { texture: root.unwrap(target.snapshot), origin: [x, y] },
            [width, height]
          );
        }
        const step = placements[index];
        const source = step && smudgeSourceBounds(input, step);
        if (source)
          encoder.copyTextureToTexture(
            { texture: root.unwrap(target.layer), origin: [source.x, source.y] },
            { texture: root.unwrap(target.snapshot), origin: [source.x, source.y] },
            [source.width, source.height]
          );
        if (step && (mixer || index > 0)) {
          const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: target.patchView, loadOp: 'clear', storeOp: 'store' }]
          });
          pass.setViewport(0, 0, step.size, step.size, 0, 1);
          pass.setScissorRect(0, 0, step.size, step.size);
          capture.with(pass).with(target.captureGroup).draw(3, 1, 0, index);
          pass.end();
        }
        if (target.wells) {
          const back = 1 - front;
          const update = encoder.beginRenderPass({
            colorAttachments: [
              { view: target.wells.reservoirViews[back]!, loadOp: 'clear', storeOp: 'store' },
              { view: target.wells.pickupViews[back]!, loadOp: 'clear', storeOp: 'store' }
            ]
          });
          updateWells.with(update).with(target.wells.groups[front]!).draw(3, 1, 0, index);
          update.end();
          front = back;
          const compose = encoder.beginRenderPass({
            colorAttachments: [{ view: target.wells.outputView, loadOp: 'clear', storeOp: 'store' }]
          });
          composeWells.with(compose).with(target.wells.groups[front]!).draw(3, 1, 0, index);
          compose.end();
        }
        if (!bounds) continue;
        mask(encoder, index);
        const pass = encoder.beginRenderPass({
          colorAttachments: [{ view: target.view, loadOp: 'load', storeOp: 'store' }]
        });
        pass.setScissorRect(bounds.x, bounds.y, bounds.width, bounds.height);
        filter.with(pass).with(coverage).with(target.filterGroup).draw(3, 1, 0, index);
        pass.end();
      }
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: output, loadOp: 'clear', storeOp: 'store' }] });
      present.with(pass).with(target.presentGroup).draw(3);
      pass.end();
      root.device.queue.submit([encoder.finish()]);
    }
  };

  function createTarget(width: number, height: number, dpr: number, mixer: boolean) {
    const create = () =>
      root.createTexture({ size: [width, height], format: 'rgba8unorm' }).$usage('sampled', 'render');
    const layer = create(),
      snapshot = create(),
      below = create(),
      seed = create();
    const patch = root.createTexture({ size: [1024, 1024], format: 'rgba8unorm' }).$usage('sampled', 'render');
    const wellTexture = () =>
      root.createTexture({ size: [256, 256], format: 'rgba16float' }).$usage('sampled', 'render');
    const wellTextures = mixer ? Array.from({ length: 5 }, wellTexture) : undefined;
    const commonGroup = {
      image: snapshot,
      below,
      settings,
      colorMixing,
      patch,
      sampler,
      steps,
      reservoir: seed,
      pickup: seed,
      dabPaint: wellTextures?.[4] ?? seed
    };
    const wells = wellTextures && {
      reservoirViews: [root.unwrap(wellTextures[0]!).createView(), root.unwrap(wellTextures[1]!).createView()],
      pickupViews: [root.unwrap(wellTextures[2]!).createView(), root.unwrap(wellTextures[3]!).createView()],
      outputView: root.unwrap(wellTextures[4]!).createView(),
      groups: [0, 1].map((i) =>
        root.createBindGroup(layout, {
          ...commonGroup,
          reservoir: wellTextures[i]!,
          pickup: wellTextures[i + 2]!,
          dabPaint: seed
        })
      )
    };
    const fixture = retouchFixture(width, height, dpr);
    for (const [texture, pixels] of [
      [seed, fixture.layer],
      [below, fixture.below]
    ] as const) {
      root.device.queue.writeTexture({ texture: root.unwrap(texture) }, pixels, { bytesPerRow: width * 4 }, [
        width,
        height
      ]);
    }
    return {
      mixer,
      wells,
      width,
      height,
      dpr,
      seed,
      layer,
      snapshot,
      below,
      patchView: root.unwrap(patch).createView(),
      view: root.unwrap(layer).createView(),
      filterGroup: root.createBindGroup(layout, commonGroup),
      captureGroup: root.createBindGroup(layout, { ...commonGroup, patch: seed }),
      presentGroup: root.createBindGroup(layout, { ...commonGroup, image: layer }),
      destroy() {
        layer.destroy();
        seed.destroy();
        snapshot.destroy();
        below.destroy();
        patch.destroy();
        wellTextures?.forEach((texture) => texture.destroy());
      }
    };
  }
}

const layout = tgpu.bindGroupLayout({
  reservoir: { texture: d.texture2d() },
  pickup: { texture: d.texture2d() },
  dabPaint: { texture: d.texture2d() },
  image: { texture: d.texture2d() },
  below: { texture: d.texture2d() },
  patch: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
  steps: { storage: d.arrayOf(d.vec4f) },
  settings: { uniform: d.vec4f },
  colorMixing: { uniform: d.u32 }
});

const stepVertex = tgpu.vertexFn({
  in: { vertex: d.builtin.vertexIndex, step: d.builtin.instanceIndex },
  out: { position: d.builtin.position, step: d.interpolate('flat', d.u32) }
})((input) => {
  'use gpu';
  const points = d.arrayOf(d.vec2f, 3)([d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)]);
  return { position: d.vec4f(points[input.vertex]!, 0, 1), step: input.step };
});

/** Bilinear capture into the same RGBA8 allocation buckets as Paint. Out-of-image pixels are transparent. */
function smudgePixel(point: d.v2i, below: boolean) {
  'use gpu';
  const size = d.vec2i(std.textureDimensions(layout.$.image));
  if (point.x < 0 || point.y < 0 || point.x >= size.x || point.y >= size.y) return d.vec4f(0);
  if (below) return std.textureLoad(layout.$.below, point, 0);
  return std.textureLoad(layout.$.image, point, 0);
}

function smudgeSample(position: d.v2f, below: boolean) {
  'use gpu';
  const cell = std.floor(std.sub(position, d.vec2f(0.5)));
  const fraction = std.sub(std.sub(position, d.vec2f(0.5)), cell);
  const linear = layout.$.colorMixing > 0;
  const pixel = mixPremultiplied(
    mixPremultiplied(
      smudgePixel(d.vec2i(cell), below),
      smudgePixel(std.add(d.vec2i(cell), d.vec2i(1, 0)), below),
      fraction.x,
      linear
    ),
    mixPremultiplied(
      smudgePixel(std.add(d.vec2i(cell), d.vec2i(0, 1)), below),
      smudgePixel(std.add(d.vec2i(cell), d.vec2i(1, 1)), below),
      fraction.x,
      linear
    ),
    fraction.y,
    linear
  );
  return std.div(std.round(std.mul(pixel, 255)), 255);
}

const captureFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, step: d.interpolate('flat', d.u32) },
  out: d.vec4f
})((input) => {
  'use gpu';
  const step = layout.$.steps[input.step * 4]!;
  const previous = layout.$.steps[input.step * 4 + 1]!;
  const point = std.add(std.sub(previous.xy, d.vec2f(step.z)), std.mul(std.div(input.position.xy, step.w), step.z * 2));
  const pixel = smudgeSample(point, false);
  if (layout.$.settings.w > 0) return std.add(pixel, std.mul(smudgeSample(point, true), 1 - pixel.a));
  return pixel;
});

/** Matches Paint's RGBA8 capture of either the active layer or the visible composite. */
function readSource(xy: d.v2i) {
  'use gpu';
  const limit = std.sub(d.vec2i(std.textureDimensions(layout.$.image)), d.vec2i(1));
  const point = std.clamp(xy, d.vec2i(0), limit);
  let pixel = std.textureLoad(layout.$.image, point, 0);
  if (layout.$.settings.w > 0) {
    pixel = std.add(pixel, std.mul(std.textureLoad(layout.$.below, point, 0), 1 - pixel.a));
    pixel = std.div(std.round(std.mul(pixel, 255)), 255);
  }
  return pixel;
}

const filterFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, step: d.interpolate('flat', d.u32) },
  out: d.vec4f
})((input) => {
  'use gpu';
  const xy = d.vec2i(input.position.xy);
  if (layout.$.settings.y === 3) {
    const step = layout.$.steps[input.step * 4]!;
    const uv = std.div(std.add(std.sub(input.position.xy, step.xy), d.vec2f(step.z)), step.z * 2);
    return mixerComposite(
      std.textureLoad(layout.$.image, xy, 0),
      std.textureSampleLevel(layout.$.dabPaint, layout.$.sampler, uv, 0),
      previewCoverage(input.position)
    );
  }
  if (layout.$.settings.y === 2) {
    const base = std.textureLoad(layout.$.image, xy, 0);
    const amount = previewCoverage(input.position) * layout.$.settings.x;
    if (input.step === 0) {
      const paint = std.textureLoad(compositeLayout.$.paint, xy, 0);
      return fingerPaintCompositeInSpace(
        base,
        std.div(paint.rgb, std.max(0.00001, paint.a)),
        amount,
        compositeLayout.$.params.extra.w,
        layout.$.colorMixing > 0
      );
    }
    const step = layout.$.steps[input.step * 4]!;
    const patchPixel = std.mul(
      std.div(std.add(std.sub(input.position.xy, step.xy), d.vec2f(step.z)), step.z * 2),
      step.w
    );
    const uv = std.div(std.clamp(patchPixel, d.vec2f(0.5), d.vec2f(step.w - 0.5)), 1024);
    const picked = sampleMixing(layout.$.patch, layout.$.sampler, uv, layout.$.colorMixing > 0);
    return retouchCompositeInSpace(base, picked, amount, compositeLayout.$.params.extra.w, layout.$.colorMixing > 0);
  }
  let blurred = d.vec4f(0);
  let low = d.vec3f(1);
  let high = d.vec3f(0);
  for (const y of tgpu.unroll([-1, 0, 1]))
    for (const x of tgpu.unroll([-1, 0, 1])) {
      const pixel = filterPixel(std.add(xy, d.vec2i(x, y)));
      blurred = std.add(blurred, std.mul(pixel, (std.select(1, 2, x === 0) * std.select(1, 2, y === 0)) / 16));
      const rgb = std.div(pixel.rgb, std.max(0.00001, pixel.a));
      low = std.min(low, rgb);
      high = std.max(high, rgb);
    }
  const filtered = retouchColor(filterPixel(xy), blurred, low, high, layout.$.settings.y > 0, layout.$.settings.z > 0);
  let encoded = d.vec4f(filtered);
  if (layout.$.colorMixing > 0) encoded = encodePremultiplied(filtered);
  const picked = std.div(std.round(std.mul(encoded, 255)), 255);
  return retouchCompositeInSpace(
    std.textureLoad(layout.$.image, xy, 0),
    picked,
    previewCoverage(input.position) * layout.$.settings.x,
    compositeLayout.$.params.extra.w,
    layout.$.colorMixing > 0
  );
});

const presentFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const xy = d.vec2i(input.position.xy);
  const pixel = std.textureLoad(layout.$.image, xy, 0);
  return std.add(pixel, std.mul(std.textureLoad(layout.$.below, xy, 0), 1 - pixel.a));
});

const mixerUpdateFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, step: d.interpolate('flat', d.u32) },
  out: { reservoir: d.vec4f, pickup: d.vec4f }
})((input) => {
  'use gpu';
  const uv = std.div(input.position.xy, 256);
  const step = layout.$.steps[input.step * 4]!;
  const controls = layout.$.steps[input.step * 4 + 2]!;
  const patchUv = std.div(std.clamp(std.mul(uv, step.w), d.vec2f(0.5), d.vec2f(step.w - 0.5)), 1024);
  const canvas = std.textureSampleLevel(layout.$.patch, layout.$.sampler, patchUv, 0);
  const reservoir = std.textureSampleLevel(layout.$.reservoir, layout.$.sampler, uv, 0);
  const oldPickup = std.textureSampleLevel(layout.$.pickup, layout.$.sampler, uv, 0);
  const pickup = mixerPickup(oldPickup, canvas, controls);
  return { reservoir: mixerReservoir(reservoir, pickup, controls), pickup };
});
const mixerComposeFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, step: d.interpolate('flat', d.u32) },
  out: d.vec4f
})((input) => {
  'use gpu';
  const uv = std.div(input.position.xy, 256);
  const controls = layout.$.steps[input.step * 4 + 2]!;
  return mixerPaint(
    std.textureSampleLevel(layout.$.reservoir, layout.$.sampler, uv, 0),
    std.textureSampleLevel(layout.$.pickup, layout.$.sampler, uv, 0),
    controls.x,
    controls.y,
    layout.$.steps[input.step * 4 + 3]!.x
  );
});

function filterPixel(xy: d.v2i) {
  'use gpu';
  const pixel = readSource(xy);
  if (layout.$.colorMixing > 0) return decodePremultiplied(pixel);
  return pixel;
}
