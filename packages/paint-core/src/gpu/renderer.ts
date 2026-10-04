import type { AbrRasterSettings } from '@app-game/abr-paint/gpu/abrStamps';
import { createAbrRetouch } from '@app-game/abr-paint/gpu/retouch';
import type { BrushResource } from '@app-game/abr-paint/resources';
import { gpuError, type GpuError } from '@app-game/solid-gpu/errors';
import { makeGpuResources, type KeepGpuResource } from '@app-game/solid-gpu/gpu/resources';
import { tgpu } from 'typegpu';
import { TILE_SIZE, dabTiles, type Brush, type Dab } from '../brush';
import type { Camera, Point, ViewSize } from '../camera';
import type { Layer, TileChange } from '../document';
import { unpackTile, type TileData } from '../tilePixels';
import { viewLod, type OverviewStorage } from '../virtualPages';
import { createDisplayCache } from './displayCache';
import { createFloatingPixels, type FloatingPixels } from './floatingPixels';
import { createStrokeClip } from './strokeClip';
import { createFrameComposer, renderScale } from './frameComposer';
import { createLassoOverlay } from './lassoOverlay';
import { capturePaintBounds, clipPaintBounds, type PaintBounds } from './paintBounds';
import { paperColor } from './shaders';
import { createStrokeRaster } from './strokeRaster';
import { createStrokeData, createStrokeState } from './strokeState';
import { createTargetViews } from './targetView';
import { createTileMipmaps } from './tileMipmaps';
import { createTileResidency } from './tileResidency';
import { createMipmapEnsurer, tileCoordinates, tileId } from './tileTextures';
import { createVirtualTexture } from './virtualTexture';

/** Creates one WebGPU device/cache owner with a default canvas. Additional targets share its raster resources.
 * Committed CPU tiles remain valid after cache eviction or device loss. Render/paint/detach calls must be serialized.
 * Construction failures reject with an Error whose `cause` is a typed GpuError; every allocation made before the
 * failure is released, including a self-created device.
 * `onLost` reports the first terminal device failure: `lost` for device loss, `validation` for uncaptured validation
 * errors and `device` for other uncaptured errors. It is not called after destroy().
 */
export async function createPaintRenderer(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  onLost: (message: string, error: GpuError) => void,
  options: PaintRendererOptions = {}
) {
  const resources = makeGpuResources();
  try {
    return await assemblePaintRenderer(canvas, onLost, options, resources);
  } catch (error) {
    resources.destroy();
    throw error;
  }
}

/** Renderer configuration. Verification-only switches default to the production behavior. */
export type PaintRendererOptions = {
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
  /** Draw nonresident committed tiles from the bounded display cache; false loads them as resident tiles. */
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
  /** Persists derived overview pages between sessions. */
  overviewStorage?: OverviewStorage;
  /** Resolves stored tile references; required when layers contain references. */
  readTile?: (pixels: TileData) => Promise<Uint8Array>;
  /** Streams committed pixels through a sparse virtual texture instead of drawing every visible tile. */
  virtualTexture?: boolean;
  /** Called when streamed pages become resident and a redraw would refine the view. */
  onRefine?: () => void;
  /** Awaited between complete sampling dabs, after their GPU writes are submitted.
   * May render/present progress. Must not paint, finish, cancel, reset or replace this renderer.
   */
  onPaintProgress?: () => Promise<void>;
  /** Reports background failures (page streaming, eviction readback) that do not reject a call. */
  onError?: (error: unknown) => void;
};

