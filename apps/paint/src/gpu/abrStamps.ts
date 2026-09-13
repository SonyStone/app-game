import { createPatternRasterGpu } from '@app-game/abr-brush/patternRasterGpu';
import { affineSecondaryBlend } from '@app-game/abr-brush/secondaryMask';
import { createTipPyramid } from '@app-game/abr-brush/tipPyramid';
import { createTipRasterGpu, sampleTipPlanByte } from '@app-game/abr-brush/tipRasterGpu';
import { createSampledTipTilePlanner } from '@app-game/abr-brush/sampledTipRaster';
import type { commandBatch } from './commandBatch';
import { maskRasterRects, paintbrushMaskMode } from '@app-game/abr-brush/maskRaster';
import { createMaskRasterGpu } from '@app-game/abr-brush/maskRasterGpu';
import type { ColorMixing } from '@app-game/abr-brush/effects';
import {
  blendModeId,
  dualCoverage,
  fingerPaintCompositeInSpace,
  grain,
  mixerComposite,
  retouchCompositeInSpace,
  sampleMixing,
  textureCoverage,
  textureTone
} from '@app-game/abr-brush/effects';
import type { BrushFormValues } from '@app-game/abr-brush/form';
import { paintBlend, paintModes } from '@app-game/abr-brush/paintBlend';
import { pencilCoverage, usesPencilCoverage } from '@app-game/abr-brush/pencil';
import { common, d, std, tgpu, type TgpuRoot, type TgpuTexture } from 'typegpu';
import type { Dab } from '../brush';
import type { BrushResource } from '../composition/brushResources';
import type { Layer } from '../document';
import type { createCanvasPickup } from './canvasPickup';
import { linearSourceOver } from './colorMixing';
import type { createMixerWells } from './mixerWells';

