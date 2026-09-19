import type { AbrCoverageSnapshot } from '@app-game/abr-paint/gpu/coverage';
import { capturePaintBounds, clipPaintBounds, type PaintBounds } from './paintBounds';
import { expandToRasterGrid } from '@app-game/abr-paint/gpu/brushBatchSize';
import { visibleTileKeys } from './visibleTileKeys';
import { d, tgpu, type RenderFlag, type TgpuRoot, type TgpuTexture } from 'typegpu';
import { attempt, unwrapResult, type Result } from '../asyncResult';
import { TILE_SIZE, dabIntersectsTile, dabTiles, type Brush, type Dab } from '../brush';
import { screenToWorld, type Camera, type Point, type ViewSize } from '../camera';
import type { BrushResource } from '@app-game/abr-paint/resources';
import type { Layer, TileChange } from '../document';
import { isEmptyPackedTile, packTile, unpackTile, type TileData } from '../tilePixels';
import { viewLod, type OverviewStorage } from '../virtualPages';
import { createAbrStamps, type AbrRasterSettings, type AbrTile } from '@app-game/abr-paint/gpu/abrStamps';
import { createCanvasPickup, type PickupRegion } from '@app-game/abr-paint/gpu/canvasPickup';
import { commandBatch } from '@app-game/abr-paint/gpu/commandBatch';
import { commandSlots } from '@app-game/abr-paint/gpu/commandSlots';
import { createDisplayCache } from './displayCache';
import { createLassoOverlay } from './lassoOverlay';
import { createReadbackQueue } from './readbackQueue';
import * as shader from './shaders';
import { createSmudgeDepositBatch, planSmudgeDeposits } from '@app-game/abr-paint/gpu/smudgeDepositBatch';
import { directStampBounds, stampBounds } from '@app-game/abr-paint/gpu/stampBounds';
import { createTexturedStamps } from './texturedStamps';
import { createTileMipmaps } from './tileMipmaps';
import { createAbrRetouch } from '@app-game/abr-paint/gpu/retouch';
import { createViewDamage } from './viewDamage';
import { createViewFallback } from './viewFallback';
import { createVirtualTexture } from './virtualTexture';

/** Creates one WebGPU device/cache owner with a default canvas. Additional targets share its raster resources.
 * Committed CPU tiles remain valid after cache eviction or device loss. Render/paint/detach calls must be serialized.
 */