/** Builds the renderer, registering every allocation in `resources` so a failed build releases all of them. */
async function assemblePaintRenderer(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  onLost: (message: string, error: GpuError) => void,
  options: PaintRendererOptions,
  resources: ReturnType<typeof makeGpuResources>
) {
  let disposed = false;
  resources.keep({
    destroy: () => {
      disposed = true;
    }
  });
  const paintBounds = capturePaintBounds(options.bounds);
  // Strokes stay within the paint bounds and the lasso selection; `clip` exists by the time any stroke asks.
  const allowsTile = (key: string) =>
    (!paintBounds || !!clipPaintBounds(paintBounds, ...tileCoordinates(key))) && clip.allows(key);
  const device = await openDevice(options.device, resources.keep);
  const root = resources.keep(tgpu.initFromDevice({ device }));
  const clip = resources.keep(createStrokeClip(root));

  /**
   * Reads the presented image of `target` in backing pixels, the whole view by default, as opaque RGBA: the last
   * composed frame over the paper, without the lasso outline. GPU readback works where reading the WebGPU canvas
   * itself fails once its frame has been presented. Render the target first.
   */
  async function readPresented(
    target: OffscreenCanvas | HTMLCanvasElement = canvas,
    region?: { x: number; y: number; width: number; height: number }
  ): Promise<{ width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }> {
    const view = targets.get(target)?.view;
    if (!view) throw new Error('Render the canvas before reading its colors.');
    const { x, y, width, height } = region ?? { x: 0, y: 0, width: view.width, height: view.height };
    // Rows of a texture copy are 256-byte aligned.
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const buffer = device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    try {
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: root.unwrap(view.composed), origin: [x, y] }, { buffer, bytesPerRow }, [
        width,
        height
      ]);
      device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(buffer.getMappedRange());
      const data = new Uint8ClampedArray(width * height * 4);
      const paper = paperColor.map((channel) => channel * 255);
      for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
          const from = row * bytesPerRow + column * 4,
            to = (row * width + column) * 4;
          // Composed pixels are premultiplied; the presented frame adds the paper under their transparency.
          const cover = 1 - mapped[from + 3]! / 255;
          data[to] = mapped[from]! + paper[0]! * cover;
          data[to + 1] = mapped[from + 1]! + paper[1]! * cover;
          data[to + 2] = mapped[from + 2]! + paper[2]! * cover;
          data[to + 3] = 255;
        }
      }

      return { width, height, data };
    } finally {
      buffer.destroy();
    }
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  const primaryContext = canvas.getContext('webgpu');
  if (!primaryContext) {
    throw rendererError(gpuError('canvas', 'The canvas could not start WebGPU.'));
  }

  primaryContext.configure({ device, format, alphaMode: 'opaque' });
  resources.keep({ destroy: () => primaryContext.unconfigure() });
  watchDeviceFailures(device, () => disposed, onLost, resources.keep);

  const lasso = resources.keep(createLassoOverlay(root, format));
  let animateSelection = true;
  /** Magnified pixels blend smoothly; off, they are flat squares, as `setPixelView` says. */
  let smoothPixels = true;
  let pixelGrid = false;
  /** Layers blend in linear light, as `setLinearBlending` says; in encoded sRGB until then. */
  let linearBlending = false;
  const virtual = options.virtualTexture
    ? resources.keep(
        createVirtualTexture(
          root,
          async (pixels) => (pixels instanceof Uint8Array ? pixels : options.readTile!(pixels)),
          () => {
            targets.invalidate();
            options.onRefine?.();
          },
          (error) => options.onError?.(error),
          options.overviewStorage,
          () => smoothPixels
        )
      )
    : undefined;
  const targets = resources.keep(
    createTargetViews(root, format, {
      virtual,
      lasso,
      contextError: () => rendererError(gpuError('canvas', 'The canvas target could not start WebGPU.'))
    })
  );
  targets.attach(canvas, primaryContext);
  let lastTarget = canvas;

  // Match virtual pages so touching a magnified tile does not change existing artwork's filtering.
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' });
  const generateMipmaps = options.batchedMipmaps === false ? undefined : createTileMipmaps(root);
  const ensureMipmaps = createMipmapEnsurer(generateMipmaps);
  const displayCache = resources.keep(createDisplayCache(root, sampler, generateMipmaps));
  const stroke = createStrokeData();
  const residency = resources.keep(createTileResidency(root, sampler, stroke, options));
  const raster = resources.keep(
    createStrokeRaster(
      root,
      {
        stroke,
        residency,
        displayCache,
        targets,
        sampler,
        ensureMipmaps,
        paintBounds,
        allowsTile,
        linearBlending: () => linearBlending,
        clip
      },
      options
    )
  );
  const retouch = resources.keep(
    createAbrRetouch<Layer>(
      root,
      {
        capture: raster.captureRegion,
        deposit: raster.paintStamps,
        tileKeys: (dab) => dabTiles(dab).filter(allowsTile)
      },
      options
    )
  );
  const strokes = createStrokeState(stroke, {
    residency,
    raster,
    retouch,
    targets,
    displayCache,
    invalidateOverview: () => virtual?.invalidate(),
    streaming: !!virtual,
    allowsTile,
    sharedScratch: options.sharedScratch
  });
  const floating = resources.keep(
    createFloatingPixels(root, (keys) => {
      if (keys === 'all') {
        targets.invalidate();
        return;
      }

      for (const key of keys) {
        targets.mark(key);
      }
    })
  );
  const composer = createFrameComposer(
    root,
    format,
    {
      stroke,
      residency,
      raster,
      displayCache,
      ensureMipmaps,
      virtual,
      floating,
      animateSelection: () => animateSelection,
      smoothPixels: () => smoothPixels,
      pixelGrid: () => pixelGrid,
      linearBlending: () => linearBlending
    },
    options
  );

  function recomposite() {
    for (const target of targets.all()) {
      target.dropFallback();
    }

    virtual?.invalidate();
    targets.invalidate();
  }

  return {
    /** Captures transient tool paint for a planned renderer replacement, never for document autosave. */
    async snapshotTools() {
      if (stroke.current) {
        throw new Error('Finish or cancel the stroke before replacing the renderer.');
      }

      return retouch.snapshot();
    },
    /** Validates the complete payload before mutating any device resources. Empty state clears prior tools. */
    restoreTools(input: unknown) {
      if (stroke.current) {
        throw new Error('Finish or cancel the stroke before restoring tool paint.');
      }

      retouch.restore(input);
    },
    /** Changes idle Mixer wells without starting a stroke or touching document/history state. */
    mixerCommand(...args: Parameters<typeof retouch.mixerCommand>) {
      retouch.mixerCommand(...args);
    },
    /** Loads a single document pixel or a brush-sized color patch; presentation/background pixels are excluded. */
    async loadMixerFromCanvas(load: Parameters<typeof retouch.loadMixerFromCanvas>[0]) {
      if (stroke.current) {
        throw new Error('Finish or cancel the stroke before loading canvas paint.');
      }

      await retouch.loadMixerFromCanvas(load);
    },
    /** Detaches a target after any in-flight render. The caller owns its canvas element. */
    releaseTarget(targetCanvas: OffscreenCanvas | HTMLCanvasElement) {
      targets.release(targetCanvas);
    },
    /** Replaces display-only stamps; these never enter readback, history or saved tiles. */
    preview(dabs: readonly Dab[]) {
      strokes.preview(dabs);
    },
    /**
     * How pixels show up close: `smooth` blends magnified pixels into each other, otherwise they are flat squares with
     * edges smoothed over one screen pixel, as image editors show them (minified views are smooth either way);
     * `grid` outlines each document pixel from `pixelGridZoom`, in presented frames only. Redraws the views.
     */
    setPixelView(view: { smooth: boolean; grid: boolean }) {
      if (view.smooth !== smoothPixels || view.grid !== pixelGrid) {
        smoothPixels = view.smooth;
        pixelGrid = view.grid;
        targets.invalidate();
      }
    },
    /**
     * Keeps the strokes that follow inside the closed polygon `points`, in document pixels, such as the lasso
     * selection: every engine, retouch tool and eraser then changes only pixels inside it. `undefined` stops clipping.
     */
    clipStroke(points: readonly Point[] | undefined) {
      clip.set(points);
    },
    /** Composites every layer in linear light, or in encoded sRGB; see `mergeTilePixels`. Redraws the views. */
    setLinearBlending(linear: boolean) {
      if (linear !== linearBlending) {
        linearBlending = linear;
        targets.invalidate();
      }
    },
    /** Keeps transient selection geometry on this device, outside committed artwork and exports. */
    setSelection(points: readonly Point[], animate = true) {
      lasso.set(points);
      animateSelection = animate;
    },
    /**
     * Shows pixels lifted off a layer, moved, until replaced or cleared with `undefined`; see `FloatingPixels`. They
     * appear in presented frames and exports of the view, never in tiles, history or saved documents. Uploads the
     * pixels; use `moveFloating` to move them.
     */
    setFloating(next: FloatingPixels | undefined) {
      floating.set(next);
    },
    /** Moves the shown floating pixels without uploading them again. */
    moveFloating(
      matrix: FloatingPixels['matrix'],
      interpolation: FloatingPixels['interpolation'],
      warp?: FloatingPixels['warp']
    ) {
      floating.move(matrix, interpolation, warp);
    },
    /**
     * Keeps the presented frame of every target until the changed overview is resident at the same camera, as after
     * a stroke: committed pixels replacing a preview, such as floating pixels, appear without a blurred interim.
     * Call after `restore`, which drops held frames.
     */
    holdPresented() {
      for (const target of targets.all()) {
        target.holdPreview();
        if (virtual) {
          target.damage.invalidate();
        }
      }
    },
    /** Makes the current low-resolution image resident, rebuilding only edited branches. */
    prepareOverview: async (layers: Layer[]) => {
      await virtual?.prepare(layers);
    },
    /** Resident texture budget is bounded; the count also includes active-stroke resources. */
    stats() {
      const virtualStats = virtual?.stats();
      const tiles = residency.stats();
      const brush = raster.stats();
      const frame = composer.stats();
      return {
        residentTiles: tiles.residentTiles,
        samplingScratchTiles: tiles.samplingScratchTiles,
        readback: tiles.readback,
        previewTileDraws: frame.previewTileDraws,
        viewportUpdate: frame.viewportUpdate,
        sourceTileDraws: frame.sourceTileDraws,
        virtual: virtualStats,
        displayTiles: displayCache.stats().tiles,
        brushTextures: brush.brushTextures,
        gpuBytes:
          brush.bytes +
          tiles.bytes +
          lasso.bytes() +
          floating.bytes() +
          (virtualStats?.gpuBytes ?? 0) +
          targets.bytes() +
          displayCache.stats().bytes +
          retouch.bytes()
      };
    },
    /** Virtual-texture pages selected by the most recently rendered target. */
    debugPages: () => targets.get(lastTarget)?.pages()?.debug() ?? [],
    /** Occupied visible-layer tiles, including the active stroke, for the optional wireframe overlay. */
    debugTiles(layers: Layer[]) {
      const keys = new Set<string>();
      for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) {
          continue;
        }

        for (const key of layer.tiles.keys()) {
          keys.add(key);
        }

        for (const key of strokes.activeKeys(layer)) {
          keys.add(key);
        }
      }

      return [...keys];
    },
    /** Captures brush settings and the target layer until commit/cancel. Optional native coverage replaces hardness.
     * Textured dabs must carry the tip's circumscribed radius; use texturedBrush to map brush size correctly.
     */
    begin(
      layer: Layer,
      brush: Brush,
      tip?: { resource: BrushResource; angle: number },
      abr?: AbrRasterSettings<Layer>
    ) {
      strokes.begin(layer, brush, tip, abr);
    },
    /** Samples current pixels for canvas-dependent tools, excluding disposable previews.
     * The borrowed GPU patch remains valid until the next capture or renderer disposal.
     * Call only between submitted paint operations; all renderer operations are serialized by the runtime.
     */
    captureRegion: raster.captureRegion,
    /** Reads one committed active-layer pixel, excluding display/background and uncommitted stroke pixels.
     * Resolves cold tile references through storage; does not introduce a GPU readback.
     */
    async readCommittedPixel(layer: Layer, point: Point): Promise<Uint8Array> {
      const x = Math.floor(point.x),
        y = Math.floor(point.y);
      const tx = Math.floor(x / TILE_SIZE),
        ty = Math.floor(y / TILE_SIZE);
      const pixels = await residency.readTile(layer.tiles.get(`${tx},${ty}`));
      const offset = ((y - ty * TILE_SIZE) * TILE_SIZE + x - tx * TILE_SIZE) * 4;
      return pixels ? unpackTile(pixels).slice(offset, offset + 4) : new Uint8Array(4);
    },
    /** Reads the presented colors around `point`, in CSS pixels of a `size` view of `target`, as opaque RGBA: a
     * square of `area` CSS pixels per side, in backing pixels and within the view. See `readPresented`, which reads the
     * last composed frame; render first for an up-to-date image.
     */
    async readPresentedArea(point: Point, size: ViewSize, area = 1, target = canvas) {
      const view = targets.get(target)?.view;
      if (!view) throw new Error('Render the canvas before reading its colors.');
      const side = Math.max(1, Math.round((area * view.width) / size.width));
      const clamp = (value: number, length: number) => Math.min(length - side, Math.max(0, Math.floor(value)));
      const x = clamp((point.x / size.width) * view.width - side / 2 + 0.5, view.width);
      const y = clamp((point.y / size.height) * view.height - side / 2 + 0.5, view.height);
      return (await readPresented(target, { x, y, width: side, height: side })).data;
    },
    readPresented,
    /** Paint accumulates by tile; canvas-sampling tools transport pixels in stamp order. */
    async paint(dabs: readonly Dab[]) {
      if (retouch.active) {
        await retouch.paint(dabs);
        return;
      }

      if (!stroke.abr || !options.onPaintProgress) {
        return raster.paintStamps(dabs);
      }

      // Small sampled tips can share more upload/submission work without a large GPU workload.
      // Larger stamps retain the smaller progress batches.
      const batchSize = stroke.abr.paintBatchSize(dabs);
      for (let offset = 0; offset < dabs.length; offset += batchSize) {
        await raster.paintStamps(dabs.slice(offset, offset + batchSize));
        await options.onPaintProgress();
      }
    },
    /** Commits touched pixels in bounded readback chunks; retains reusable GPU resources for subsequent strokes. */
    finish(): Promise<TileChange[]> {
      return strokes.finish();
    },
    /** Discards preview pixels and restores the committed document on the next render. */
    cancel() {
      strokes.cancel();
    },
    /** Drops every cached pixel after an import or a failed stroke; committed tiles reload on demand. */
    reset() {
      strokes.reset();
    },
    /** Reloads only `changes` after undo, redo or a selection edit, and recomposites for layer changes.
     * Resident tiles of other layers stay cached; tiles of layers missing from `layers` return to the spare pool.
     * Display-cache entries and overview pages check tile versions themselves. Call only between strokes.
     */
    restore(changes: readonly TileChange[], layers: readonly Layer[]) {
      if (stroke.current) {
        throw new Error('Finish or cancel the stroke before restoring tiles.');
      }

      const present = new Set(layers.map((layer) => layer.id));
      const changed = new Set(changes.map((change) => tileId(change.layerId, change.key)));
      // Tile keys never contain '/', so the last separator ends the layer id even if the id contains one.
      const stale = (id: string) => changed.has(id) || !present.has(id.slice(0, id.lastIndexOf('/')));
      residency.releaseWhere(stale);
      displayCache.removeWhere(stale);
      for (const change of changes) {
        targets.mark(change.key);
      }

      recomposite();
    },
    /** Rebuilds the viewport without evicting tile resources. Also permits comparison with a full redraw. */
    invalidateView() {
      targets.invalidate();
    },
    /** Layer order, visibility, opacity or blend changed, or a layer was added or removed. Recomposites every
     * target and recomputes virtual-texture coverage; committed tile caches stay resident.
     */
    recomposite,
    /** Returns a deleted layer's resident tiles to the spare pool and drops its display textures.
     * Call only between strokes; undo that restores the layer re-reads its committed tiles.
     */
    releaseLayer(layerId: string) {
      if (stroke.current?.layer.id === layerId) {
        throw new Error('Finish or cancel the stroke before deleting its layer.');
      }

      // Tile keys never contain '/', so the last separator ends the layer id even if the id contains one.
      const owned = (id: string) => id.slice(0, id.lastIndexOf('/')) === layerId;
      residency.releaseWhere(owned);
      displayCache.removeWhere(owned);
    },
    /** Captures the target LOD used for drawing this layer, including viewport and sparse-page budgets. */
    brushLod(layers: Layer[], layer: Layer, camera: Camera, size: ViewSize, dpr: number) {
      const scale = renderScale(size, dpr, device.limits.maxTextureDimension2D);
      return virtual && layers.filter((l) => l.visible && l.opacity > 0).length <= 24
        ? virtual.brushLod(layers, layer, camera, size, scale)
        : viewLod(camera.zoom, scale);
    },
    /** Rebuilds changed screen regions of `target` (the construction canvas by default), attaching it on first
     * use; camera/layer changes rebuild the full view. Cached output survives tile eviction.
     */
    async render(layers: Layer[], camera: Camera, size: ViewSize, dpr: number, exact = false, target = canvas) {
      if (disposed) {
        throw new Error('The renderer is disposed.');
      }

      const view = targets.attach(target);
      lastTarget = target;
      await composer.render(view, layers, camera, size, dpr, exact);
    },
    /** Applies GPU backpressure to the worker frame scheduler, without blocking incoming messages. */
    async submitted() {
      await device.queue.onSubmittedWorkDone();
    },
    /** Releases this device and all resources. Does not modify committed document snapshots. */
    destroy() {
      stroke.tiles.clear();
      resources.destroy();
    }
  };
}