/** Immutable preset resources pinned by the brush session. */
export type AbrRasterSettings = {
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
  blendMode?: string;
  /** Canvas-dependent tools receive the current document layers without owning them. */
  smudge?: { strength: number; fingerPainting: boolean; allLayers: boolean; layers: readonly Layer[] };
  /** Blur/Sharpen modify captured pixels at document resolution; percentages are normalized. */
  filter?: { sharpen: boolean; protectDetail: boolean; strength: number; allLayers: boolean; layers: readonly Layer[] };
  /** A preset's reservoir persists across gestures; all percentages here are normalized to 0..1. */
  mixer?: {
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
export function createAbrStamps(root: TgpuRoot) {
  // CPU staging is shared; queue writes copy its bytes immediately. GPU uniforms
  // remain tile-owned so pending draws retain their existing submission lifetime.
  const paramsData = new Float32Array(d.sizeOf(Params) / 4);
  const paramsIntegers = new Uint32Array(paramsData.buffer);
  const pickupData = new Float32Array(d.sizeOf(PickupParams) / 4);
  const directStamps = Array.from({ length: 8 }, () => createDirectStamp(root));
  let nextDirectStamp = 0;
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' });
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
          color: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
          alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' }
        }
      }
    }
  });
  const maskSource = root.createRenderPipeline({
    attribs: abrStampLayout.attrib, vertex, fragment: maskSourceFragment, targets: { format: 'rgba8unorm' }
  });
  let maskRaster: ReturnType<typeof createMaskRasterGpu> | undefined;
  const secondary = root.createRenderPipeline({
    attribs: abrStampLayout.attrib,
    vertex,
    fragment: secondaryFragment,
    // Current secondary tips are affine; Photoshop accumulates their byte coverage.
    targets: { format: 'rgba8unorm', blend: affineSecondaryBlend }
  });
  const composite = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: compositeFragment,
    targets: { format: 'rgba8unorm' }
  });
  const direct = root.createRenderPipeline({
    attribs: abrStampLayout.attrib,
    vertex,
    fragment: directFragment,
    targets: { format: 'rgba8unorm' }
  });
  const sharedDirect = root.with(sharedStamp, true).createRenderPipeline({
    attribs: abrStampLayout.attrib,
    vertex,
    fragment: directFragment,
    targets: { format: 'rgba8unorm' }
  });
  const sampledTipPipeline = root.createRenderPipeline({
    attribs: { dynamics: abrStampLayout.attrib.dynamics }, vertex: sampledTipVertex,
    fragment: sampledTipFragment, targets: { format: 'rgba8unorm' }
  });
  let sampledSource: { resource: BrushResource; levels: ReturnType<typeof createTipPyramid>;
    gpu: ReturnType<typeof createTipRasterGpu>; planner: ReturnType<typeof createSampledTipTilePlanner>; bytes: number } | undefined;
  let secondarySource: typeof sampledSource;
  const sampledSecondaryPipeline = root.createRenderPipeline({
    attribs: { dynamics: abrStampLayout.attrib.dynamics }, vertex: sampledTipVertex,
    fragment: sampledSecondaryFragment, targets: { format: 'rgba8unorm', blend: affineSecondaryBlend }
  });
  let pendingPlanBytes = 0;
  let pendingPatternBytes = 0;
  let patternSource: { key: symbol; resource: BrushResource; gpu: ReturnType<typeof createPatternRasterGpu> } | undefined;
  type Uploaded = ReturnType<typeof coverageTexture>;
  let textures: Uploaded[] = [];
  const lookup = new WeakMap<BrushResource, Uploaded>();
  const budget = 64 * 1024 * 1024;
  const bytes = (image: Uploaded) => (image.props.size[0] * image.props.size[1] * 4) / 3;
  let uploads = 0;
  let settings: AbrRasterSettings | undefined;
  let tip: Uploaded, dual: Uploaded;
  // Fixed-color masks survive tile eviction independently of tile-local uniforms.
  let maskColor = { x: 0, y: 0, z: 0 };
  let bindings = new WeakMap<AbrTile, ReturnType<typeof createBindings>>();
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
      maskColor = { x: 0, y: 0, z: 0 };
      const v = value.values;
      paramsData.set([0, 0, 256, Number(value.mixing === 'linear')], paramsOffsets.origin);
      paramsData.set([value.pattern?.width ?? 1, value.pattern?.height ?? 1,
        v.texture.scale / 100, blendModeId(v.texture.mode)], paramsOffsets.texture);
      paramsData.set([Number(v.texture.invert), v.texture.brightness, v.texture.contrast,
        Number(usesPencilCoverage(v.tool))], paramsOffsets.tone);
      paramsData.set([Number(!!(v.useTexture && value.pattern)), Number(v.texture.eachTip),
        Number(!!(v.useDualBrush && value.dual)), Number(v.useNoise)], paramsOffsets.flags);
      paramsData.set([v.texture.depth / 100, blendModeId(v.dualBrush.mode), Number(v.useWetEdges),
        Math.max(0, paintModes.findIndex(mode => mode === (value.blendMode ?? 'Nrml')))], paramsOffsets.extra);
      paramsData[paramsOffsets.compositeOpacity] = value.compositeOpacity ?? 1;
      paramsIntegers[paramsOffsets.maskAccumulation] = paintbrushMaskMode(v);
      const required = [value.tip, ...(value.dual ? [value.dual] : [])];
      const keep = new Set(required.map((resource) => lookup.get(resource)).filter(Boolean));
      const missing = required.filter(
        (resource) => !keep.has(lookup.get(resource)) || !textures.includes(lookup.get(resource)!)
      );
      const needsPattern = value.values.useTexture && value.pattern;
      if (patternSource && (!needsPattern || patternSource.resource !== value.pattern)) {
        patternSource.gpu.destroy();
        patternSource = undefined;
      }
      if (needsPattern && !patternSource) {
        // Four odd-sized levels can retain the full extent. Include host pixels
        // as well as packed GPU bytes before allocating a new pattern source.
        let width = needsPattern.width, height = needsPattern.height, patternBytes = 0;
        for (let level = 0; level < 4; level++) {
          patternBytes += width * height + Math.ceil(width * height / 4) * 4 + 8;
          if (width % 2 === 0) width /= 2;
          if (height % 2 === 0) height /= 2;
        }
        if (patternBytes > budget) throw new Error('ABR pattern levels exceed the 64 MiB brush budget.');
        patternSource = { key: Symbol('pattern source'), resource: needsPattern, gpu: createPatternRasterGpu(root,
          { width: needsPattern.width, height: needsPattern.height, data: needsPattern.pixels }) };
      }
      const needsSampled = value.values.tool.type === 'PbTl' && value.values.tipKind === 'sampledBrush' &&
        !(value.values.useShapeDynamics && value.values.shapeDynamics.brushProjection);
      if (sampledSource && (!needsSampled || sampledSource.resource !== value.tip)) {
        sampledSource.gpu.destroy();
        sampledSource = undefined;
      }
      if (needsSampled && !sampledSource) {
        const levels = createTipPyramid({ width: value.tip.width, height: value.tip.height, data: value.tip.pixels });
        const sourceBytes = levels.reduce((sum, level) => sum + level.width * level.height + 16, 0);
        if (required.reduce((sum, resource) => sum + (resource.width * resource.height * 4) / 3, sourceBytes + (patternSource?.gpu.bytes ?? 0)) > budget)
          throw new Error('ABR mipmaps and sampled-tip pyramid exceed the 64 MiB GPU brush budget.');
        sampledSource = { resource: value.tip, levels, gpu: createTipRasterGpu(root, levels), planner: createSampledTipTilePlanner(levels), bytes: sourceBytes };
      }
      // Computed secondary sources are already rasterized and use the same affine row planner.
      const needsSecondary = value.values.useDualBrush && value.dual;
      if (secondarySource && (!needsSecondary || secondarySource.resource !== needsSecondary)) {
        secondarySource.gpu.destroy(); secondarySource = undefined;
      }
      if (needsSecondary && !secondarySource) {
        const levels = createTipPyramid({ width: needsSecondary.width, height: needsSecondary.height, data: needsSecondary.pixels });
        const bytes = levels.reduce((sum, level) => sum + level.width * level.height + 16, 0);
        if (required.reduce((sum, resource) => sum + (resource.width * resource.height * 4) / 3,
          bytes + (sampledSource?.bytes ?? 0) + (patternSource?.gpu.bytes ?? 0)) > budget)
          throw new Error('ABR secondary tip pyramid exceeds the 64 MiB GPU brush budget.');
        secondarySource = { resource: needsSecondary, levels, bytes, gpu: createTipRasterGpu(root, levels),
          planner: createSampledTipTilePlanner(levels, true) };
      }
      const sourceBytes = (sampledSource?.bytes ?? 0) + (secondarySource?.bytes ?? 0) + (patternSource?.gpu.bytes ?? 0);
      const additional = missing.reduce((sum, resource) => sum + (resource.width * resource.height * 4) / 3, sourceBytes);
      if (required.reduce((sum, resource) => sum + (resource.width * resource.height * 4) / 3, sourceBytes) > budget)
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
      // The renderer borrows history only while painting; GPU resource caches must not pin old document maps.
      settings = { ...value, historySource: undefined };
      try {
        tip = upload(value.tip);
        dual = value.dual ? upload(value.dual) : tip;
        bindings = new WeakMap();
      } catch (error) {
        for (const texture of textures) texture.destroy();
        textures = [];
        throw error;
      }
    },
    /** Creates device scratch without owning the base or mask supplied by the tile cache. */
    createTile: (base: Texture, mask: Texture, capacity: number) => createAbrTile(root, base, mask, capacity),
    /** One primary Smudge stamp can composite directly unless coverage needs neighboring or secondary pixels. */
    canDrawDirect: () =>
      !!settings?.smudge && !settings.values.useWetEdges && !(settings.values.useDualBrush && settings.dual),
    /** Upload one primary dab for all its tiles. Encode its draws before preparing
     * another dab. Slots submit pending readers before their bytes are recycled.
     * The vertex shader reads tile placement from the pickup uniform's spare bytes.
     */
    prepareDirect(dab: Dab) {
      if (!dab.abr || dab.abr.secondary) throw new Error('Direct Smudge requires one primary ABR dab.');
      const slot = directStamps[nextDirectStamp++ % directStamps.length]!;
      if (slot.batch && slot.batch.version === slot.version) slot.batch.flush();
      root.device.queue.writeBuffer(root.unwrap(slot.buffer), 0, dab.abr.data);
      return slot;
    },
    /** All writes are tile-local; uniforms carry world origin for a continuous pattern across seams.
     * A destination bypasses coverage scratch: requires canDrawDirect(), one primary dab,
     * a refreshed base inside the pass scissor, and caller-owned pass.end().
     */
    draw(
      tile: AbrTile,
      commands: ReturnType<typeof commandBatch>,
      dabs: readonly Dab[],
      tx: number,
      ty: number,
      destination?: { pass: GPURenderPassEncoder; pickup: AbrPickup; stamps?: ReturnType<typeof createDirectStamp> }
    ) {
      if (pendingPlanBytes >= 8 * 1024 * 1024) commands.flush();
      const encoder = commands.encoder();
      const s = settings!;
      const v = s.values;
      preparePattern(tile, commands, tx, ty);
      const binding = bindingsFor(tile);
      const colorData = dabs.find(dab => !dab.abr?.secondary)?.abr?.data;
      if (colorData) maskColor = { x: colorData[12]!, y: colorData[13]!, z: colorData[14]! };
      const color = maskColor;
      if (binding.originX !== tx || binding.originY !== ty ||
          color.x !== binding.color.x || color.y !== binding.color.y || color.z !== binding.color.z) {
        paramsData[paramsOffsets.origin] = (tx * 256) % 65536;
        paramsData[paramsOffsets.origin + 1] = (ty * 256) % 65536;
        paramsData[paramsOffsets.maskColor] = color.x;
        paramsData[paramsOffsets.maskColor + 1] = color.y;
        paramsData[paramsOffsets.maskColor + 2] = color.z;
        paramsData[paramsOffsets.maskColor + 3] = 1;
        tile.params.write(paramsData.buffer);
        binding.color = color;
        binding.originX = tx;
        binding.originY = ty;
      }
      if (destination?.stamps) {
        sharedDirect.with(destination.pass).with(binding.primary)
          .with(pickupBinding(tile, destination.pickup, dabs[0]!.x - tx * 256, dabs[0]!.y - ty * 256))
          .with(abrStampLayout, destination.stamps.buffer).draw(6);
        destination.stamps.batch = commands;
        destination.stamps.version = commands.version;
        return;
      }
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
      if (destination) {
        direct
          .with(destination.pass)
          .with(binding.primary)
          .with(pickupBinding(tile, destination.pickup))
          .with(abrStampLayout, tile.stamps)
          .draw(6, ordered.length);
        return;
      }
      const secondCount = ordered.filter((dab) => dab.abr?.secondary).length;
      if (secondCount) {
        const source = secondarySource;
        const tips = ordered.slice(0, secondCount).map(dab => dab.abr?.sampledTip);
        const plans = source && tips.every(tip => !!tip) ? source.gpu.prepare(tips.map(tip =>
          source.planner.crop(tip!, tx * 256, ty * 256, 256, 256))) : undefined;
        if (plans) {
          pendingPlanBytes += plans.bytes;
          commands.afterSubmit(() => { plans.destroy(); pendingPlanBytes -= plans.bytes; });
        }
        const pass = encoder.beginRenderPass({
          colorAttachments: [{ view: tile.dualView, loadOp: 'load', storeOp: 'store' }]
        });
        if (plans) tips.forEach((tip, index) => {
          const left = Math.max(0, tip!.bounds.left - tx * 256), top = Math.max(0, tip!.bounds.top - ty * 256);
          const right = Math.min(256, tip!.bounds.right - tx * 256), bottom = Math.min(256, tip!.bounds.bottom - ty * 256);
          if (right <= left || bottom <= top) return;
          pass.setScissorRect(left, top, right - left, bottom - top);
          sampledSecondaryPipeline.with(pass).with(binding.secondary).with(plans.group).with(abrStampLayout, tile.stamps)
            .draw(3, 1, 0, index);
        });
        else secondary.with(pass).with(binding.secondary).with(abrStampLayout, tile.stamps).draw(6, secondCount);
        pass.end();
      }
      const maskMode = paintbrushMaskMode(v);
      if (ordered.length > secondCount && maskMode) {
        maskRaster ??= createMaskRasterGpu(root, 256, 256);
        if (tile.maskBatch?.mode !== maskMode) {
          tile.maskBatch?.destroy();
          tile.maskBatch = maskRaster.createBatch(tile.capacity, maskMode);
        }
        const source = sampledSource;
        const geometry = source && ordered.every(dab => dab.abr?.secondary || dab.abr?.sampledTip)
          ? ordered.map(dab => dab.abr?.secondary ? undefined : dab.abr?.sampledTip) : undefined;
        const plans = geometry && source ? source.gpu.prepare(geometry.map(tip => tip
          ? source.planner.crop(tip, tx * 256, ty * 256, 256, 256)
          : { width: 256, height: 256, rows: Array.from({ length: 256 }, () => []) })) : undefined;
        if (plans) {
          pendingPlanBytes += plans.bytes;
          commands.afterSubmit(() => { plans.destroy(); pendingPlanBytes -= plans.bytes; });
        }
        const records = ordered.slice(secondCount).flatMap((dab, i) => {
          const bounds = geometry && dab.abr?.sampledTip?.bounds;
          return maskRasterRects(data, (i + secondCount) * 16, 256, 256, bounds ? {
            left: bounds.left - tx * 256, right: bounds.right - tx * 256,
            top: bounds.top - ty * 256, bottom: bounds.bottom - ty * 256
          } : undefined).map(rect => ({ rect, index: i + secondCount }));
        });
        tile.maskBatch.write(records.map(record => record.rect));
        records.forEach((record, index) => {
          const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: maskRaster!.sourceView, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }]
          });
          if (plans) {
            pass.setScissorRect(record.rect.x, record.rect.y, record.rect.width, record.rect.height);
            sampledTipPipeline.with(pass).with(binding.primary).with(plans.group).with(abrStampLayout, tile.stamps)
              .draw(3, 1, 0, record.index);
          } else maskSource.with(pass).with(binding.primary).with(abrStampLayout, tile.stamps).draw(6, 1, 0, record.index);
          pass.end();
          tile.maskBatch!.record(encoder, index, root.unwrap(tile.paint));
        });
      } else if (ordered.length > secondCount) {
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            { view: tile.paintView, loadOp: 'load', storeOp: 'store' },
            { view: tile.maskView, loadOp: 'load', storeOp: 'store' }
          ]
        });
        primary
          .with(pass)
          .with(binding.primary)
          .with(abrStampLayout, tile.stamps)
          .draw(6, ordered.length - secondCount, 0, secondCount);
        pass.end();
      }
    },
    composite(tile: AbrTile, pass: GPURenderPassEncoder, pickup?: AbrPickup) {
      composite.with(pass).with(pickupBinding(tile, pickup)).draw(3);
    },
    stats: () => ({
      uploads,
      textures: textures.length,
      sampledPlanRows: (sampledSource?.planner.rows ?? 0) + (secondarySource?.planner.rows ?? 0),
      pendingTipPlanBytes: pendingPlanBytes,
      pendingPatternBytes,
      bytes: directStamps.length * d.sizeOf(Stamp) + textures.reduce((sum, texture) => sum + (texture.props.size[0] * texture.props.size[1] * 4) / 3, 0) + (maskRaster?.bytes ?? 0) + (sampledSource?.bytes ?? 0) + (secondarySource?.bytes ?? 0) + pendingPlanBytes + pendingPatternBytes + (patternSource?.gpu.bytes ?? 0)
    }),
    destroy() {
      for (const slot of directStamps) slot.buffer.destroy();
      maskRaster?.destroy();
      sampledSource?.gpu.destroy();
      sampledSource = undefined;
      secondarySource?.gpu.destroy(); secondarySource = undefined;
      patternSource?.gpu.destroy();
      patternSource = undefined;
      for (const texture of textures) texture.destroy();
      textures = [];
    }
  };

  /** Pattern coordinates are prepared in double precision before tile-local GPU loads.
   * Replacement textures stay alive until all pending readers are submitted.
   */
  function preparePattern(tile: AbrTile, commands: ReturnType<typeof commandBatch>, tx: number, ty: number) {
    const old = tile.pattern;
    const scale = settings!.values.texture.scale / 100;
    if (old && old.source === patternSource?.key && old.tx === tx && old.ty === ty && old.scale === scale) return;
    if (!old && !patternSource) return;
    const region = patternSource?.gpu.rasterize(scale, { x: tx * 256, y: ty * 256, width: 256, height: 256 });
    tile.pattern = region && patternSource ? { region, source: patternSource.key, tx, ty, scale } : undefined;
    if (old) {
      pendingPatternBytes += old.region.bytes;
      commands.afterSubmit(() => { old.region.destroy(); pendingPatternBytes -= old.region.bytes; });
    }
    bindings.delete(tile);
  }

  function pickupBinding(tile: AbrTile, pickup: AbrPickup | undefined, centerX = 0, centerY = 0) {
    const placement = pickupOffsets.placement, flags = pickupOffsets.flags;
    const clip = pickupOffsets.clip, sampleSize = pickupOffsets.sampleSize;
    pickupData[placement] = pickup?.x ?? 0;
    pickupData[placement + 1] = pickup?.y ?? 0;
    pickupData[placement + 2] = pickup?.width ?? 1;
    pickupData[placement + 3] = pickup?.height ?? 1;
    pickupData[flags] = Number(!!pickup);
    pickupData[flags + 1] = pickup?.strength ?? 0;
    pickupData[flags + 2] = Number(!!pickup?.fingerPainting);
    pickupData[flags + 3] = pickup?.history ? 2 : pickup?.mixer ? 1 : 0;
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
        pickupSampler: sampler,
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
    const pattern = tile.pattern?.region.texture ?? tip;
    return {
      pattern,
      primary: root.createBindGroup(layout, { params: tile.params, tip, pattern, sampler }),
      secondary: root.createBindGroup(layout, { params: tile.params, tip: dual, pattern, sampler }),
      composites: new WeakMap<TgpuTexture, ReturnType<typeof root.createBindGroup<typeof compositeLayout.entries>>>(),
      color: { x: 0, y: 0, z: 0 },
      originX: Number.NaN,
      originY: Number.NaN
    };
  }
}

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
  const tile = {
    capacity,
    pattern: undefined as { region: ReturnType<ReturnType<typeof createPatternRasterGpu>['rasterize']>;
      source: symbol; tx: number; ty: number; scale: number } | undefined,
    maskBatch: undefined as ReturnType<ReturnType<typeof createMaskRasterGpu>['createBatch']> | undefined,
    paint,
    dualMask,
    params,
    pickupParams,
    stamps,
    paintView: root.unwrap(paint).createView(),
    dualView: root.unwrap(dualMask).createView(),
    maskView: root.unwrap(mask).createView(),
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
function coverageTexture(root: TgpuRoot, width: number, height: number, mipLevelCount: number) {
  return root.createTexture({ size: [width, height], format: 'r8unorm', mipLevelCount }).$usage('sampled', 'render');
}
function texture(root: TgpuRoot) {
  return root.createTexture({ size: [256, 256], format: 'rgba8unorm' }).$usage('sampled', 'render');
}
type Texture = ReturnType<typeof texture>;
const Params = d.struct({
  origin: d.vec4f,
  texture: d.vec4f,
  tone: d.vec4f,
  flags: d.vec4f,
  extra: d.vec4f,
  /** Global tool opacity applied after all mask operations. */
  compositeOpacity: d.f32,
  /** 1 uses fixed color; 2 stores straight RGB. Both already contain accumulated alpha. */
  maskAccumulation: d.u32,
  maskColor: d.vec4f
});
// Offsets come from the shader schema, including struct alignment and padding.
const paramsOffsets = {
  origin: d.memoryLayoutOf(Params, value => value.origin).offset / 4,
  texture: d.memoryLayoutOf(Params, value => value.texture).offset / 4,
  tone: d.memoryLayoutOf(Params, value => value.tone).offset / 4,
  flags: d.memoryLayoutOf(Params, value => value.flags).offset / 4,
  extra: d.memoryLayoutOf(Params, value => value.extra).offset / 4,
  compositeOpacity: d.memoryLayoutOf(Params, value => value.compositeOpacity).offset / 4,
  maskAccumulation: d.memoryLayoutOf(Params, value => value.maskAccumulation).offset / 4,
  maskColor: d.memoryLayoutOf(Params, value => value.maskColor).offset / 4
};
const Stamp = d.struct({ bounds: d.vec4f, transform: d.vec4f, dynamics: d.vec4f, color: d.vec4f });
export const abrStampLayout = tgpu.vertexLayout(d.arrayOf(Stamp), 'instance');
const layout = tgpu.bindGroupLayout({
  params: { uniform: Params },
  tip: { texture: d.texture2d() },
  pattern: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' }
});
const sharedStamp = tgpu.slot(false);
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
  let center = d.vec2f(input.bounds.xy);
  if (sharedStamp.$) {
    // CPU subtraction preserves local precision at large document coordinates.
    center = d.vec2f(compositeLayout.$.pickupParams.center);
  }
  const pixel = std.add(
    center,
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
  const coverage = shadeStamp(input.position, input.uv, input.dynamics, input.color);
  return { paint: coverage.paint, mask: coverage.mask };
});
const maskSourceFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, uv: d.vec2f, dynamics: d.vec4f, color: d.vec4f }, out: d.vec4f
})((input) => {
  'use gpu';
  return d.vec4f(shadeStamp(input.position, input.uv, input.dynamics, input.color).mask.r);
});
const sampledTipVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex, instance: d.builtin.instanceIndex, dynamics: d.vec4f },
  out: { position: d.builtin.position, firstRow: d.interpolate('flat', d.u32), dynamics: d.vec4f }
})((input) => {
  'use gpu';
  const x = d.f32((input.index << 1) & 2);
  const y = d.f32(input.index & 2);
  return { position: d.vec4f(x * 2 - 1, 1 - y * 2, 0, 1), firstRow: input.instance * 256, dynamics: input.dynamics };
});
const sampledTipFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, firstRow: d.interpolate('flat', d.u32), dynamics: d.vec4f }, out: d.vec4f
})((input) => {
  'use gpu';
  const byte = sampleTipPlanByte(d.u32(input.position.x), input.firstRow + d.u32(input.position.y));
  return d.vec4f(stampEffects(d.f32(std.max(byte, 0)) / 255, input.position, input.dynamics));
});

const sampledSecondaryFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, firstRow: d.interpolate('flat', d.u32) }, out: d.vec4f
})((input) => {
  'use gpu';
  const byte = sampleTipPlanByte(d.u32(input.position.x), input.firstRow + d.u32(input.position.y));
  return d.vec4f(d.f32(std.max(byte, 0)) / 255);
});

const Coverage = d.struct({ paint: d.vec4f, mask: d.vec4f });
function shadeStamp(position: d.v4f, tipUv: d.v2f, dynamics: d.v4f, color: d.v4f) {
  'use gpu';
  const coverage = stampEffects(std.textureSample(layout.$.tip, layout.$.sampler, tipUv).r, position, dynamics);
  const flow = coverage * dynamics.x;
  return Coverage({ paint: d.vec4f(std.mul(color.rgb, flow), flow),
    mask: d.vec4f(coverage, std.select(0, dynamics.y, coverage > 0), 0, coverage * dynamics.y) });
}
function stampEffects(source: number, position: d.v4f, dynamics: d.v4f): number {
  'use gpu';
  const p = layout.$.params;
  let coverage = source;
  if (p.flags.x > 0 && p.flags.y > 0) {
    const sample = std.textureLoad(layout.$.pattern, d.vec2i(position.xy), 0).r;
    coverage = textureCoverage(coverage, textureTone(sample, p.tone.x, p.tone.y, p.tone.z), p.texture.w, dynamics.z);
  }
  if (p.flags.w > 0) coverage *= 0.35 + 0.65 * grain(position.x + p.origin.x, position.y + p.origin.y, dynamics.w);
  if (p.tone.w > 0) coverage = pencilCoverage(coverage);
  return coverage;
}

