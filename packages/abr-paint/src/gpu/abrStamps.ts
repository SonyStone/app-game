import type { ColorMixing } from '@app-game/abr-brush/effects';
import { blendModeId } from '@app-game/abr-brush/effects';
import type { BrushFormValues } from '@app-game/abr-brush/form';
import { maskRasterRects, paintbrushMaskMode, type MaskRasterRect } from '@app-game/abr-brush/maskRaster';
import { createMaskRasterGpu } from '@app-game/abr-brush/maskRasterGpu';
import { paintModes } from '@app-game/abr-brush/paintBlend';
import type { createPatternRasterGpu } from '@app-game/abr-brush/patternRasterGpu';
import { usesPencilCoverage } from '@app-game/abr-brush/pencil';
import type { createTipRasterGpu } from '@app-game/abr-brush/tipRasterGpu';
import { d, type TgpuRoot, type TgpuTexture } from 'typegpu';
import type { Dab } from '../input';
import type { BrushResource } from '../resources';
import {
  abrStampLayout,
  compositeLayout,
  createAbrPipelines,
  extraLane,
  flagsLane,
  maskAccumulation,
  originLane,
  Params,
  paramsOffsets,
  PickupParams,
  pickupFlagsLane,
  pickupMode,
  pickupOffsets,
  sampledMaskByte,
  Stamp,
  stampLayout,
  textureLane,
  toneLane
} from './abrShaders';
import { createAbrPresetSources } from './abrPresetSources';
import { createAbrTextureCache, type CoverageTexture } from './abrTextureCache';
import { adaptivePaintBatchSize } from './brushBatchSize';
import type { createCanvasPickup } from './canvasPickup';
import type { commandBatch } from './commandBatch';
import { abrCoveragePlan, createAbrCoverage } from './coverage';
import type { createMixerWells } from './mixerWells';

export { abrStampLayout } from './abrShaders';

/** Immutable preset resources pinned by the brush session. */
export type AbrRasterSettings<Layer = unknown> = {
  /** Selected immutable document state; restoration interpolates premultiplied pixels by accumulated coverage. */
  historySource?: Layer;
  values: BrushFormValues;
  tip: BrushResource;
  pattern?: BrushResource;
  dual?: BrushResource;
  /** Scales the secondary tip relative to the edited primary diameter. */
  size: number;
  mixing: ColorMixing;
  /** Global factor applied after mask composition. Defaults to 1 for stamps carrying tool opacity. */
  compositeOpacity?: number;
  /** Opt-in approximate GPU tip filtering and batched blending. Zero enables approximation at full source resolution; positive bias selects coarser source mips unless nonlinear texture effects require detail.
   * Pixels are final; no detailed replay. Only ordinary sampled Paintbrush strokes may supply this.
   */
  tipLodBias?: number;
  blendMode?: string;
  /** Canvas-dependent tools receive the current document layers without owning them. */
  smudge?: {
    strength: number;
    fingerPainting: boolean;
    allLayers: boolean;
    layers: readonly Layer[];
    /** Pickup resolution relative to document pixels; omission preserves the detailed path. */
    pickupScale?: number;
  };
  /** Blur/Sharpen modify captured pixels at document resolution; percentages are normalized. */
  filter?: { sharpen: boolean; protectDetail: boolean; strength: number; allLayers: boolean; layers: readonly Layer[] };
  /** A preset's reservoir persists across gestures; all percentages here are normalized to 0..1. */
  mixer?: {
    /** Optional LOD pickup budget; reservoir ownership and dosing remain unchanged. */
    pickupScale?: number;
    key: string;
    wet: number;
    load: number;
    mix: number;
    autoFill: boolean;
    autoClean: boolean;
    allLayers: boolean;
    layers: readonly Layer[];
  };
};

/** Device-owned ABR rasterizer. Tile scratch is allocated lazily and participates in Paint's eviction.
 * The primary color, flow/opacity ceiling and secondary coverage remain separate until compositing.
 */