export async function createPaintRenderer(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  onLost: (message: string) => void,
  options: {
    device?: GPUDevice;
    /** Fixed write extent, including live previews and retouch tools. Omit for infinite drawing. */
    bounds?: PaintBounds;
    /** Hard pixel-tile limit for constrained devices and eviction verification. */
    cacheTiles?: number;
    /** Reuse transient sampling scratch; false retains per-tile scratch for GPU comparisons. */
    sharedScratch?: boolean;
    /** Batch pickup uploads until a pending source is invalidated; false retains eager flushes for GPU verification. */
    batchPickupUploads?: boolean;
    /** Build only view-required mip levels by default; false retains full chains for GPU comparisons. */
    adaptiveMipmaps?: boolean;
    displayCache?: boolean;
    /** Batch small sampled-brush masks on GPU; false retains per-stamp passes for pixel/performance comparisons. */
    batchSampledMasks?: boolean;
    /** Use fused Smudge coverage by default; false retains the multipass reference for GPU verification. */
    directSmudge?: boolean;
    /** Batch eligible multi-tile Smudge deposits; false preserves individual tile passes for comparison. */
    batchSmudgeTiles?: boolean;
    /** Cache and batch mipmap passes; false retains TypeGPU's per-level helper for GPU comparisons. */
    batchedMipmaps?: boolean;
    /** Include visible tiles' mip updates in their display submission; false submits each chain for verification. */
    batchViewMipmaps?: boolean;
    /** Generate only mip levels used by Classic pickup; false builds all eight source levels for verification. */
    adaptivePickupMipmaps?: boolean;
    /** Submit pickup, carry and deposit together for each Smudge dab; false keeps separate submissions for verification. */
    batchSmudgePasses?: boolean;
    /** Share one submission across up to eight small-footprint Smudge dabs; false submits every dab for verification. */
    batchSmudgeDabs?: boolean;
    overviewStorage?: OverviewStorage;
    readTile?: (pixels: TileData) => Promise<Uint8Array>;
    virtualTexture?: boolean;
    onRefine?: () => void;
    /** Awaited between complete sampling dabs, after their GPU writes are submitted.
     * May render/present progress. Must not paint, finish, cancel, reset or replace this renderer.
     */
    onPaintProgress?: () => Promise<void>;
    onError?: (error: unknown) => void;
  } = {}
) {
  const paintBounds = capturePaintBounds(options.bounds);
  const allowsTile = (key: string) => !paintBounds || !!clipPaintBounds(paintBounds, ...coordinates(key));
  if (!navigator.gpu) throw new Error('WebGPU is unavailable. Open this page in a browser with WebGPU support.');
  const adapter = options.device ? undefined : await navigator.gpu.requestAdapter();
  if (!options.device && !adapter)
    throw new Error('A WebGPU device could not be opened. Check hardware acceleration in your browser.');
  const device = options.device ?? (await adapter!.requestDevice());
  const root = tgpu.initFromDevice({ device });
  let context = canvas.getContext('webgpu');
  if (!context) {
    root.destroy();
    throw new Error('The canvas could not start WebGPU.');
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  let disposed = false;
  void device.lost.then((info) => {
    if (!disposed) onLost(info.message || 'The graphics device was disconnected.');
  });
  const uncapturedError = (event: GPUUncapturedErrorEvent) => {
    if (!disposed) onLost(event.error.message);
  };
  device.addEventListener('uncapturederror', uncapturedError);
  const pipelines = createPipelines(root, format);
  const lasso = createLassoOverlay(root, format);
  let texturedStamps: ReturnType<typeof createTexturedStamps> | undefined;
  let texturedPipeline: ReturnType<ReturnType<typeof createTexturedStamps>['prepare']> | undefined;
  let abrStamps: ReturnType<typeof createAbrStamps> | undefined;
  let abrActive = false;
  // Sampling tools replace coverage at every stamp; only dual-brush coverage persists.
  let transientCoverage = false;
  let smudgeActive = false;
  let historySource: Layer | undefined;
  let historyTexture: ReturnType<typeof historyTarget> | undefined;
  const retouch = createAbrRetouch<Layer>(root, {
    capture: captureRegion,
    deposit: paintStamps,
    tileKeys: dab => dabTiles(dab).filter(allowsTile)
  }, options);
  let pickup: ReturnType<typeof createCanvasPickup<Layer>> | undefined;
  let animateSelection = true;
  // Match virtual pages so touching a magnified tile does not change existing artwork's filtering.
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' });
  const mipmaps = createTileMipmaps(root);
  const generateMipmaps = options.batchedMipmaps === false ? undefined : mipmaps;
  const ensureMipmaps = (tile: { texture: TgpuTexture & RenderFlag; mipLevelReady: number }, requested: number, encoder?: GPUCommandEncoder) => {
    const last = Math.max(0, Math.min((tile.texture.props.mipLevelCount ?? 1) - 1, requested));
    if (last <= tile.mipLevelReady) return;
    if (generateMipmaps) generateMipmaps(tile.texture, tile.mipLevelReady, last, encoder);
    else tile.texture.generateMipmaps(tile.mipLevelReady, last - tile.mipLevelReady + 1);
    tile.mipLevelReady = last;
  };
  const displayCache = createDisplayCache(root, sampler, generateMipmaps);
  const cache = new Map<string, ReturnType<typeof createTile>>();
  const samplingScratch: ReturnType<typeof createStrokeScratch>[] = [];
  let smudgeDeposits: ReturnType<typeof createSmudgeDepositBatch> | undefined;
  let sharedScratch = false;
  let residentLimit = Math.max(1, options.cacheTiles ?? MAX_RESIDENT_TILES);
  const scratchLimit = Math.min(32, residentLimit);
  const reserveSamplingScratch = commandSlots(scratchLimit);
  const spareTiles: ReturnType<typeof createTile>[] = [];
  const tailTiles = new Map<string, Dab[]>();
  // A small reusable pool, independent of committed scratch and its eviction/readback lifecycle.
  const tailPool: ReturnType<typeof createTile>[] = [];
  const strokeTiles = new Map<
    string,
    {
      before: TileData | undefined;
      mask?: Uint8Array;
      coverage?: AbrCoverageSnapshot;
      output?: Uint8Array;
      pending?: Promise<Result<void>>;
    }
  >();
  const evictionSize = Math.min(16, Math.max(1, Math.floor((options.cacheTiles ?? MAX_RESIDENT_TILES) / 8)));
  const readbacks = createReadbackQueue(device, evictionSize * 4);
  let stroke: { layer: Layer; brush: Brush } | undefined;
  let view: ReturnType<typeof createView> | undefined;
  let presentedCamera = '';
  let holdPresentation = '';
  const virtual = options.virtualTexture
    ? createVirtualTexture(
        root,
        async (pixels) => (pixels instanceof Uint8Array ? pixels : options.readTile!(pixels)),
        () => {
          invalidateViews();
          options.onRefine?.();
        },
        (error) => options.onError?.(error),
        options.overviewStorage
      )
    : undefined;
  let viewFallback = virtual ? createViewFallback(root) : undefined;
  let completeView: { camera: Camera; size: ViewSize } | undefined;
  const primaryCanvas = canvas;
  type TargetState = {
    context: GPUCanvasContext;
    view: typeof view;
    fallback: typeof viewFallback;
    complete: typeof completeView;
    presented: string;
    hold: string;
    damage: ReturnType<typeof createViewDamage>;
    pages: ReturnType<ReturnType<typeof createVirtualTexture>['debug']>;
  };
  const targets = new Map<typeof canvas, TargetState>();
  targets.set(canvas, {
    context,
    view,
    fallback: viewFallback,
    complete: undefined,
    presented: '',
    hold: '',
    damage: createViewDamage(),
    pages: []
  });
  // Drawing is serialized by the document runtime. Targets share tile caches, pipelines and device;
  // only their composed viewport/fallback survives between presentations.
  const selectTarget = (next: typeof canvas) => {
    if (next === canvas && targets.has(next)) return;
    let target = targets.get(next);
    if (!target) {
      const nextContext = next.getContext('webgpu');
      if (!nextContext) throw new Error('The canvas target could not start WebGPU.');
      nextContext.configure({ device, format, alphaMode: 'opaque' });
      target = {
        context: nextContext,
        view: undefined,
        fallback: virtual ? createViewFallback(root) : undefined,
        complete: undefined,
        presented: '',
        hold: '',
        damage: createViewDamage(),
        pages: []
      };
      targets.set(next, target);
    }
    const current = targets.get(canvas);
    if (current)
      Object.assign(current, {
        view,
        fallback: viewFallback,
        complete: completeView,
        presented: presentedCamera,
        hold: holdPresentation
      });
    canvas = next;
    context = target.context;
    view = target.view;
    viewFallback = target.fallback;
    completeView = target.complete;
    presentedCamera = target.presented;
    holdPresentation = target.hold;
  };
  const invalidateOtherTargets = () => {
    for (const [targetCanvas, target] of targets)
      if (targetCanvas !== canvas) {
        target.complete = undefined;
        target.hold = '';
        target.fallback?.clear();
      }
  };
  const markTile = (key: string) => {
    for (const target of targets.values()) target.damage.mark(key);
  };
  function invalidateViews() {
    for (const target of targets.values()) target.damage.invalidate();
  }
  const setTail = (dabs: readonly Dab[]) => {
    for (const key of tailTiles.keys()) markTile(key);
    tailTiles.clear();
    for (const dab of dabs)
      for (const key of dabTiles(dab)) {
        if (!allowsTile(key)) continue;
        const list = tailTiles.get(key) ?? [];
        list.push(dab);
        tailTiles.set(key, list);
        markTile(key);
      }
  };
  let frame = 0;
  let viewportUpdate = { full: false, pixels: 0 };
  let previewTileDraws = 0,
    sourceTileDraws = 0;
  const brushBuffer = root.createBuffer(shader.brushLayout.entries.settings.uniform).$usage('uniform');
  const brushGroup = root.createBindGroup(shader.brushLayout, { settings: brushBuffer });
  const readTile = async (pixels: TileData | undefined) =>
    pixels === undefined
      ? undefined
      : pixels instanceof Uint8Array
        ? pixels
        : options.readTile
          ? options.readTile(pixels)
          : Promise.reject(new Error('Missing tile storage reader.'));
  const keyFor = (layer: Layer, key: string) => `${layer.id}/${key}`;

  /** Evicts least-recently-used tiles. Active mask readback occurs only when the cache is full. */
  const ensure = async (layer: Layer, key: string, batch?: ReturnType<typeof commandBatch>) => {
    const id = keyFor(layer, key);
    let tile = cache.get(id);
    if (tile) {
      tile.used = ++frame;
      return tile;
    }
    if (cache.size >= residentLimit) {
      // Submit every command referencing victims before readback or recycling their resources.
      batch?.flush();
      // Amortize readback synchronization over a small LRU batch as the stroke grows.
      const count = evictionSize;
      const victims = [...cache].sort((a, b) => a[1].used - b[1].used).slice(0, count);
      // A tile loaded only for pickup still matches its saved snapshot. Reading it
      // back again makes large smudge footprints thrash the CPU/GPU boundary.
      const active = victims.filter(([id, tile]) => strokeTiles.has(id) && tile.strokeDirty);
      if (active.length) {
        const coverage = abrActive ? abrStamps!.coveragePlan(transientCoverage) : undefined;
        const roundMask = !abrActive && !transientCoverage;
        const channels = 1 + (coverage?.count ?? Number(roundMask));
        const snapshots = active.map(([id]) => ({ id, snapshot: strokeTiles.get(id)! }));
        const job = await readbacks.capture(active.flatMap(([, tile]) => [
          root.unwrap(tile.texture),
          ...(coverage?.count ? coverage.sources(tile.scratch!.abr!.coverage) : roundMask ? [root.unwrap(tile.scratch!.mask)] : [])
        ]));
        const pending = attempt(async () => {
          const result = await job.ready;
          // Cancellation removes the snapshot; late outcomes belong to that discarded stroke.
          if (disposed || !snapshots.some(({ id, snapshot }) => strokeTiles.get(id) === snapshot)) return;
          if (!result.ok) {
            options.onError?.(result.error);
            throw result.error;
          }
          const pixels = result.value;
          snapshots.forEach(({ id, snapshot }, index) => {
            if (strokeTiles.get(id) !== snapshot || snapshot.pending !== pending) return;
            const at = index * channels;
            snapshot.output = pixels[at]!;
            snapshot.mask = roundMask ? pixels[at + 1] : undefined;
            snapshot.coverage = coverage?.snapshot(pixels, at + 1);
            snapshot.pending = undefined;
          });
        });
        // Failed results stay attached until finish/revisit explicitly observes them.
        for (const { snapshot } of snapshots) snapshot.pending = pending;
      }
      for (const [id, tile] of victims) {
        spareTiles.push(tile);
        cache.delete(id);
      }
    }
    const active = strokeTiles.get(id);
    if (active?.pending) unwrapResult(await active.pending);
    const pixels = await readTile(active?.output ?? layer.tiles.get(key));
    tile = spareTiles.pop();
    if (tile) {
      replacePixels(device, root.unwrap(tile.texture), pixels, batch);
      tile.mipLevelReady = 0;
    } else tile = createTile(root, pixels, sampler);
    tile.strokeDirty = false;
    try {
      tile.used = ++frame;
      if (active && !sharedScratch) {
        const scratch = prepareStroke(root, tile);
        if (!transientCoverage) {
          replacePixels(device, root.unwrap(scratch.base), await readTile(active.before), batch);
          if (!abrActive) replacePixels(device, root.unwrap(scratch.mask), active.mask, batch);
        }
        if (abrActive) {
          scratch.abr ??= abrStamps!.createTile(scratch.base, scratch.mask, STAMP_CAPACITY);
          if (!transientCoverage) scratch.abr.coverage.restore(active.coverage, unpackTile, batch);
        }
      }
      cache.set(id, tile);
      return tile;
    } catch (error) {
      // A failed source read must not orphan an allocated slot outside the bounded pool.
      // Paint's finally block still submits any queued clears before the next command can reuse it.
      spareTiles.push(tile);
      throw error;
    }
  };

  /** Builds display-only output with the same accumulated mask and opacity as the real stroke. */
  const prepareTail = (
    original: ReturnType<typeof createTile>,
    active: boolean,
    tail: readonly Dab[],
    slot: number,
    x: number,
    y: number
  ) => {
    const temporary: ReturnType<typeof createTile> =
      tailPool[slot] ?? (tailPool[slot] = createTile(root, undefined, sampler));
    const scratch = prepareStroke(root, temporary);
    const commands = commandBatch(device);
    commands
      .encoder()
      .copyTextureToTexture(
        { texture: root.unwrap(active ? original.scratch!.base : original.texture) },
        { texture: root.unwrap(scratch.base) },
        [TILE_SIZE, TILE_SIZE]
      );
    if (abrActive) {
      scratch.abr ??= abrStamps!.createTile(scratch.base, scratch.mask, STAMP_CAPACITY);
      scratch.abr.coverage.copyFrom(active ? original.scratch!.abr!.coverage : undefined, commands);
    } else if (active)
      commands.encoder().copyTextureToTexture(
        { texture: root.unwrap(original.scratch!.mask) }, { texture: root.unwrap(scratch.mask) }, [TILE_SIZE, TILE_SIZE]
      );
    else clearAttachment(commands.encoder(), scratch.maskRender);
    for (let offset = 0; offset < tail.length; offset += STAMP_CAPACITY) {
      if (offset) commands.flush();
      const stamps = tail.slice(offset, offset + STAMP_CAPACITY);
      if (abrActive) {
        abrStamps!.draw(scratch.abr!, commands, stamps, x, y);
        continue;
      }
      const data = new Float32Array(stamps.length * 4);
      stamps.forEach((dab, i) => data.set([dab.x - x * TILE_SIZE, dab.y - y * TILE_SIZE, dab.radius, dab.flow], i * 4));
      device.queue.writeBuffer(root.unwrap(scratch.stamps), 0, data);
      const pass = commands.encoder().beginRenderPass({
        colorAttachments: [{ view: scratch.maskRender, loadOp: 'load', storeOp: 'store' }]
      });
      if (texturedPipeline) texturedPipeline.with(pass).with(shader.stampLayout, scratch.stamps).draw(6, stamps.length);
      else pipelines.stamp.with(pass).with(brushGroup).with(shader.stampLayout, scratch.stamps).draw(6, stamps.length);
      pass.end();
    }
    const pass = commands
      .encoder()
      .beginRenderPass({ colorAttachments: [{ view: temporary.render, loadOp: 'clear', storeOp: 'store' }] });
    const clip = clipPaintBounds(paintBounds, x, y)!;
    pass.setScissorRect(clip.x, clip.y, clip.width, clip.height);
    if (abrActive) abrStamps!.composite(scratch.abr!, pass);
    else pipelines.stroke.with(pass).with(brushGroup).with(scratch.strokeGroup).draw(3);
    pass.end();
    commands.flush();
    temporary.mipLevelReady = 0;
    return temporary;
  };

  /** Rasterizes one ordered operation; sampling tools reset their coverage for each transport step. */
  async function paintStamps(
    dabs: readonly Dab[],
    sampled?: NonNullable<Parameters<ReturnType<typeof createAbrStamps>['composite']>[2]>,
    onlyTile?: string,
    batch?: ReturnType<typeof commandBatch>
  ) {
    if (!stroke || !dabs.length) return;
    const direct =
      !!sampled && smudgeActive && options.directSmudge !== false && abrStamps!.canDrawDirect() &&
      dabs.length === 1 && !dabs[0]!.abr?.secondary;
    const groups = new Map<string, Dab[]>();
    if (onlyTile !== undefined) {
      const [x, y] = coordinates(onlyTile);
      const touching = dabs.filter((dab) => dabIntersectsTile(dab, x, y));
      if (touching.length && allowsTile(onlyTile)) groups.set(onlyTile, touching);
    } else
      for (const dab of dabs)
        for (const key of dabTiles(dab)) {
        if (!allowsTile(key)) continue;
          let group = groups.get(key);
          if (!group) {
            group = [];
            groups.set(key, group);
          }
          group.push(dab);
        }
    const commands = batch ?? commandBatch(device);
    if (!paintBounds && direct && sharedScratch && options.batchSmudgeTiles !== false && groups.size >= 8 &&
        residentLimit >= 8 && !historySource && abrStamps!.canBatchDirect()) {
      const dab = dabs[0]!;
      // Batch eviction can retire several LRU tiles together. Leave that many spare slots
      // so every newly acquired destination stays resident until its copy-back is encoded.
      const capacity = Math.min(32, residentLimit - evictionSize + 1);
      smudgeDeposits ??= createSmudgeDepositBatch(root, abrStamps!);
      try {
        for (const chunk of planSmudgeDeposits(dab, groups.keys(), capacity)) {
          const tiles: Awaited<ReturnType<typeof ensure>>[] = [];
          for (const { key } of chunk.tiles) tiles.push(await ensure(stroke.layer, key, commands));
          for (const { key } of chunk.tiles) {
            const id = keyFor(stroke.layer, key);
            if (!strokeTiles.has(id)) strokeTiles.set(id, { before: stroke.layer.tiles.get(key) });
          }
          smudgeDeposits.draw(commands, dab, sampled!, chunk, tiles.map(tile => root.unwrap(tile.texture)));
          chunk.tiles.forEach(({ key }, index) => {
            tiles[index]!.mipLevelReady = 0;
            tiles[index]!.strokeDirty = true;
            displayCache.remove(keyFor(stroke!.layer, key), batch?.flush);
            markTile(key);
          });
        }
      } finally {
        if (!batch) commands.flush();
      }
      return;
    }
    const directStamp = direct ? abrStamps!.prepareDirect(dabs[0]!) : undefined;
    let pendingTiles = 0;
    try {
      for (const [key, dabs] of groups) {
        const [tx, ty] = coordinates(key);
        const stampRegion = expandToRasterGrid(
          direct ? directStampBounds(dabs[0]!, tx, ty) : stampBounds(dabs, tx, ty),
          abrActive ? abrStamps!.rasterScale() : 1
        );
        const bounds = stampRegion && clipPaintBounds(paintBounds, tx, ty, stampRegion);
        if (!bounds) continue;
        let historyPickup: typeof sampled;
        if (historySource) {
          // A single scratch texture is reused; submit every prior reader before uploading the next tile.
          commands.flush();
          historyTexture ??= historyTarget(root);
          replacePixels(device, root.unwrap(historyTexture), await readTile(historySource.tiles.get(key)));
          const [x, y] = coordinates(key);
          historyPickup = {
            patch: {
              texture: historyTexture,
              width: TILE_SIZE,
              height: TILE_SIZE,
              region: { x: x * TILE_SIZE, y: y * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }
            },
            x: x * TILE_SIZE,
            y: y * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE,
            strength: 1,
            fingerPainting: false,
            history: true
          };
        }
        const id = keyFor(stroke.layer, key);
        const tile = await ensure(stroke.layer, key, commands);
        const scratch = sharedScratch
          ? (samplingScratch[reserveSamplingScratch(commands)] ??= createStrokeScratch(root))
          : prepareStroke(root, tile);
        if (abrActive) scratch.abr ??= abrStamps!.createTile(scratch.base, scratch.mask, STAMP_CAPACITY);
        const firstTouch = !strokeTiles.has(id);
        if (firstTouch || sharedScratch) {
          if (firstTouch) strokeTiles.set(id, { before: stroke.layer.tiles.get(key) });
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
            if (abrActive) scratch.abr!.coverage.clear(commands);
            else clearAttachment(commands.encoder(), scratch.maskRender);
          }
        }
        if (sampled && !firstTouch && !sharedScratch && bounds) {
          // Smudge composites each step over the previous step. Immutable history remains in strokeTiles.before.
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
          if (offset) commands.flush();
          const stamps = dabs.slice(offset, offset + STAMP_CAPACITY);
          if (abrActive) {
            abrStamps!.draw(scratch.abr!, commands, stamps, tx, ty);
            continue;
          }
          const data = new Float32Array(stamps.length * 4);
          stamps.forEach((dab, index) =>
            data.set([dab.x - tx * TILE_SIZE, dab.y - ty * TILE_SIZE, dab.radius, dab.flow], index * 4)
          );
          device.queue.writeBuffer(root.unwrap(scratch.stamps), 0, data);
          const pass = commands.encoder().beginRenderPass({
            colorAttachments: [{ view: scratch.maskRender, loadOp: 'load', storeOp: 'store' }]
          });
          if (texturedPipeline)
            texturedPipeline.with(pass).with(shader.stampLayout, scratch.stamps).draw(6, stamps.length);
          else
            pipelines.stamp.with(pass).with(brushGroup).with(shader.stampLayout, scratch.stamps).draw(6, stamps.length);
          pass.end();
        }
        // Output depends on the final accumulated mask, so composite once per touched region.
        // Keep previous output outside this region, including ink from earlier input batches.
        if (bounds) {
          if (direct) abrStamps!.prepareTile(scratch.abr!, commands, tx, ty);
          const pass = commands.encoder().beginRenderPass({
            colorAttachments: [{ view: tile.render, loadOp: 'load', storeOp: 'store' }]
          });
          pass.setScissorRect(bounds.x, bounds.y, bounds.width, bounds.height);
          if (abrActive) {
            const captured = historyPickup ?? sampled;
            const pickup = captured
              ? {
                  ...captured,
                  x: tx * TILE_SIZE - captured.x,
                  y: ty * TILE_SIZE - captured.y
                }
              : undefined;
            if (direct) abrStamps!.draw(scratch.abr!, commands, dabs, tx, ty, { pass, pickup: pickup!, stamps: directStamp });
            else abrStamps!.composite(scratch.abr!, pass, pickup);
          } else pipelines.stroke.with(pass).with(brushGroup).with(scratch.strokeGroup).draw(3);
          pass.end();
        }
        tile.mipLevelReady = 0;
        tile.strokeDirty = true;
        displayCache.remove(id, batch?.flush);
        markTile(key);
        if (++pendingTiles === (sharedScratch ? scratchLimit : 32)) {
          commands.flush();
          pendingTiles = 0;
        }
      }
    } finally {
      // An I/O failure must not discard commands for previously processed tiles in this batch.
      if (!batch) commands.flush();
    }
  }

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
      const id = keyFor(layer, key);
      const snapshot = strokeTiles.get(id);
      if (!layer.tiles.has(key) && !snapshot) return undefined;
      let tile;
      if (cache.has(id)) tile = await ensure(layer, key);
      else if (options.displayCache === false) {
        flush();
        tile = await ensure(layer, key);
      } else {
        // Pickup is read-only. Restoring brush scratch here evicts destination
        // tiles for every large footprint, causing repeated GPU readback/reupload.
        // Reuse the bounded immutable cache, always at full document resolution.
        if (snapshot?.pending) unwrapResult(await snapshot.pending);
        const source = snapshot?.output ?? layer.tiles.get(key);
        // Only immutable nonresident snapshots may prove emptiness. Resident GPU
        // ink can already be newer than the last packed snapshot.
        if (!source || isEmptyPackedTile(source)) return undefined;
        const beforeInvalidate = options.batchPickupUploads === false ? () => flush() : flush;
        tile = displayCache.find(id, source, 1, beforeInvalidate);
        if (!tile) {
          // Only destruction of an encoded source requires submission; fresh uploads can stay in the batch.
          if (options.batchPickupUploads === false) flush();
          const pixels = (await readTile(source))!;
          if (isEmptyPackedTile(pixels)) return undefined;
          tile = displayCache.get(id, pixels, 1, source, beforeInvalidate);
        }
      }
      if (minify) {
        const last = options.adaptivePickupMipmaps === false ? 8 : requiredMip;
        if (last > tile.mipLevelReady) {
          // Earlier dabs may still be encoded. Mipmap generation submits independently.
          flush();
          ensureMipmaps(tile, last);
        }
      }
      return tile.texture;
    });
    return pickup.capture(region, layers, { allLayers, exact, linear, commands, maxDimension });
  }

  return {
    /** Captures transient tool paint for a planned renderer replacement, never for document autosave. */
    async snapshotTools() {
      if (stroke) throw new Error('Finish or cancel the stroke before replacing the renderer.');
      return retouch.snapshot();
    },
    /** Validates the complete payload before mutating any device resources. Empty state clears prior tools. */
    restoreTools(input: unknown) {
      if (stroke) throw new Error('Finish or cancel the stroke before restoring tool paint.');
      retouch.restore(input);
    },
    /** Changes idle Mixer wells without starting a stroke or touching document/history state. */
    mixerCommand(...args: Parameters<typeof retouch.mixerCommand>) {
      retouch.mixerCommand(...args);
    },
    /** Loads a single document pixel or a brush-sized color patch; presentation/background pixels are excluded. */
    async loadMixerFromCanvas(options: Parameters<typeof retouch.loadMixerFromCanvas>[0]) {
      if (stroke) throw new Error('Finish or cancel the stroke before loading canvas paint.');
      await retouch.loadMixerFromCanvas(options);
    },
    /** Detaches a target after any in-flight render. The caller owns its canvas element. */
    releaseTarget(targetCanvas: OffscreenCanvas | HTMLCanvasElement) {
      const target = targets.get(targetCanvas);
      if (!target) return;
      if (targetCanvas === canvas) {
        view?.destroy();
        viewFallback?.destroy();
        view = undefined;
        viewFallback = undefined;
        completeView = undefined;
        holdPresentation = '';
        presentedCamera = '';
      } else {
        target.view?.destroy();
        target.fallback?.destroy();
      }
      target.context.unconfigure();
      targets.delete(targetCanvas);
    },
    /** Replaces display-only stamps; these never enter readback, history or saved tiles. */
    preview(dabs: readonly Dab[]) {
      setTail(stroke ? dabs : []);
    },
    /** Keeps transient selection geometry on this device, outside committed artwork and exports. */
    setSelection(points: readonly Point[], animate = true) {
      lasso.set(points);
      animateSelection = animate;
    },
    /** Makes the current low-resolution image resident, rebuilding only edited branches. */
    prepareOverview: async (layers: Layer[]) => {
      await virtual?.prepare(layers);
    },
    /** Resident texture budget is bounded; the count also includes active-stroke resources. */
    stats() {
      return {
        residentTiles: cache.size + spareTiles.length,
        samplingScratchTiles: samplingScratch.length,
        readback: readbacks.stats(),
        previewTileDraws,
        viewportUpdate,
        sourceTileDraws,
        virtual: virtual?.stats(),
        displayTiles: displayCache.stats().tiles,
        brushTextures: abrActive ? abrStamps?.stats() : texturedStamps?.stats(),
        gpuBytes:
          (texturedStamps?.stats().bytes ?? 0) +
          (abrStamps?.stats().bytes ?? 0) +
          lasso.bytes() +
          readbacks.stats().bytes +
          (virtual?.stats().gpuBytes ?? 0) +
          (viewFallback?.bytes() ?? 0) +
          (view ? view.width * view.height * 16 : 0) +
          [...targets].reduce(
            (sum, [targetCanvas, target]) =>
              sum +
              (targetCanvas === canvas
                ? 0
                : (target.fallback?.bytes() ?? 0) + (target.view ? target.view.width * target.view.height * 16 : 0)),
            0
          ) +
          displayCache.stats().bytes +
          (pickup?.bytes() ?? 0) +
          retouch.bytes() +
          (historyTexture ? TILE_SIZE * TILE_SIZE * 4 : 0) +
          (smudgeDeposits?.bytes() ?? 0) +
          samplingScratch.reduce((sum, scratch) => sum + scratchBytes(scratch), 0) +
          [...cache.values(), ...spareTiles, ...tailPool].reduce(
            (sum, tile) => sum + (TILE_SIZE * TILE_SIZE * 4 * 4) / 3 + (tile.scratch ? scratchBytes(tile.scratch) : 0),
            0
          )
      };
    },
    debugPages: () => targets.get(canvas)?.pages ?? [],
    /** Occupied visible-layer tiles, including the active stroke, for the optional wireframe overlay. */
    debugTiles(layers: Layer[]) {
      const keys = new Set<string>();
      for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        for (const key of layer.tiles.keys()) keys.add(key);
        if (stroke?.layer.id === layer.id) for (const id of strokeTiles.keys()) keys.add(id.slice(layer.id.length + 1));
      }
      return [...keys];
    },
    /** Captures brush settings and the target layer until commit/cancel. Optional native coverage replaces hardness.
     * Textured dabs must carry the tip's circumscribed radius; use texturedBrush to map brush size correctly.
     */
    begin(layer: Layer, brush: Brush, tip?: { resource: BrushResource; angle: number }, abr?: AbrRasterSettings<Layer>) {
      if (stroke) throw new Error('Finish the current stroke before beginning another.');
      if (abr) (abrStamps ??= createAbrStamps(root, options.batchSampledMasks)).prepare(abr);
      abrActive = !!abr;
      smudgeActive = !!abr?.smudge;
      transientCoverage = !!(abr?.smudge || abr?.filter || abr?.mixer) && !(abr?.values.useDualBrush && abr.dual);
      const nextShared = transientCoverage && options.sharedScratch !== false;
      if (nextShared !== sharedScratch) {
        // Keep the previous texture budget: each freed four-texture scratch set buys three mipmapped tiles.
        residentLimit = Math.max(
          1,
          options.cacheTiles ?? (nextShared ? MAX_RESIDENT_TILES * 4 - scratchLimit * 3 : MAX_RESIDENT_TILES)
        );
        for (const tile of spareTiles) destroyTile(tile);
        spareTiles.length = 0;
        if (nextShared) {
          for (const tile of cache.values()) {
            if (tile.scratch) destroyStrokeScratch(tile.scratch);
            tile.scratch = undefined;
          }
        } else {
          for (const scratch of samplingScratch) destroyStrokeScratch(scratch);
          samplingScratch.length = 0;
          const victims = [...cache].sort((a, b) => a[1].used - b[1].used);
          for (const [id, tile] of victims.slice(0, Math.max(0, cache.size - residentLimit))) {
            destroyTile(tile);
            cache.delete(id);
          }
        }
        sharedScratch = nextShared;
      }
      historySource = abr?.historySource;
      texturedPipeline = tip
        ? (texturedStamps ??= createTexturedStamps(root)).prepare(tip.resource, tip.angle)
        : undefined;
      setTail([]);
      if (virtual)
        for (const [targetCanvas, target] of targets)
          if (!(targetCanvas === canvas ? completeView : target.complete)) target.damage.invalidate();
      invalidateOtherTargets();
      completeView = undefined;
      viewFallback?.clear();
      stroke = { layer, brush: { ...brush } };
      const rgb = hexColor(brush.color);
      brushBuffer.write({
        color: d.vec4f(...rgb, 1),
        params: d.vec4f(
          brush.hardness,
          brush.opacity,
          brush.tool === 'eraser' ? 1 : 0,
          brush.mixing === 'linear' ? 1 : 0
        )
      });
      retouch.begin(abr, brush.color, sharedScratch);
    },
    /** Samples current pixels for canvas-dependent tools, excluding disposable previews.
     * The borrowed GPU patch remains valid until the next capture or renderer disposal.
     * Call only between submitted paint operations; all renderer operations are serialized by the runtime.
     */
    captureRegion,
    /** Reads one committed active-layer pixel, excluding display/background and uncommitted stroke pixels.
     * Resolves cold tile references through storage; does not introduce a GPU readback.
     */
    async readCommittedPixel(layer: Layer, point: Point): Promise<Uint8Array> {
      const x = Math.floor(point.x),
        y = Math.floor(point.y);
      const tx = Math.floor(x / TILE_SIZE),
        ty = Math.floor(y / TILE_SIZE);
      const pixels = await readTile(layer.tiles.get(`${tx},${ty}`));
      const offset = ((y - ty * TILE_SIZE) * TILE_SIZE + x - tx * TILE_SIZE) * 4;
      return pixels ? unpackTile(pixels).slice(offset, offset + 4) : new Uint8Array(4);
    },
    /** Paint accumulates by tile; canvas-sampling tools transport pixels in stamp order. */
    async paint(dabs: readonly Dab[]) {
      if (!retouch.active) {
        if (!abrActive || !options.onPaintProgress) return paintStamps(dabs);
        // Small sampled tips can share more upload/submission work without a large GPU workload.
        // Larger stamps retain the smaller progress batches.
        const batchSize = abrStamps!.paintBatchSize(dabs);
        for (let offset = 0; offset < dabs.length; offset += batchSize) {
          await paintStamps(dabs.slice(offset, offset + batchSize));
          await options.onPaintProgress();
        }
        return;
      }
      await retouch.paint(dabs);
    },
    /** Commits touched pixels in bounded readback chunks; retains reusable GPU resources for subsequent strokes. */
    async finish(): Promise<TileChange[]> {
      if (!stroke) return [];
      setTail([]);
      for (const result of await Promise.all([...strokeTiles.values()].map((snapshot) => snapshot.pending)))
        if (result) unwrapResult(result);
      const changes: TileChange[] = [];
      const resident = [...strokeTiles.keys()].filter((id) => cache.has(id));
      // Expanding pixel residency must not expand the temporary commit buffer beyond its previous 32 MiB.
      const outputs = new Map<string, Uint8Array>();
      for (let offset = 0; offset < resident.length; offset += MAX_RESIDENT_TILES) {
        const ids = resident.slice(offset, offset + MAX_RESIDENT_TILES);
        const pixels = await readTextures(
          device,
          ids.map((id) => root.unwrap(cache.get(id)!.texture))
        );
        ids.forEach((id, index) => outputs.set(id, packTile(pixels[index]!)));
      }
      for (const [id, data] of strokeTiles) {
        const after = outputs.get(id) ?? data.output;
        const key = id.slice(stroke.layer.id.length + 1);
        if (after)
          changes.push({
            layerId: stroke.layer.id,
            key,
            before: data.before,
            after: hasAlpha(unpackTile(after)) ? packTile(after) : undefined
          });
      }
      strokeTiles.clear();
      retouch.finish();
      stroke = undefined;
      historySource = undefined;
      virtual?.invalidate();
      holdPresentation = presentedCamera;
      for (const [targetCanvas, target] of targets) {
        if (targetCanvas !== canvas) target.hold = target.presented;
        // VT can change representation at commit. Other targets must retain their preview until ready too.
        if (virtual) target.damage.invalidate();
      }
      for (const change of changes) markTile(change.key);
      return changes;
    },
    /** Discards preview pixels and restores the committed document on the next render. */
    cancel() {
      retouch.cancel();
      invalidateOtherTargets();
      setTail([]);
      if (strokeTiles.size) {
        completeView = undefined;
        viewFallback?.clear();
      }
      holdPresentation = '';
      for (const id of strokeTiles.keys()) markTile(id.slice(stroke!.layer.id.length + 1));
      for (const id of strokeTiles.keys()) {
        displayCache.remove(id);
        const tile = cache.get(id);
        if (tile) destroyTile(tile);
        cache.delete(id);
      }
      strokeTiles.clear();
      readbacks.clear();
      stroke = undefined;
      historySource = undefined;
    },
    /** Invalidates cached pixels after undo, redo, import, or layer deletion. */
    reset() {
      retouch.cancel();
      invalidateOtherTargets();
      setTail([]);
      completeView = undefined;
      viewFallback?.clear();
      holdPresentation = '';
      virtual?.invalidate();
      displayCache.clear();
      invalidateViews();
      for (const tile of [...cache.values(), ...spareTiles]) destroyTile(tile);
      cache.clear();
      spareTiles.length = 0;
      for (const scratch of samplingScratch) destroyStrokeScratch(scratch);
      samplingScratch.length = 0;
      strokeTiles.clear();
      readbacks.clear();
      stroke = undefined;
      historySource = undefined;
    },
    /** Rebuilds the viewport without evicting tile resources. Also permits comparison with a full redraw. */
    invalidateView() {
      invalidateViews();
    },
    /** Captures the target LOD used for drawing this layer, including viewport and sparse-page budgets. */
    brushLod(layers: Layer[], layer: Layer, camera: Camera, size: ViewSize, dpr: number) {
      const scale = renderScale(size, dpr, device.limits.maxTextureDimension2D);
      return virtual && layers.filter(l => l.visible && l.opacity > 0).length <= 24
        ? virtual.brushLod(layers, layer, camera, size, scale) : viewLod(camera.zoom, scale);
    },
    /** Rebuilds changed screen regions; camera/layer changes rebuild the full view. Cached output survives tile eviction. */
    async render(layers: Layer[], camera: Camera, size: ViewSize, dpr: number, exact = false, target = primaryCanvas) {
      if (disposed) throw new Error('The renderer is disposed.');
      selectTarget(target);
      const scale = renderScale(size, dpr, device.limits.maxTextureDimension2D);
      const width = Math.max(1, Math.round(size.width * scale)),
        height = Math.max(1, Math.round(size.height * scale));
      if (!view || view.width !== width || view.height !== height) {
        if (view && completeView)
          viewFallback?.capture(root.unwrap(view.composed), completeView.camera, completeView.size);
        completeView = undefined;
        view?.destroy();
        canvas.width = width;
        canvas.height = height;
        view = createView(root, width, height);
        presentedCamera = '';
        holdPresentation = '';
      }
      const cameraSignature = JSON.stringify([camera, size, width, height]);
      const signature = JSON.stringify([
        exact,
        virtual?.stats().uploadedBytes,
        camera,
        size,
        width,
        height,
        layers.map(({ id, visible, opacity, blend }) => [id, visible, opacity, blend])
      ]);
      const damage = targets.get(canvas)!.damage;
      const plan = damage.plan(signature, camera, size, { width, height });
      const region = plan.region;
      previewTileDraws = 0;
      sourceTileDraws = 0;
      viewportUpdate = { full: plan.full, pixels: region ? region.width * region.height : 0 };
      const present = () => {
        // Both passes target the same swapchain texture. The cached artwork never contains the outline.
        const target = context!.getCurrentTexture().createView();
        pipelines.present.with(view!.present).withColorAttachment({ view: target, loadOp: 'clear' }).draw(3);
        if (!exact) lasso.render(target, camera, size, width, height, animateSelection ? performance.now() / 1000 : 0);
      };
      if (!region) {
        present();
        damage.presented(plan);
        return;
      }
      const left = (region.x * size.width) / width,
        top = (region.y * size.height) / height;
      const right = ((region.x + region.width) * size.width) / width,
        bottom = ((region.y + region.height) * size.height) / height;
      const corners = [
        screenToWorld({ x: left, y: top }, camera, size),
        screenToWorld({ x: right, y: top }, camera, size),
        screenToWorld({ x: left, y: bottom }, camera, size),
        screenToWorld({ x: right, y: bottom }, camera, size)
      ];
      const minX = Math.min(...corners.map((p) => p.x)),
        maxX = Math.max(...corners.map((p) => p.x));
      const minY = Math.min(...corners.map((p) => p.y)),
        maxY = Math.max(...corners.map((p) => p.y));
      const clear = device.createCommandEncoder();
      clearAttachment(clear, view.aRender);
      device.queue.submit([clear.finish()]);
      const stream = virtual && layers.filter((layer) => layer.visible && layer.opacity > 0).length <= 24;
      virtual?.begin(layers);
      let read = view.a,
        write = view.b;
      for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        const active = stroke?.layer.id === layer.id;
        let streamed = false;
        if (stream && !exact) {
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: view.layerRender, loadOp: 'clear', storeOp: 'store' }]
          });
          pass.setScissorRect(region.x, region.y, region.width, region.height);
          const covered = virtual.draw(layer, pass, camera, size, scale);
          // A cold layer keeps the original complete-tile path until background coverage is ready.
          streamed = !active || covered;
          pass.end();
          device.queue.submit([encoder.finish()]);
        }
        if (!streamed || active) {
          // Committed pixels already come from the pyramid. Only the active stroke's output
          // replaces those pixels; scanning/loading every document tile here defeats virtual texturing.
          const visible = visibleTileKeys(layer, active ? strokeTiles : undefined,
            active && !exact ? tailTiles : undefined, streamed, { minX, maxX, minY, maxY });
          if (!visible.length && !streamed) continue;
          const batchSize = Math.min(
            tailTiles.size && !exact ? 8 : 64,
            Math.max(1, options.cacheTiles ?? MAX_RESIDENT_TILES)
          );
          for (let offset = 0; offset < visible.length; offset += batchSize) {
            const batch = [];
            let tailSlot = 0;
            for (const key of visible.slice(offset, offset + batchSize)) {
              const [x, y] = coordinates(key);
              const id = keyFor(layer, key);
              // Display evicted active output without restoring its full-size brush mask/base.
              // Only actual painting may bring that scratch state back into the working set.
              const snapshot = strokeTiles.get(id);
              // An evicted tile owns a pending snapshot, not an empty/committed replacement.
              if (!cache.has(id) && snapshot?.pending) unwrapResult(await snapshot.pending);
              const source = snapshot?.output ?? layer.tiles.get(key)!;
              const tail = active && !exact ? tailTiles.get(key) : undefined;
              let tile =
                tail || cache.has(id) || options.displayCache === false
                  ? await ensure(layer, key)
                  : (displayCache.find(id, source, camera.zoom * scale) ??
                    displayCache.get(id, (await readTile(source))!, camera.zoom * scale, source));
              if (tail) tile = prepareTail(cache.get(id)!, !!snapshot, tail, tailSlot++, x, y);
              tile.camera.write({
                size: d.vec2f(size.width, size.height),
                zoom: camera.zoom,
                angle: camera.angle,
                mirror: camera.mirrored ? -1 : 1,
                padding: 0,
                offset: d.vec2f(x * TILE_SIZE - camera.x, y * TILE_SIZE - camera.y)
              });
              batch.push(tile);
            }
            const encoder = device.createCommandEncoder();
            // Load the entire bounded tile batch before encoding mipmaps. Loading can
            // evict textures or submit tail updates; no unsubmitted mip writes may span it.
            // The mip passes and their display reads then share one submission.
            for (const tile of batch) {
              // Magnified tiles sample level zero. Build the mip chain only when a view needs it.
              const mipScale = camera.zoom * Math.min(width / size.width, height / size.height);
              if (mipScale < 1) {
                // Keep one level beyond the ideal LOD for trilinear filtering and viewport rounding.
                // Coarse cache entries already represent fewer texels across the same document tile.
                const required =
                  options.adaptiveMipmaps === false
                    ? 8
                    : Math.ceil(Math.log2(tile.texture.props.size[0] / (TILE_SIZE * mipScale))) + 1;
                ensureMipmaps(tile, required, options.batchViewMipmaps === false ? undefined : encoder);
              }
            }
            const pass = encoder.beginRenderPass({
              colorAttachments: [
                { view: view.layerRender, loadOp: offset === 0 && !streamed ? 'clear' : 'load', storeOp: 'store' }
              ]
            });
            pass.setScissorRect(region.x, region.y, region.width, region.height);
            // No blending: output includes the pre-stroke base and may be completely transparent
            // after erasing. Replace the layer pixels before applying its opacity/blend exactly once.
            for (const tile of batch) pipelines.tile.with(pass).with(tile.viewGroup).draw(6);
            for (const key of visible.slice(offset, offset + batchSize)) {
              if (active && strokeTiles.has(keyFor(layer, key))) previewTileDraws++;
              else sourceTileDraws++;
            }
            pass.end();
            device.queue.submit([encoder.finish()]);
          }
        }
        view.settings.write(
          d.vec4f(layer.opacity, ['normal', 'multiply', 'screen', 'overlay', 'linear'].indexOf(layer.blend), 0, 0)
        );
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            { view: write === view.a ? view.aRender : view.bRender, loadOp: 'clear', storeOp: 'store' }
          ]
        });
        pass.setScissorRect(region.x, region.y, region.width, region.height);
        pipelines.composite
          .with(pass)
          .with(read === view.a ? view.fromA : view.fromB)
          .draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
        [read, write] = [write, read];
      }
      virtual?.end();
      targets.get(canvas)!.pages = virtual?.debug() ?? [];
      // Keep the last brush preview until its updated overview is resident; navigation remains immediate.
      if (
        !exact &&
        !stroke &&
        holdPresentation === cameraSignature &&
        virtual?.debug().some((page) => !page.resident || page.fallback)
      )
        return;
      const refining = !exact && virtual?.debug().some((page) => !page.resident || page.fallback);
      if (refining && !stroke && completeView) {
        viewFallback?.capture(root.unwrap(view.composed), completeView.camera, completeView.size);
        completeView = undefined;
      }
      holdPresentation = '';
      presentedCamera = cameraSignature;
      const copy = device.createCommandEncoder();
      const origin = { x: region.x, y: region.y };
      copy.copyTextureToTexture(
        { texture: root.unwrap(read), origin },
        { texture: root.unwrap(view.composed), origin },
        [region.width, region.height]
      );
      device.queue.submit([copy.finish()]);
      if (refining && !stroke) viewFallback?.draw(root.unwrap(view.composed), camera, size);
      if (!refining) {
        completeView = { camera: { ...camera }, size: { ...size } };
        viewFallback?.clear();
      }
      present();
      damage.presented(plan);
    },
    /** Applies GPU backpressure to the worker frame scheduler, without blocking incoming messages. */
    async submitted() {
      await device.queue.onSubmittedWorkDone();
    },
    /** Releases this device and all resources. Does not modify committed document snapshots. */
    destroy() {
      disposed = true;
      readbacks.destroy();
      lasso.destroy();
      smudgeDeposits?.destroy();
      abrStamps?.destroy();
      historyTexture?.destroy();
      pickup?.destroy();
      retouch.destroy();
      texturedStamps?.destroy();
      texturedPipeline = undefined;
      view?.destroy();
      virtual?.destroy();
      viewFallback?.destroy();
      displayCache.destroy();
      for (const tile of tailPool) destroyTile(tile);
      tailPool.length = 0;
      tailTiles.clear();
      for (const tile of [...cache.values(), ...spareTiles]) destroyTile(tile);
      cache.clear();
      spareTiles.length = 0;
      for (const scratch of samplingScratch) destroyStrokeScratch(scratch);
      samplingScratch.length = 0;
      strokeTiles.clear();
      brushBuffer.destroy();
      device.removeEventListener('uncapturederror', uncapturedError);
      for (const [targetCanvas, target] of targets) {
        if (targetCanvas !== canvas) {
          target.view?.destroy();
          target.fallback?.destroy();
        }
        target.context.unconfigure();
      }
      targets.clear();
      root.destroy();
      if (!options.device) device.destroy();
    }
  };
}