const secondaryFragment = tgpu.fragmentFn({ in: { uv: d.vec2f, dynamics: d.vec4f, color: d.vec4f }, out: d.vec4f })((
  input
) => {
  'use gpu';
  return d.vec4f(std.floor(std.textureSample(layout.$.tip, layout.$.sampler, input.uv).r * 255 + 0.5) / 255);
});
const PickupParams = d.struct({ placement: d.vec4f, flags: d.vec4f, clip: d.vec4f, sampleSize: d.vec2f, center: d.vec2f });
// Offsets come from the shader schema, including struct alignment and padding.
const pickupOffsets = {
  placement: d.memoryLayoutOf(PickupParams, value => value.placement).offset / 4,
  flags: d.memoryLayoutOf(PickupParams, value => value.flags).offset / 4,
  clip: d.memoryLayoutOf(PickupParams, value => value.clip).offset / 4,
  sampleSize: d.memoryLayoutOf(PickupParams, value => value.sampleSize).offset / 4,
  center: d.memoryLayoutOf(PickupParams, value => value.center).offset / 4
};
const compositeLayout = tgpu.bindGroupLayout({
  pickup: { texture: d.texture2d() },
  pickupSampler: { sampler: 'filtering' },
  pickupParams: { uniform: PickupParams },
  base: { texture: d.texture2d() },
  mask: { texture: d.texture2d() },
  paint: { texture: d.texture2d() },
  dual: { texture: d.texture2d() },
  pattern: { texture: d.texture2d() },
  params: { uniform: Params }
});
const compositeFragment = tgpu.fragmentFn({ in: { position: d.builtin.position }, out: d.vec4f })((input) => {
  'use gpu';
  const xy = d.vec2i(input.position.xy);
  return compositePixel(
    input.position,
    std.textureLoad(compositeLayout.$.paint, xy, 0),
    std.textureLoad(compositeLayout.$.mask, xy, 0)
  );
});
/** Preserve the intermediate rgba8unorm rounding even when coverage never leaves the shader. */
const directFragment = tgpu.fragmentFn({
  in: { position: d.builtin.position, uv: d.vec2f, dynamics: d.vec4f, color: d.vec4f },
  out: d.vec4f
})((input) => {
  'use gpu';
  const stamp = shadeStamp(input.position, input.uv, input.dynamics, input.color);
  const paint = std.unpack4x8unorm(std.pack4x8unorm(stamp.paint));
  const mask = std.unpack4x8unorm(std.pack4x8unorm(stamp.mask));
  return compositePixel(input.position, paint, mask);
});