export function createAbrStamps(root: TgpuRoot, batchSampledMasks = true) {
  // CPU staging is shared; queue writes copy its bytes immediately. GPU uniforms
  // remain tile-owned so pending draws retain their existing submission lifetime.
  const paramsData = new Float32Array(d.sizeOf(Params) / 4);
  const paramsIntegers = new Uint32Array(paramsData.buffer);
  const pickupData = new Float32Array(d.sizeOf(PickupParams) / 4);
  const directStamps = Array.from({ length: 8 }, () => createDirectStamp(root));
  let nextDirectStamp = 0;
  const pipelines = createAbrPipelines(root);
  let maskRaster: ReturnType<typeof createMaskRasterGpu> | undefined;
  const sources = createAbrPresetSources(root);
  const textures = createAbrTextureCache(root);
  let pendingPlanBytes = 0;
  let pendingPatternBytes = 0;
  let pendingMaskBytes = 0;
  let settings: PreparedSettings | undefined;
  let tip: CoverageTexture | undefined;
  let dual: CoverageTexture | undefined;
  // Fixed-color masks survive tile eviction independently of tile-local uniforms.
  let maskColor = { x: 0, y: 0, z: 0 };
  let bindings = new WeakMap<AbrTile, ReturnType<typeof createBindings>>();
  // Per-draw scratch. Queue writes and mask batches consume these before draw() returns.
  const ordered: Dab[] = [];
  let stampData = new Float32Array(0);
  const recordRects: MaskRasterRect[] = [];
  const recordIndices: number[] = [];

  return {
    /** Selects the preset for the next stroke. Budgets and device limits are validated before any
     * cached source or texture is replaced, so a rejected preset leaves the previous one intact.
     * If a GPU allocation or upload fails afterwards, every cached resource is released and the
     * rasterizer is left unprepared; call prepare again before drawing.
     * Document layers and history are never retained past this call.
     */
    prepare(value: AbrRasterSettings) {
      const required = value.dual ? [value.tip, value.dual] : [value.tip];
      const plan = sources.plan(value, required);
      textures.validate(required, plan.bytes);

      try {
        sources.apply(plan);
        const [primary, secondary] = textures.acquire(required, sources.bytes());
        tip = primary;
        dual = secondary ?? primary;
      } catch (error) {
        reset();
        throw error;
      }

      writeParams(value);
      settings = {
        values: value.values,
        tipLodBias: value.tipLodBias,
        blendMode: value.blendMode,
        pattern: !!value.pattern,
        dual: !!value.dual,
        smudge: !!value.smudge
      };
      maskColor = { x: 0, y: 0, z: 0 };
      bindings = new WeakMap();
    },
    /** Document pixels per persistent mask pixel, fixed for the current stroke. */
    rasterScale: () => paramsData[paramsOffsets.rasterScale]!,
    /** Bounds progress batches by raster cost. Tiny tips amortize GPU setup; large tips present more often. */
    paintBatchSize(dabs: readonly Dab[]) {
      if (settings?.tipLodBias !== undefined) {
        return adaptivePaintBatchSize(dabs, paramsData[paramsOffsets.rasterScale]!);
      }

      if (!batchSampledMasks || !settings || paintbrushMaskMode(settings.values) !== maskAccumulation.fixedColor) {
        return 32;
      }

      let largestCoverage = 1;
      for (const dab of dabs) {
        const bounds = dab.abr?.sampledTip?.bounds;
        if (dab.abr?.secondary || !bounds) {
          return 32;
        }

        const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
        if (width > 16 || height > 16) {
          return 32;
        }

        largestCoverage = Math.max(largestCoverage, Math.ceil(width / 4) * 4 * height);
      }
      return Math.min(sampledMaskBatchLimit, Math.floor(256 * 256 / largestCoverage));
    },
    /** Only persistent masks used by this preset need eviction snapshots. */
    coveragePlan: (transient: boolean) => abrCoveragePlan({
      transient,
      scale: paramsData[paramsOffsets.rasterScale]!,
      mask: !settings || settings.tipLodBias !== undefined || paintbrushMaskMode(settings.values) === maskAccumulation.stamp,
      dual: !!settings?.values.useDualBrush && !!settings.dual
    }),
    /** Creates device scratch without owning the base or mask supplied by the tile cache. */
    createTile: (base: Texture, mask: Texture, capacity: number) => createAbrTile(root, base, mask, capacity),
    /** Prepare before opening a caller-owned render pass for direct drawing. */
    prepareTile,
    /** One primary Smudge stamp can composite directly unless coverage needs neighboring or secondary pixels. */
    canDrawDirect: () =>
      !!settings?.smudge && !settings.values.useWetEdges && !(settings.values.useDualBrush && settings.dual),
    /** Shared-area deposition currently excludes effects whose coordinates or masks are tile-local. */
    canBatchDirect: () => !!settings?.smudge && !settings.values.useWetEdges &&
      !(settings.values.useDualBrush && settings.dual) && !settings.values.useNoise &&
      !(settings.values.useTexture && settings.pattern) && settings.blendMode !== 'Dslv',
    /** Upload one primary dab for all its tiles. Encode its draws before preparing
     * another dab. Slots submit pending readers before their bytes are recycled.
     * The vertex shader reads tile placement from the pickup uniform's spare bytes.
     */
    prepareDirect(dab: Dab) {
      if (!dab.abr || dab.abr.secondary) {
        throw new Error('Direct Smudge requires one primary ABR dab.');
      }

      const slot = directStamps[nextDirectStamp++ % directStamps.length]!;
      if (slot.batch && slot.batch.version === slot.version) {
        slot.batch.flush();
      }

      root.device.queue.writeBuffer(root.unwrap(slot.buffer), 0, dab.abr.data);
      return slot;
    },
    /** All writes are tile-local; uniforms carry world origin for a continuous pattern across seams.
     * A destination bypasses coverage scratch: requires canDrawDirect(), one primary dab,
     * prepareTile() before opening the pass, a refreshed base inside its scissor,
     * and caller-owned pass.end().
     */
    draw(
      tile: AbrTile,
      commands: ReturnType<typeof commandBatch>,
      dabs: readonly Dab[],
      tx: number,
      ty: number,
      destination?: { pass: GPURenderPassEncoder; pickup: AbrPickup; stamps?: ReturnType<typeof createDirectStamp> }
    ) {
      if (!destination) {
        prepareTile(tile, commands, tx, ty);
      }

      // Open the encoder up front: flush() skips afterSubmit releases when no encoder exists.
      commands.encoder();
      const binding = bindingsFor(tile);
      writeTileParams(tile, binding, dabs, tx, ty);

      if (destination?.stamps) {
        pipelines.sharedDirect.with(destination.pass).with(binding.primary)
          .with(pickupBinding(tile, destination.pickup, dabs[0]!.x - tx * 256, dabs[0]!.y - ty * 256))
          .with(abrStampLayout, destination.stamps.buffer).draw(6);
        destination.stamps.batch = commands;
        destination.stamps.version = commands.version;
        return;
      }

      const secondCount = uploadStamps(tile, dabs, tx, ty);
      if (destination) {
        pipelines.direct
          .with(destination.pass)
          .with(binding.primary)
          .with(pickupBinding(tile, destination.pickup))
          .with(abrStampLayout, tile.stamps)
          .draw(6, ordered.length);
        return;
      }

      if (secondCount) {
        drawSecondary(tile, commands, binding, secondCount, tx, ty);
      }

      if (ordered.length === secondCount) {
        return;
      }

      const maskMode = settings!.tipLodBias !== undefined ? maskAccumulation.stamp : paintbrushMaskMode(settings!.values);
      if (maskMode) {
        drawMasked(tile, commands, binding, maskMode, secondCount, tx, ty);
      } else {
        drawPrimary(tile, commands, binding, secondCount);
      }
    },
    composite(tile: AbrTile, pass: GPURenderPassEncoder, pickup?: AbrPickup) {
      pipelines.composite.with(pass).with(pickupBinding(tile, pickup)).draw(3);
    },
    stats: () => ({
      uploads: textures.uploads,
      textures: textures.size,
      sampledPlanRows: sources.planRows(),
      pendingTipPlanBytes: pendingPlanBytes,
      pendingPatternBytes,
      pendingMaskBytes,
      bytes: directStamps.length * d.sizeOf(Stamp) + textures.bytes() + (maskRaster?.bytes ?? 0) + sources.bytes() +
        sources.pooledBytes() + pendingPlanBytes + pendingPatternBytes + pendingMaskBytes
    }),
    destroy() {
      for (const slot of directStamps) {
        slot.buffer.destroy();
      }

      maskRaster?.destroy();
      reset();
    }
  };

  /** Releases every preset source and texture and forgets the prepared preset. */
  function reset() {
    sources.destroy();
    textures.destroy();
    settings = undefined;
    tip = undefined;
    dual = undefined;
    bindings = new WeakMap();
  }

  /** Stages preset-wide uniforms; tile origin and mask color are written per tile in writeTileParams. */
  function writeParams(value: AbrRasterSettings) {
    const v = value.values;
    const origin = paramsOffsets.origin, texture = paramsOffsets.texture, tone = paramsOffsets.tone;
    const flags = paramsOffsets.flags, extra = paramsOffsets.extra;
    paramsData[origin + originLane.x] = 0;
    paramsData[origin + originLane.y] = 0;
    paramsData[origin + 2] = 256;
    paramsData[origin + originLane.linearMixing] = Number(value.mixing === 'linear');
    paramsData[texture + textureLane.width] = value.pattern?.width ?? 1;
    paramsData[texture + textureLane.height] = value.pattern?.height ?? 1;
    paramsData[texture + textureLane.scale] = v.texture.scale / 100;
    paramsData[texture + textureLane.mode] = blendModeId(v.texture.mode);
    paramsData[tone + toneLane.invert] = Number(v.texture.invert);
    paramsData[tone + toneLane.brightness] = v.texture.brightness;
    paramsData[tone + toneLane.contrast] = v.texture.contrast;
    paramsData[tone + toneLane.pencil] = Number(usesPencilCoverage(v.tool));
    paramsData[flags + flagsLane.texture] = Number(!!(v.useTexture && value.pattern));
    paramsData[flags + flagsLane.textureEachTip] = Number(v.texture.eachTip);
    paramsData[flags + flagsLane.dual] = Number(!!(v.useDualBrush && value.dual));
    paramsData[flags + flagsLane.noise] = Number(v.useNoise);
    paramsData[extra + extraLane.depth] = v.texture.depth / 100;
    paramsData[extra + extraLane.dualMode] = blendModeId(v.dualBrush.mode);
    paramsData[extra + extraLane.wetEdges] = Number(v.useWetEdges);
    paramsData[extra + extraLane.blendMode] = Math.max(0, paintModes.findIndex((mode) => mode === (value.blendMode ?? 'Nrml')));
    paramsData[paramsOffsets.compositeOpacity] = value.compositeOpacity ?? 1;
    paramsData[paramsOffsets.tipLodBias] = value.tipLodBias ?? 0;
    paramsData[paramsOffsets.rasterScale] = 2 ** Math.min(3, value.tipLodBias ?? 0);
    paramsIntegers[paramsOffsets.maskAccumulation] =
      value.tipLodBias !== undefined ? maskAccumulation.approximate : paintbrushMaskMode(v);
  }

  /** Rewrites a tile's uniforms only when its world origin or fixed mask color changed. */
  function writeTileParams(tile: AbrTile, binding: ReturnType<typeof createBindings>, dabs: readonly Dab[], tx: number, ty: number) {
    const colorData = dabs.find((dab) => !dab.abr?.secondary)?.abr?.data;
    if (colorData) {
      maskColor = { x: colorData[12]!, y: colorData[13]!, z: colorData[14]! };
    }

    const color = maskColor;
    if (binding.originX === tx && binding.originY === ty &&
        color.x === binding.color.x && color.y === binding.color.y && color.z === binding.color.z) {
      return;
    }

    paramsData[paramsOffsets.origin + originLane.x] = (tx * 256) % 65536;
    paramsData[paramsOffsets.origin + originLane.y] = (ty * 256) % 65536;
    paramsData[paramsOffsets.maskColor] = color.x;
    paramsData[paramsOffsets.maskColor + 1] = color.y;
    paramsData[paramsOffsets.maskColor + 2] = color.z;
    paramsData[paramsOffsets.maskColor + 3] = 1;
    tile.params.write(paramsData.buffer);
    binding.color = color;
    binding.originX = tx;
    binding.originY = ty;
  }

  /** Orders secondary dabs first into the shared scratch and uploads them tile-relative in one write.
   * Separate vertex ranges never overwrite a buffer before its draws are submitted.
   * Returns the number of leading secondary dabs.
   */
  function uploadStamps(tile: AbrTile, dabs: readonly Dab[], tx: number, ty: number) {
    ordered.length = 0;
    for (const dab of dabs) {
      if (dab.abr?.secondary) {
        ordered.push(dab);
      }
    }

    const secondCount = ordered.length;
    for (const dab of dabs) {
      if (!dab.abr?.secondary) {
        ordered.push(dab);
      }
    }

    const floats = ordered.length * 16;
    if (stampData.length < floats) {
      stampData = new Float32Array(Math.max(floats, stampData.length * 2));
    }

    for (let i = 0; i < ordered.length; i++) {
      const dab = ordered[i]!;
      if (!dab.abr) {
        throw new Error('ABR rasterizer requires ABR stamp attributes.');
      }

      stampData.set(dab.abr.data, i * 16);
      stampData[i * 16] = dab.x - tx * 256;
      stampData[i * 16 + 1] = dab.y - ty * 256;
    }

    root.device.queue.writeBuffer(root.unwrap(tile.stamps), 0, stampData, 0, floats);
    return secondCount;
  }

  /** Accumulates the leading secondary dabs into the tile's dual mask, row-planned when every tip is sampled. */
  function drawSecondary(
    tile: AbrTile,
    commands: ReturnType<typeof commandBatch>,
    binding: ReturnType<typeof createBindings>,
    secondCount: number,
    tx: number,
    ty: number
  ) {
    const source = sources.secondary;
    const tips = ordered.slice(0, secondCount).map((dab) => dab.abr?.sampledTip);
    const plans = source && tips.every((tip) => !!tip)
      ? source.gpu.prepare(tips.map((tip) => source.planner.crop(tip!, tx * 256, ty * 256, 256, 256)))
      : undefined;
    if (plans) {
      retainPlans(commands, plans);
    }

    const pass = commands.encoder().beginRenderPass({
      colorAttachments: [{ view: tile.dualView, loadOp: 'load', storeOp: 'store' }]
    });
    if (plans) {
      tips.forEach((tip, index) => {
        const left = Math.max(0, tip!.bounds.left - tx * 256), top = Math.max(0, tip!.bounds.top - ty * 256);
        const right = Math.min(256, tip!.bounds.right - tx * 256), bottom = Math.min(256, tip!.bounds.bottom - ty * 256);
        if (right <= left || bottom <= top) {
          return;
        }

        pass.setScissorRect(left, top, right - left, bottom - top);
        pipelines.sampledSecondary.with(pass).with(binding.secondary).with(plans.group).with(abrStampLayout, tile.stamps)
          .draw(3, 1, 0, index);
      });
    } else {
      pipelines.secondary.with(pass).with(binding.secondary).with(abrStampLayout, tile.stamps).draw(6, secondCount);
    }
    pass.end();
  }

  /** Accumulates primary dabs through the byte-exact mask rasterizer (fixed or straight color). */
  function drawMasked(
    tile: AbrTile,
    commands: ReturnType<typeof commandBatch>,
    binding: ReturnType<typeof createBindings>,
    maskMode: 1 | 2,
    secondCount: number,
    tx: number,
    ty: number
  ) {
    const encoder = commands.encoder();
    const raster = (maskRaster ??= createMaskRasterGpu(root, 256, 256, sampledMaskByte));
    const source = sources.sampled;
    const geometry = source && ordered.every((dab) => dab.abr?.secondary || dab.abr?.sampledTip)
      ? ordered.map((dab) => dab.abr?.secondary ? undefined : dab.abr?.sampledTip)
      : undefined;
    recordRects.length = 0;
    recordIndices.length = 0;
    for (let index = secondCount; index < ordered.length; index++) {
      const bounds = geometry && ordered[index]!.abr?.sampledTip?.bounds;
      const rects = maskRasterRects(stampData, index * 16, 256, 256, bounds ? {
        left: bounds.left - tx * 256, right: bounds.right - tx * 256,
        top: bounds.top - ty * 256, bottom: bounds.bottom - ty * 256
      } : undefined);
      for (const rect of rects) {
        recordRects.push(rect);
        recordIndices.push(index);
      }
    }

    // Large stamps use the existing fragment path. Bound both serial accumulation
    // and shared coverage memory so a long packet cannot monopolize the GPU.
    const directMask = batchSampledMasks && maskMode === maskAccumulation.fixedColor && !!geometry &&
      recordRects.length <= sampledMaskBatchLimit &&
      recordRects.every((rect) => rect.width <= 64 && rect.height <= 64) &&
      recordRects.reduce((area, rect) => area + Math.ceil(rect.width / 4) * 4 * rect.height, 0) <= 256 * 256;
    // Compute consumers address the full stamp directly. Avoid cloning its spans
    // into 256-row tile plans when only a few rows contain pencil coverage.
    const compact = directMask && secondCount === 0 && geometry!.every((tip) => tip &&
      tip.bounds.right - tip.bounds.left <= 64 && tip.bounds.bottom - tip.bounds.top <= 64);
    const affine = compact ? source!.gpu.prepareAffine(geometry! as NonNullable<typeof geometry[number]>[]) : undefined;
    const complete = compact && !affine ? geometry!.map((tip) => source!.planner.get(tip!)) : undefined;
    const plans = affine ?? (geometry && source
      ? source.gpu.prepare(complete
        ? complete.map((entry) => entry.plan)
        : geometry.map((tip) => tip ? source.planner.crop(tip, tx * 256, ty * 256, 256, 256) : emptyTilePlan))
      : undefined);
    if (plans) {
      retainPlans(commands, plans);
    }

    if (tile.maskBatch?.mode !== maskMode || tile.maskBatch.direct !== directMask) {
      retireMaskBatch(tile, commands);
      tile.maskBatch = raster.createBatch(tile.capacity, maskMode, directMask);
    }

    // The batch borrows recordRects until it is recorded below, within this draw.
    tile.maskBatch.write(recordRects, directMask ? recordIndices.map((index) => ({
      firstRow: plans!.firstRows[index]!,
      x: affine ? tx * 256 - affine.origins[index]!.x : complete ? tx * 256 - complete[index]!.x : 0,
      y: affine ? ty * 256 - affine.origins[index]!.y : complete ? ty * 256 - complete[index]!.y : 0,
      data: stampData,
      offset: index * 16 + 8
    })) : undefined);
    if (directMask && plans) {
      tile.maskBatch.recordBatch(encoder, root.unwrap(tile.paint), (pipeline) =>
        pipeline.with(binding.primary).with(plans.group));
      return;
    }

    for (let record = 0; record < recordRects.length; record++) {
      const rect = recordRects[record]!;
      const index = recordIndices[record]!;
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: raster.sourceView, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }]
      });
      if (plans) {
        pass.setScissorRect(rect.x, rect.y, rect.width, rect.height);
        pipelines.sampledTip.with(pass).with(binding.primary).with(plans.group).with(abrStampLayout, tile.stamps)
          .draw(3, 1, 0, index);
      } else {
        pipelines.maskSource.with(pass).with(binding.primary).with(abrStampLayout, tile.stamps).draw(6, 1, 0, index);
      }
      pass.end();
      tile.maskBatch.record(encoder, record, root.unwrap(tile.paint));
    }
  }

  /** Blends primary dabs into paint and max-accumulated mask targets. */
  function drawPrimary(
    tile: AbrTile,
    commands: ReturnType<typeof commandBatch>,
    binding: ReturnType<typeof createBindings>,
    secondCount: number
  ) {
    const pass = commands.encoder().beginRenderPass({
      colorAttachments: [
        { view: tile.paintView, loadOp: 'load', storeOp: 'store' },
        { view: tile.maskView, loadOp: 'load', storeOp: 'store' }
      ]
    });
    // Keep persistent masks in the tile's top-left LOD region. Composite expands
    // that region into ordinary document pixels, including after tile eviction.
    const side = 256 / paramsData[paramsOffsets.rasterScale]!;
    pass.setViewport(0, 0, side, side, 0, 1);
    pipelines.primary
      .with(pass)
      .with(binding.primary)
      .with(abrStampLayout, tile.stamps)
      .draw(6, ordered.length - secondCount, 0, secondCount);
    pass.end();
  }

  /** Keeps compiled tip plans alive until their readers are submitted. */
  function retainPlans(commands: ReturnType<typeof commandBatch>, plans: { bytes: number; release(): void }) {
    pendingPlanBytes += plans.bytes;
    commands.afterSubmit(() => {
      plans.release();
      pendingPlanBytes -= plans.bytes;
    });
  }

  /** A replaced mask batch may still be read by encoded work; destroy it after submission. */
  function retireMaskBatch(tile: AbrTile, commands: ReturnType<typeof commandBatch>) {
    const old = tile.maskBatch;
    if (!old) {
      return;
    }

    tile.maskBatch = undefined;
    pendingMaskBytes += old.bytes;
    commands.afterSubmit(() => {
      old.destroy();
      pendingMaskBytes -= old.bytes;
    });
  }

  function prepareTile(tile: AbrTile, commands: ReturnType<typeof commandBatch>, tx: number, ty: number) {
    if (pendingPlanBytes >= 8 * 1024 * 1024) {
      commands.flush();
    }

    preparePattern(tile, commands, tx, ty);
  }

  /** Reuses each scratch tile's pattern texture. Writes follow earlier readers in
   * the same encoder; coordinate uploads remain immutable until submission.
   */
  function preparePattern(tile: AbrTile, commands: ReturnType<typeof commandBatch>, tx: number, ty: number) {
    const old = tile.pattern;
    const pattern = sources.pattern;
    const scale = settings!.values.texture.scale / 100;
    if (old && old.source === pattern?.key && old.tx === tx && old.ty === ty && old.scale === scale) {
      return;
    }

    if (!old && !pattern) {
      return;
    }

    if (pattern) {
      const region = old?.region ?? pattern.gpu.createRegion(256, 256);
      const batch = pattern.gpu.record(commands.encoder(), region, scale,
        { x: tx * 256, y: ty * 256, width: 256, height: 256 });
      commands.afterSubmit(() => batch.destroy());
      tile.pattern = { region, source: pattern.key, tx, ty, scale };
      if (!old) {
        bindings.delete(tile);
      }
    } else {
      tile.pattern = undefined;
      if (old) {
        pendingPatternBytes += old.region.bytes;
        commands.afterSubmit(() => {
          old.region.destroy();
          pendingPatternBytes -= old.region.bytes;
        });
      }
      bindings.delete(tile);
    }
  }

  function pickupBinding(tile: AbrTile, pickup: AbrPickup | undefined, centerX = 0, centerY = 0) {
    const placement = pickupOffsets.placement, flags = pickupOffsets.flags;
    const clip = pickupOffsets.clip, sampleSize = pickupOffsets.sampleSize;
    pickupData[placement] = pickup?.x ?? 0;
    pickupData[placement + 1] = pickup?.y ?? 0;
    pickupData[placement + 2] = pickup?.width ?? 1;
    pickupData[placement + 3] = pickup?.height ?? 1;
    pickupData[flags + pickupFlagsLane.active] = Number(!!pickup);
    pickupData[flags + pickupFlagsLane.strength] = pickup?.strength ?? 0;
    pickupData[flags + pickupFlagsLane.fingerPainting] = Number(!!pickup?.fingerPainting);
    pickupData[flags + pickupFlagsLane.mode] =
      pickup?.history ? pickupMode.history : pickup?.mixer ? pickupMode.mixer : pickupMode.retouch;
    pickupData[clip] = pickup?.clip?.[0] ?? 0;
    pickupData[clip + 1] = pickup?.clip?.[1] ?? 0;
    pickupData[clip + 2] = pickup?.clip?.[2] ?? 1;
    pickupData[clip + 3] = pickup?.clip?.[3] ?? 1;
    pickupData[sampleSize] = pickup?.patch.width ?? 256;
    pickupData[sampleSize + 1] = pickup?.patch.height ?? 256;
    pickupData[pickupOffsets.center] = centerX;
    pickupData[pickupOffsets.center + 1] = centerY;
    tile.pickupParams.write(pickupData.buffer);
    const image = pickup?.patch.texture ?? tile.base;
    const binding = bindingsFor(tile);
    const cache = binding.composites;
    let group = cache.get(image);
    if (!group) {
      group = root.createBindGroup(compositeLayout, {
        base: tile.base,
        mask: tile.mask,
        paint: tile.paint,
        dual: tile.dualMask,
        pattern: binding.pattern,
        params: tile.params,
        pickup: image,
        pickupSampler: pipelines.sampler,
        pickupParams: tile.pickupParams
      });
      cache.set(image, group);
    }
    return group;
  }

  /** Bindings follow the scratch tile, not its world coordinate. Weak keys let
   * resized pickup textures and retired tiles be reclaimed; prepare resets preset resources.
   */
  function bindingsFor(tile: AbrTile) {
    let value = bindings.get(tile);
    if (!value) {
      value = createBindings(tile);
      bindings.set(tile, value);
    }
    return value;
  }

  function createBindings(tile: AbrTile) {
    if (!tip || !dual) {
      throw new Error('Prepare an ABR preset before drawing.');
    }

    const pattern = tile.pattern?.region.texture ?? tip;
    return {
      pattern,
      primary: root.createBindGroup(stampLayout, { params: tile.params, tip, pattern, sampler: pipelines.sampler }),
      secondary: root.createBindGroup(stampLayout, { params: tile.params, tip: dual, pattern, sampler: pipelines.sampler }),
      composites: new WeakMap<TgpuTexture, ReturnType<typeof root.createBindGroup<typeof compositeLayout.entries>>>(),
      color: { x: 0, y: 0, z: 0 },
      originX: Number.NaN,
      originY: Number.NaN
    };
  }
}

