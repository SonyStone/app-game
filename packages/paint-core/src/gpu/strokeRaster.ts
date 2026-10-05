import { createAbrStamps, type AbrRasterSettings } from '@app-game/abr-paint/gpu/abrStamps';
import { expandToRasterGrid } from '@app-game/abr-paint/gpu/brushBatchSize';
import { createCanvasPickup, type PickupRegion } from '@app-game/abr-paint/gpu/canvasPickup';
import { commandBatch } from '@app-game/abr-paint/gpu/commandBatch';
import { createSmudgeDepositBatch, planSmudgeDeposits } from '@app-game/abr-paint/gpu/smudgeDepositBatch';
import { directStampBounds, stampBounds } from '@app-game/abr-paint/gpu/stampBounds';
import type { BrushResource } from '@app-game/abr-paint/resources';
import { d, type TgpuRoot } from 'typegpu';
import { dabIntersectsTile, dabTiles, TILE_SIZE, type Brush, type Dab } from '../brush';
import type { Layer } from '../document';
import { isEmptyPackedTile } from '../tilePixels';
import type { createDisplayCache } from './displayCache';
import { clipPaintBounds, type PaintBounds } from './paintBounds';
import * as shader from './shaders';
import type { StrokeClip } from './strokeClip';
import type { StrokeData } from './strokeState';
import type { TargetViews } from './targetView';
import { createTexturedStamps } from './texturedStamps';
import type { TileResidency } from './tileResidency';
import {
  clearTransmittance,
  createMipmapEnsurer,
  createTile,
  destroyTile,
  historyTexture,
  prepareStroke,
  replacePixels,
  STAMP_CAPACITY,
  tileBytes,
  tileCoordinates,
  tileId,
  transmittanceBlend,
  type PaintTile,
  type StrokeScratch
} from './tileTextures';

/**
 * GPU rasterization of the current stroke: round, textured and ABR stamps into resident tiles, sampling-tool
 * deposits, disposable preview tails, history-source tiles and canvas pickup for retouch tools.
 * Reads and updates the shared StrokeData; tile residency supplies destination tiles. Calls are serialized.
 */