function createPipelines(root: TgpuRoot, format: GPUTextureFormat) {
  return {
    stamp: root.createRenderPipeline({
      attribs: { stamp: shader.stampLayout.attrib },
      vertex: shader.stampVertex,
      fragment: shader.stampFragment,
      targets: {
        format: 'rgba8unorm',
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
        }
      }
    }),
    stroke: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.strokeFragment,
      targets: { format: 'rgba8unorm' }
    }),
    tile: root.createRenderPipeline({
      vertex: shader.tileVertex,
      fragment: shader.tileFragment,
      targets: { format: 'rgba8unorm' }
    }),
    composite: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.compositeFragment,
      targets: { format: 'rgba8unorm' }
    }),
    present: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.presentFragment,
      targets: { format }
    })
  };
}

function makeTexture(root: TgpuRoot, mipmaps = false) {
  return root
    .createTexture({ size: [TILE_SIZE, TILE_SIZE], format: 'rgba8unorm', mipLevelCount: mipmaps ? 9 : 1 })
    .$usage('sampled', 'render');
}
function createTile(root: TgpuRoot, pixels: Uint8Array | undefined, sampler: ReturnType<TgpuRoot['createSampler']>) {
  const texture = makeTexture(root, true);
  writePixels(root.device, root.unwrap(texture), pixels);
  const camera = root.createBuffer(shader.viewLayout.entries.view.uniform).$usage('uniform');
  return {
    texture,
    render: root.unwrap(texture).createView({ baseMipLevel: 0, mipLevelCount: 1 }),
    mipLevelReady: 0,
    camera,
    viewGroup: root.createBindGroup(shader.viewLayout, { view: camera, image: texture, sampler }),
    strokeDirty: false,
    scratch: undefined as ReturnType<typeof createStrokeScratch> | undefined,
    used: 0
  };
}