/** The prepared preset without document layers, history or resource pixels, so nothing
 * from an earlier document stays reachable after its stroke ends.
 */
type PreparedSettings = Pick<AbrRasterSettings, 'values' | 'tipLodBias' | 'blendMode'> & {
  pattern: boolean;
  dual: boolean;
  smudge: boolean;
};

/** Tile-local mapping of a captured canvas patch; uniforms are consumed before the next write. */
type AbrPickup = {
  /** Valid carried image overlap in patch UV coordinates. Newly grown pickup pixels load before they paint. */
  clip?: readonly [number, number, number, number];
  patch:
    | Awaited<ReturnType<ReturnType<typeof createCanvasPickup>['capture']>>
    | ReturnType<ReturnType<typeof createMixerWells>['step']>;
  x: number;
  y: number;
  width: number;
  height: number;
  strength: number;
  fingerPainting: boolean;
  mixer?: boolean;
  history?: boolean;
};

/** A stamp can span submissions while its tiles load. Track its last draw's
 * batch version, rather than the version at upload, before recycling its bytes.
 */
function createDirectStamp(root: TgpuRoot) {
  return {
    buffer: root.createBuffer(d.arrayOf(Stamp, 1)).$usage('vertex'),
    batch: undefined as ReturnType<typeof commandBatch> | undefined,
    version: 0
  };
}