/** Borrows `borrowed`, or opens and registers a new device so a later construction failure destroys it. */
async function openDevice(borrowed: GPUDevice | undefined, keep: KeepGpuResource) {
  if (borrowed) {
    return borrowed;
  }

  if (!navigator.gpu) {
    throw rendererError(
      gpuError('unavailable', 'WebGPU is unavailable. Open this page in a browser with WebGPU support.')
    );
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw rendererError(
      gpuError('adapter', 'A WebGPU device could not be opened. Check hardware acceleration in your browser.')
    );
  }

  try {
    return keep(await adapter.requestDevice());
  } catch (cause) {
    throw rendererError(gpuError('device', 'The WebGPU device could not be created.', cause));
  }
}

/** Reports the first device loss or uncaptured error once, never after disposal. The listener is released with
 * the renderer.
 */
function watchDeviceFailures(
  device: GPUDevice,
  disposed: () => boolean,
  onLost: (message: string, error: GpuError) => void,
  keep: KeepGpuResource
) {
  let failed = false;
  const fail = (error: GpuError) => {
    if (disposed() || failed) {
      return;
    }

    failed = true;
    onLost(error.message, error);
  };

  void device.lost.then((info) =>
    fail(gpuError('lost', info.message || 'The graphics device was disconnected.', info))
  );
  const uncapturedError = (event: GPUUncapturedErrorEvent) => fail(uncapturedGpuError(event.error));
  device.addEventListener('uncapturederror', uncapturedError);
  keep({ destroy: () => device.removeEventListener('uncapturederror', uncapturedError) });
}

/** Wraps a typed failure in an Error so ordered runtime queues keep its message; `cause` carries the code. */
function rendererError(error: GpuError) {
  return new Error(error.message, { cause: error });
}

/** Classifies an uncaptured device error. Validation errors are programming errors and remain terminal. */
function uncapturedGpuError(error: GPUError): GpuError {
  const validation = typeof GPUValidationError !== 'undefined' && error instanceof GPUValidationError;
  return gpuError(validation ? 'validation' : 'device', error.message, error);
}