/** Persistent coverage belongs to a pixel tile; sampling tools borrow a separate submitted batch slot. */
function prepareStroke(root: TgpuRoot, tile: ReturnType<typeof createTile>) {
  return (tile.scratch ??= createStrokeScratch(root));
}

function createStrokeScratch(root: TgpuRoot) {
  const base = makeTexture(root);
  const mask = makeTexture(root);
  return {
    base,
    mask,
    maskRender: root.unwrap(mask).createView(),
    strokeGroup: root.createBindGroup(shader.strokeLayout, { base, mask }),
    stamps: root.createBuffer(d.arrayOf(d.vec4f, STAMP_CAPACITY)).$usage('vertex'),
    abr: undefined as AbrTile | undefined
  };
}

/** Texture and instance-buffer footprint; small uniforms/bindings are excluded from this estimate. */
function scratchBytes(scratch: ReturnType<typeof createStrokeScratch>) {
  return TILE_SIZE * TILE_SIZE * 4 * 2 + STAMP_CAPACITY * 16 + (scratch.abr?.bytes() ?? 0);
}

function destroyStrokeScratch(scratch: ReturnType<typeof createStrokeScratch>) {
  scratch.abr?.destroy();
  scratch.mask.destroy();
  scratch.base.destroy();
  scratch.stamps.destroy();
}