export function createStrokeRaster(
  root: TgpuRoot,
  deps: {
    stroke: StrokeData;
    residency: TileResidency;
    displayCache: ReturnType<typeof createDisplayCache>;
    targets: TargetViews;
    sampler: ReturnType<TgpuRoot['createSampler']>;
    ensureMipmaps: ReturnType<typeof createMipmapEnsurer>;
    paintBounds: PaintBounds | undefined;
    allowsTile: (key: string) => boolean;
    /** Whether the document blends its layers in linear light, for sampling all layers as displayed. */
    linearBlending: () => boolean;
    /** Keeps strokes inside the lasso selection; see `createStrokeClip`. */
    clip: StrokeClip;
  },
  options: {
    displayCache?: boolean;
    batchPickupUploads?: boolean;
    adaptivePickupMipmaps?: boolean;
    batchSampledMasks?: boolean;
    directSmudge?: boolean;
    batchSmudgeTiles?: boolean;
  }
) {
  const { stroke, residency, displayCache, targets, paintBounds, allowsTile } = deps;
  const device = root.device;
  const pipelines = {
    stamp: root.createRenderPipeline({
      attribs: { stamp: shader.stampLayout.attrib },
      vertex: shader.stampVertex,
      fragment: shader.stampFragment,
      targets: { format: 'r16float', blend: transmittanceBlend }
    }),
    stroke: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.strokeFragment,
      targets: { format: 'rgba8unorm' }
    })
  };
  const brushBuffer = root.createBuffer(shader.brushLayout.entries.settings.uniform).$usage('uniform');
  const brushGroup = root.createBindGroup(shader.brushLayout, { settings: brushBuffer });
  // writeBuffer copies at call time, so one staging array serves every round-brush stamp upload.
  const stampData = new Float32Array(STAMP_CAPACITY * 4);
  let texturedStamps: ReturnType<typeof createTexturedStamps> | undefined;
  let texturedPipeline: ReturnType<ReturnType<typeof createTexturedStamps>['prepare']> | undefined;
  let abrStamps: ReturnType<typeof createAbrStamps> | undefined;
  let smudgeDeposits: ReturnType<typeof createSmudgeDepositBatch> | undefined;
  let pickup: ReturnType<typeof createCanvasPickup<Layer>> | undefined;
  // Immutable history-source tiles are uploaded once per stroke, not once per paint batch.
  const historyTiles = new Map<string, ReturnType<typeof historyTexture>>();
  const spareHistoryTiles: ReturnType<typeof historyTexture>[] = [];
  // A small reusable pool, independent of committed scratch and its eviction/readback lifecycle.
  const tailPool: PaintTile[] = [];

  return {
    /** Prepares the shared ABR rasterizer for one stroke and returns it. */
    prepareAbr(settings: AbrRasterSettings<Layer>) {
      abrStamps ??= createAbrStamps(root, options.batchSampledMasks);
      abrStamps.prepare(settings);
      return abrStamps;
    },

    /** Selects a textured tip for the stroke, or round dabs without one. */
    prepareTip(tip: { resource: BrushResource; angle: number } | undefined) {
      texturedPipeline = tip
        ? (texturedStamps ??= createTexturedStamps(root)).prepare(tip.resource, tip.angle)
        : undefined;
    },

    /** Writes the round/textured brush uniform: color, alpha lock, hardness, opacity, eraser and linear mixing. */
    prepareBrush(brush: Brush, alphaLock = false) {
      const rgb = hexColor(brush.color);
      brushBuffer.write({
        color: d.vec4f(...rgb, Number(alphaLock)),
        params: d.vec4f(
          brush.hardness,
          brush.opacity,
          brush.tool === 'eraser' ? 1 : 0,
          brush.mixing === 'linear' ? 1 : 0
        )
      });
    },

    paintStamps,
    prepareTail,
    captureRegion,

    /** Stroke end: history tiles belong to that stroke's source; keep their textures for the next one. */
    releaseHistoryTiles() {
      spareHistoryTiles.push(...historyTiles.values());
      historyTiles.clear();
    },

    stats() {
      return {
        brushTextures: stroke.abr ? abrStamps?.stats() : texturedStamps?.stats(),
        bytes:
          (texturedStamps?.stats().bytes ?? 0) +
          (abrStamps?.stats().bytes ?? 0) +
          (pickup?.bytes() ?? 0) +
          (historyTiles.size + spareHistoryTiles.length) * TILE_SIZE * TILE_SIZE * 4 +
          (smudgeDeposits?.bytes() ?? 0) +
          tailPool.reduce((sum, tile) => sum + tileBytes(tile), 0)
      };
    },

    destroy() {
      brushBuffer.destroy();
      abrStamps?.destroy();
      for (const texture of [...historyTiles.values(), ...spareHistoryTiles]) {
        texture.destroy();
      }

      historyTiles.clear();
      spareHistoryTiles.length = 0;
      pickup?.destroy();
      texturedStamps?.destroy();
      texturedPipeline = undefined;
      smudgeDeposits?.destroy();
      for (const tile of tailPool) {
        destroyTile(tile);
      }

      tailPool.length = 0;
    }
  };

  /** Rasterizes one ordered operation; sampling tools reset their coverage for each transport step. */
  async function paintStamps(
    dabs: readonly Dab[],
    sampled?: NonNullable<Parameters<ReturnType<typeof createAbrStamps>['composite']>[2]>,
    onlyTile?: string,
    batch?: ReturnType<typeof commandBatch>
  ) {
    const current = stroke.current;
    if (!current || !dabs.length) {
      return;
    }

    const abr = stroke.abr;
    const sharedScratch = residency.sharedScratch;
    const direct =
      !!sampled &&
      (stroke.smudge || stroke.mixer) &&
      options.directSmudge !== false &&
      abr!.canDrawDirect() &&
      dabs.length === 1 &&
      !dabs[0]!.abr?.secondary;
    const groups = new Map<string, Dab[]>();
    if (onlyTile !== undefined) {
      const [x, y] = tileCoordinates(onlyTile);
      const touching = dabs.filter((dab) => dabIntersectsTile(dab, x, y));
      if (touching.length && allowsTile(onlyTile)) {
        groups.set(onlyTile, touching);
      }
    } else {
      for (const dab of dabs) {
        for (const key of dabTiles(dab)) {
          if (!allowsTile(key)) {
            continue;
          }

          let group = groups.get(key);
          if (!group) {
            group = [];
            groups.set(key, group);
          }

          group.push(dab);
        }
      }
    }

    const commands = batch ?? commandBatch(device);
    if (
      !paintBounds &&
      !deps.clip.active() &&
      direct &&
      sharedScratch &&
      options.batchSmudgeTiles !== false &&
      groups.size >= 8 &&
      residency.residentLimit >= 8 &&
      !stroke.historySource &&
      abr!.canBatchDirect()
    ) {
      const dab = dabs[0]!;
      // Batch eviction can retire several LRU tiles together. Leave that many spare slots
      // so every newly acquired destination stays resident until its copy-back is encoded.
      const capacity = Math.min(32, residency.residentLimit - residency.evictionSize + 1);
      smudgeDeposits ??= createSmudgeDepositBatch(root, abr!);
      try {
        for (const chunk of planSmudgeDeposits(dab, groups.keys(), capacity)) {
          const tiles: PaintTile[] = [];
          for (const { key } of chunk.tiles) {
            tiles.push(await residency.ensure(current.layer, key, commands));
          }

          for (const { key } of chunk.tiles) {
            const id = tileId(current.layer.id, key);
            if (!stroke.tiles.has(id)) {
              stroke.tiles.set(id, { before: current.layer.tiles.get(key) });
            }
          }

          smudgeDeposits.draw(
            commands,
            dab,
            sampled!,
            chunk,
            tiles.map((tile) => root.unwrap(tile.texture))
          );
          chunk.tiles.forEach(({ key }, index) => {
            tiles[index]!.mipLevelReady = 0;
            tiles[index]!.strokeDirty = true;
            displayCache.remove(tileId(current.layer.id, key), batch?.flush);
            targets.mark(key);
          });
        }
      } finally {
        if (!batch) {
          commands.flush();
        }
      }

      return;
    }

    const directStamp = direct ? abr!.prepareDirect(dabs[0]!) : undefined;
    let pendingTiles = 0;
    try {
      if (!direct) {
        abr?.beginPaint(dabs);
      }

      for (const [key, dabs] of groups) {
        const [tx, ty] = tileCoordinates(key);
        const stampRegion = expandToRasterGrid(
          direct ? directStampBounds(dabs[0]!, tx, ty) : stampBounds(dabs, tx, ty),
          abr ? abr.rasterScale() : 1
        );
        const bounds = stampRegion && clipPaintBounds(paintBounds, tx, ty, stampRegion);
        if (!bounds) {
          continue;
        }

        let historyPickup: typeof sampled;
        if (stroke.historySource) {
          const history = await historyTile(stroke.historySource, key, commands);
          historyPickup = {
            patch: {
              texture: history,
              width: TILE_SIZE,
              height: TILE_SIZE,
              region: { x: tx * TILE_SIZE, y: ty * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }
            },
            x: tx * TILE_SIZE,
            y: ty * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE,
            strength: 1,
            fingerPainting: false,
            history: true
          };
        }

        const id = tileId(current.layer.id, key);
        const tile = await residency.ensure(current.layer, key, commands);
        const scratch = sharedScratch ? residency.samplingScratch(commands) : prepareStroke(root, tile);
        if (abr) {
          scratch.abr ??= abr.createTile(scratch.base, scratch.mask, STAMP_CAPACITY);
        }

        const firstTouch = !stroke.tiles.has(id);
        if (firstTouch || sharedScratch) {
          if (firstTouch) {
            stroke.tiles.set(id, { before: current.layer.tiles.get(key) });
          }

          const region = sharedScratch && bounds ? bounds : { x: 0, y: 0, width: TILE_SIZE, height: TILE_SIZE };
          const origin = { x: region.x, y: region.y };
          commands
            .encoder()
            .copyTextureToTexture(
              { texture: root.unwrap(tile.texture), origin },
              { texture: root.unwrap(scratch.base), origin },
              [region.width, region.height]
            );
          if (!direct) {
            if (abr) {
              scratch.abr!.coverage.clear(commands);
            } else {
              clearTransmittance(commands.encoder(), scratch.transmittanceRender);
            }
          }
        }

        if (sampled && !firstTouch && !sharedScratch && bounds) {
          // Smudge composites each step over the previous step. Immutable history remains in the stroke snapshot.
          // The composite reads base only inside its scissor; refresh that rectangle instead of the whole tile.
          // Sampling tools do not use disposable tails, which would need a complete pre-stroke base.
          const origin = { x: bounds.x, y: bounds.y };
          commands
            .encoder()
            .copyTextureToTexture(
              { texture: root.unwrap(tile.texture), origin },
              { texture: root.unwrap(scratch.base), origin },
              [bounds.width, bounds.height]
            );
          if (!direct) {
            scratch.abr!.coverage.clear(commands, false);
          }
        }

        for (let offset = 0; !direct && offset < dabs.length; offset += STAMP_CAPACITY) {
          // The same instance buffer must not be overwritten before its previous draw is submitted.
          if (offset) {
            commands.flush();
          }

          const stamps = dabs.slice(offset, offset + STAMP_CAPACITY);
          if (abr) {
            abr.draw(scratch.abr!, commands, stamps, tx, ty);
            continue;
          }

          drawRoundStamps(commands, scratch, stamps, tx, ty);
        }

        // Output depends on the final accumulated mask, so composite once per touched region.
        // Keep previous output outside this region, including ink from earlier input batches.
        if (bounds) {
          if (direct) {
            abr!.prepareTile(scratch.abr!, commands, tx, ty);
          }

          const pass = commands.encoder().beginRenderPass({
            colorAttachments: [{ view: tile.render, loadOp: 'load', storeOp: 'store' }]
          });
          pass.setScissorRect(bounds.x, bounds.y, bounds.width, bounds.height);
          if (abr) {
            const captured = historyPickup ?? sampled;
            const pickup = captured
              ? {
                  ...captured,
                  x: tx * TILE_SIZE - captured.x,
                  y: ty * TILE_SIZE - captured.y
                }
              : undefined;
            if (direct) {
              abr.draw(scratch.abr!, commands, dabs, tx, ty, { pass, pickup: pickup!, stamps: directStamp });
            } else {
              abr.composite(scratch.abr!, pass, pickup);
            }
          } else {
            pipelines.stroke.with(pass).with(brushGroup).with(scratch.strokeGroup).draw(3);
          }

          pass.end();
          deps.clip.restore(commands.encoder(), tile, scratch.base, key, bounds);
        }

        tile.mipLevelReady = 0;
        tile.strokeDirty = true;
        displayCache.remove(id, batch?.flush);
        targets.mark(key);
        if (++pendingTiles === (sharedScratch ? residency.scratchLimit : 32)) {
          commands.flush();
          pendingTiles = 0;
        }
      }
    } finally {
      abr?.endPaint(commands);
      // An I/O failure must not discard commands for previously processed tiles in this batch.
      if (!batch) {
        commands.flush();
      }
    }
  }

  /** Builds display-only output with the same accumulated mask and opacity as the real stroke.
   * Submits its own commands; `slot` selects a pooled temporary that callers must not still be sampling.
   */
  function prepareTail(original: PaintTile, active: boolean, tail: readonly Dab[], slot: number, x: number, y: number) {
    const abr = stroke.abr;
    const temporary: PaintTile = tailPool[slot] ?? (tailPool[slot] = createTile(root, undefined, deps.sampler));
    const scratch = prepareStroke(root, temporary);
    const commands = commandBatch(device);
    commands
      .encoder()
      .copyTextureToTexture(
        { texture: root.unwrap(active ? original.scratch!.base : original.texture) },
        { texture: root.unwrap(scratch.base) },
        [TILE_SIZE, TILE_SIZE]
      );
    if (abr) {
      scratch.abr ??= abr.createTile(scratch.base, scratch.mask, STAMP_CAPACITY);
      scratch.abr.coverage.copyFrom(active ? original.scratch!.abr!.coverage : undefined, commands);
    } else if (active) {
      commands
        .encoder()
        .copyTextureToTexture(
          { texture: root.unwrap(original.scratch!.transmittance) },
          { texture: root.unwrap(scratch.transmittance) },
          [TILE_SIZE, TILE_SIZE]
        );
    } else {
      clearTransmittance(commands.encoder(), scratch.transmittanceRender);
    }

    for (let offset = 0; offset < tail.length; offset += STAMP_CAPACITY) {
      if (offset) {
        commands.flush();
      }

      const stamps = tail.slice(offset, offset + STAMP_CAPACITY);
      if (abr) {
        abr.draw(scratch.abr!, commands, stamps, x, y);
        continue;
      }

      drawRoundStamps(commands, scratch, stamps, x, y);
    }

    const pass = commands
      .encoder()
      .beginRenderPass({ colorAttachments: [{ view: temporary.render, loadOp: 'clear', storeOp: 'store' }] });
    const clip = clipPaintBounds(paintBounds, x, y)!;
    pass.setScissorRect(clip.x, clip.y, clip.width, clip.height);
    if (abr) {
      abr.composite(scratch.abr!, pass);
    } else {
      pipelines.stroke.with(pass).with(brushGroup).with(scratch.strokeGroup).draw(3);
    }

    pass.end();
    deps.clip.restore(commands.encoder(), temporary, scratch.base, `${x},${y}`, clip);
    commands.flush();
    temporary.mipLevelReady = 0;
    return temporary;
  }

  /** Accumulates round or textured stamps into a tile's transmittance. The instance buffer is rewritten, so callers
   * submit before drawing the same scratch again.
   */
  function drawRoundStamps(
    commands: ReturnType<typeof commandBatch>,
    scratch: StrokeScratch,
    stamps: readonly Dab[],
    tx: number,
    ty: number
  ) {
    for (let index = 0; index < stamps.length; index++) {
      const dab = stamps[index]!;
      stampData[index * 4] = dab.x - tx * TILE_SIZE;
      stampData[index * 4 + 1] = dab.y - ty * TILE_SIZE;
      stampData[index * 4 + 2] = dab.radius;
      stampData[index * 4 + 3] = dab.flow;
    }

    device.queue.writeBuffer(root.unwrap(scratch.stamps), 0, stampData, 0, stamps.length * 4);
    const pass = commands.encoder().beginRenderPass({
      colorAttachments: [{ view: scratch.transmittanceRender, loadOp: 'load', storeOp: 'store' }]
    });
    if (texturedPipeline) {
      texturedPipeline.with(pass).with(shader.stampLayout, scratch.stamps).draw(6, stamps.length);
    } else {
      pipelines.stamp.with(pass).with(brushGroup).with(shader.stampLayout, scratch.stamps).draw(6, stamps.length);
    }

    pass.end();
  }

  /** Returns the stroke's resident copy of a history-source tile, uploading it on first use. At most HISTORY_TILES
   * stay resident; recycling the least recently used one first submits every encoded reader of it.
   */
  async function historyTile(source: Layer, key: string, commands: ReturnType<typeof commandBatch>) {
    const cached = historyTiles.get(key);
    if (cached) {
      historyTiles.delete(key);
      historyTiles.set(key, cached);
      return cached;
    }

    let texture = spareHistoryTiles.pop();
    if (!texture && historyTiles.size >= HISTORY_TILES) {
      const [oldest, recycled] = historyTiles.entries().next().value!;
      commands.flush();
      historyTiles.delete(oldest);
      texture = recycled;
    }

    texture ??= historyTexture(root);
    try {
      replacePixels(device, root.unwrap(texture), await residency.readTile(source.tiles.get(key)), commands);
    } catch (error) {
      spareHistoryTiles.push(texture);
      throw error;
    }

    historyTiles.set(key, texture);
    return texture;
  }

  /** Samples current pixels for canvas-dependent tools, excluding disposable previews.
   * The borrowed GPU patch remains valid until the next capture or renderer disposal.
   * Call only between submitted paint operations; all renderer operations are serialized by the runtime.
   */
  async function captureRegion(
    region: PickupRegion,
    layers: readonly Layer[],
    allLayers = false,
    exact = false,
    linear = false,
    commands?: ReturnType<typeof commandBatch>,
    maxDimension?: number
  ) {
    pickup ??= createCanvasPickup<Layer>(root, async (layer, key, minify, flush, requiredMip) => {
      const id = tileId(layer.id, key);
      const snapshot = stroke.tiles.get(id);
      if (!layer.tiles.has(key) && !snapshot) {
        return undefined;
      }

      let tile;
      if (residency.has(id)) {
        tile = await residency.ensure(layer, key);
      } else if (options.displayCache === false) {
        flush();
        tile = await residency.ensure(layer, key);
      } else {
        // Pickup is read-only. Restoring brush scratch here evicts destination
        // tiles for every large footprint, causing repeated GPU readback/reupload.
        // Reuse the bounded immutable cache, always at full document resolution.
        await residency.awaitSnapshots([snapshot?.pending]);

        const source = snapshot?.output ?? layer.tiles.get(key);
        // Only immutable nonresident snapshots may prove emptiness. Resident GPU
        // ink can already be newer than the last packed snapshot.
        if (!source || isEmptyPackedTile(source)) {
          return undefined;
        }

        const beforeInvalidate = options.batchPickupUploads === false ? () => flush() : flush;
        tile = displayCache.find(id, source, 1, beforeInvalidate);
        if (!tile) {
          // Only destruction of an encoded source requires submission; fresh uploads can stay in the batch.
          if (options.batchPickupUploads === false) {
            flush();
          }

          const pixels = (await residency.readTile(source))!;
          if (isEmptyPackedTile(pixels)) {
            return undefined;
          }

          tile = displayCache.get(id, pixels, 1, source, beforeInvalidate);
        }
      }

      if (minify) {
        const last = options.adaptivePickupMipmaps === false ? 8 : requiredMip;
        if (last > tile.mipLevelReady) {
          // Earlier dabs may still be encoded. Mipmap generation submits independently.
          flush();
          deps.ensureMipmaps(tile, last);
        }
      }

      return tile.texture;
    });
    return pickup.capture(region, layers, {
      allLayers,
      linearBlending: deps.linearBlending(),
      exact,
      linear,
      commands,
      maxDimension
    });
  }
}

/** The renderer's stroke rasterizer. */
export type StrokeRaster = ReturnType<typeof createStrokeRaster>;

/** Resident history-source tiles per stroke (4 MiB); larger brushes recycle the least recently used. */
const HISTORY_TILES = 16;

function hexColor(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  ];
}