/** Extra ABR scratch survives eviction and disposable preview copies along with the ordinary mask. */
export type AbrTile = ReturnType<typeof createAbrTile>;

function createAbrTile(root: TgpuRoot, base: Texture, mask: Texture, capacity: number) {
  const paint = texture(root),
    dualMask = texture(root);
  const params = root.createBuffer(Params).$usage('uniform');
  const pickupParams = root.createBuffer(PickupParams).$usage('uniform');
  const stamps = root.createBuffer(d.arrayOf(Stamp, capacity)).$usage('vertex');
  const coverage = createAbrCoverage(root.device, { mask: root.unwrap(mask), paint: root.unwrap(paint), dual: root.unwrap(dualMask) });
  const tile = {
    capacity,
    coverage,
    /** Additional ABR textures and instance data, excluding borrowed base/mask and small uniforms. */
    bytes: (): number => 256 * 256 * 4 * 2 + capacity * 64 + (tile.maskBatch?.bytes ?? 0) + (tile.pattern?.region.bytes ?? 0),
    pattern: undefined as { region: ReturnType<ReturnType<typeof createPatternRasterGpu>['rasterize']>;
      source: symbol; tx: number; ty: number; scale: number } | undefined,
    maskBatch: undefined as ReturnType<ReturnType<typeof createMaskRasterGpu>['createBatch']> | undefined,
    paint,
    dualMask,
    params,
    pickupParams,
    stamps,
    paintView: coverage.views.paint,
    dualView: coverage.views.dual,
    maskView: coverage.views.mask,
    base,
    mask,
    destroy() {
      tile.maskBatch?.destroy();
      tile.pattern?.region.destroy();
      tile.pattern = undefined;
      paint.destroy();
      dualMask.destroy();
      params.destroy();
      pickupParams.destroy();
      stamps.destroy();
    }
  };
  return tile;
}

function texture(root: TgpuRoot, side = 256) {
  return root.createTexture({ size: [side, side], format: 'rgba8unorm' }).$usage('sampled', 'render');
}

type Texture = ReturnType<typeof texture>;

/** Tile plan for secondary slots in a mixed batch: 256 empty rows. Plans are immutable, so one is shared. */
const emptyTilePlan: Parameters<ReturnType<typeof createTipRasterGpu>['prepare']>[0][number] = {
  width: 256,
  height: 256,
  rows: Array.from({ length: 256 }, () => [])
};

/** Limits serial mask accumulation even when a pointer packet contains thousands of stamps. */
const sampledMaskBatchLimit = 512;