function destroyTile(tile: ReturnType<typeof createTile>) {
  if (tile.scratch) destroyStrokeScratch(tile.scratch);
  tile.texture.destroy();
  tile.camera.destroy();
}

function createView(root: TgpuRoot, width: number, height: number) {
  const texture = () => root.createTexture({ size: [width, height], format: 'rgba8unorm' }).$usage('sampled', 'render');
  const a = texture(),
    b = texture(),
    layer = texture(),
    composed = texture();
  const settings = root.createBuffer(d.vec4f).$usage('uniform');
  return {
    width,
    height,
    a,
    b,
    layer,
    composed,
    aRender: root.unwrap(a).createView(),
    bRender: root.unwrap(b).createView(),
    layerRender: root.unwrap(layer).createView(),
    settings,
    fromA: root.createBindGroup(shader.compositeLayout, { base: a, layer, settings }),
    fromB: root.createBindGroup(shader.compositeLayout, { base: b, layer, settings }),
    present: root.createBindGroup(shader.presentLayout, { image: composed }),
    destroy() {
      a.destroy();
      b.destroy();
      layer.destroy();
      composed.destroy();
      settings.destroy();
    }
  };
}

/** Attachment clears avoid allocating/uploading a viewport-sized CPU array of zeros. */
function clearAttachment(encoder: GPUCommandEncoder, view: GPUTextureView) {
  encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store' }] }).end();
}