function compositePixel(position: d.v4f, paint: d.v4f, mask: d.v4f): d.v4f {
  'use gpu';
  const p = compositeLayout.$.params;
  const xy = d.vec2i(position.xy);
  const base = std.textureLoad(compositeLayout.$.base, xy, 0);
  let alpha = d.f32(paint.a);
  if (p.flags.x > 0 && p.flags.y === 0) {
    const sample = std.textureLoad(compositeLayout.$.pattern, xy, 0).r;
    alpha = textureCoverage(alpha, textureTone(sample, p.tone.x, p.tone.y, p.tone.z), p.texture.w, p.extra.x);
  }
  if (p.flags.z > 0) alpha = dualCoverage(alpha, std.textureLoad(compositeLayout.$.dual, xy, 0).r, p.extra.y);
  // Local edge approximation; exact wet-edge diffusion requires a halo exchange between tiles.
  if (p.extra.z > 0) {
    const up = std.textureLoad(
      compositeLayout.$.paint,
      std.clamp(std.add(xy, d.vec2i(0, -1)), d.vec2i(0), d.vec2i(255)),
      0
    ).a;
    const down = std.textureLoad(
      compositeLayout.$.paint,
      std.clamp(std.add(xy, d.vec2i(0, 1)), d.vec2i(0), d.vec2i(255)),
      0
    ).a;
    const left = std.textureLoad(
      compositeLayout.$.paint,
      std.clamp(std.add(xy, d.vec2i(-1, 0)), d.vec2i(0), d.vec2i(255)),
      0
    ).a;
    const right = std.textureLoad(
      compositeLayout.$.paint,
      std.clamp(std.add(xy, d.vec2i(1, 0)), d.vec2i(0), d.vec2i(255)),
      0
    ).a;
    alpha = std.min(1, alpha * 0.65 + std.max(0, paint.a - std.min(std.min(up, down), std.min(left, right))) * 2);
  }
  // The legacy dynamic-opacity cap still needs destination-aware byte accumulation.
  // Global tool opacity is separate and applies after mask composition.
  if (p.tone.w > 0) alpha = pencilCoverage(alpha);
  const opacity = std.select(mask.a, mask.g, p.flags.z > 0 && p.extra.y === 7);
  if (p.maskAccumulation === 0) alpha = std.min(alpha, opacity);
  alpha *= p.compositeOpacity;
  if (p.extra.w === 1) alpha = std.select(0, 1, grain(position.x + p.origin.x, position.y + p.origin.y, 13.75) < alpha);
  let color = std.div(paint.rgb, std.max(0.00001, paint.a));
  if (p.maskAccumulation === 1) color = d.vec3f(p.maskColor.rgb);
  else if (p.maskAccumulation === 2) color = d.vec3f(paint.rgb);
  const source = d.vec4f(std.mul(color, alpha), alpha);
  if (compositeLayout.$.pickupParams.flags.x > 0) {
    // Sparse tips leave most covered rectangles empty. Sampling and working-space
    // conversion cannot affect a zero-coverage pixel, including transparent pickup.
    if (alpha <= 0) return base;
    const tool = compositeLayout.$.pickupParams;
    const pickupUv = std.div(std.add(position.xy, tool.placement.xy), tool.placement.zw);
    if (pickupUv.x < tool.clip.x || pickupUv.y < tool.clip.y || pickupUv.x > tool.clip.z || pickupUv.y > tool.clip.w)
      return base;
    const picked = sampleMixing(
      compositeLayout.$.pickup,
      compositeLayout.$.pickupSampler,
      std.div(
        std.clamp(std.mul(pickupUv, tool.sampleSize), d.vec2f(0.5), std.sub(tool.sampleSize, d.vec2f(0.5))),
        d.vec2f(std.textureDimensions(compositeLayout.$.pickup))
      ),
      p.origin.w > 0 && tool.flags.w === 0
    );
    if (tool.flags.w === 2) return std.mix(base, picked, alpha);
    if (tool.flags.w > 0) {
      // The wells emit premultiplied paint. Flow/coverage modulates deposition;
      // transparent pickup must not erase existing canvas pixels.
      return mixerComposite(base, picked, alpha);
    }
    if (tool.flags.z > 0) {
      return fingerPaintCompositeInSpace(base, color, alpha * tool.flags.y, p.extra.w, p.origin.w > 0);
    }
    return retouchCompositeInSpace(base, picked, alpha * tool.flags.y, p.extra.w, p.origin.w > 0);
  }
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
}