/** Fixed RGBA8 tiles have aligned rows. One map waits for all copies instead of serial GPU round trips. */
async function readTextures(device: GPUDevice, textures: GPUTexture[]): Promise<Uint8Array[]> {
  if (!textures.length) return [];
  const bytes = TILE_SIZE * TILE_SIZE * 4;
  const buffer = device.createBuffer({
    size: bytes * textures.length,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });
  try {
    const encoder = device.createCommandEncoder();
    textures.forEach((texture, index) =>
      encoder.copyTextureToBuffer({ texture }, { buffer, offset: index * bytes, bytesPerRow: TILE_SIZE * 4 }, [
        TILE_SIZE,
        TILE_SIZE
      ])
    );
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(buffer.getMappedRange());
    return textures.map((_, index) => mapped.slice(index * bytes, (index + 1) * bytes));
  } finally {
    buffer.destroy();
  }
}
/** Assigns every level-zero pixel when recycling a slot, including transparent source/base/mask. */
function replacePixels(
  device: GPUDevice,
  texture: GPUTexture,
  pixels?: Uint8Array,
  batch?: ReturnType<typeof commandBatch>
) {
  if (pixels) {
    writePixels(device, texture, pixels);
    return;
  }
  const commands = batch ?? commandBatch(device);
  clearAttachment(commands.encoder(), texture.createView({ baseMipLevel: 0, mipLevelCount: 1 }));
  if (!batch) commands.flush();
}

function writePixels(device: GPUDevice, texture: GPUTexture, pixels?: Uint8Array) {
  if (pixels)
    device.queue.writeTexture({ texture }, unpackTile(pixels), { bytesPerRow: TILE_SIZE * 4 }, [TILE_SIZE, TILE_SIZE]);
}
function coordinates(key: string): [number, number] {
  const [x, y] = key.split(',').map(Number);
  return [x!, y!];
}
function hexColor(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  ];
}
function hasAlpha(pixels: Uint8Array) {
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
  return false;
}
const STAMP_CAPACITY = 1024;
const MAX_RESIDENT_TILES = 128;

/** One reusable full-resolution history tile, independent of destination tile-cache eviction. */
function historyTarget(root: TgpuRoot) {
  return root.createTexture({ size: [TILE_SIZE, TILE_SIZE], format: 'rgba8unorm' }).$usage('sampled', 'render');
}

/** Shared target pixel budget for presentation and contact-time LOD selection. */
function renderScale(size: ViewSize, dpr: number, maxDimension: number) {
  return Math.min(dpr, 2, maxDimension / Math.max(size.width, size.height),
    Math.sqrt(8_388_608 / Math.max(1, size.width * size.height)));
}
