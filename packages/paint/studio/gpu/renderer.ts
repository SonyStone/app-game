import { d, tgpu, type TgpuRoot } from 'typegpu';
import { attempt, unwrapResult, type Result } from '../asyncResult';
import { TILE_SIZE, dabTiles, type Brush, type Dab } from '../brush';
import { screenToWorld, type Camera, type Point, type ViewSize } from '../camera';
import type { Layer, TileChange } from '../document';
import { packTile, unpackTile, type TileData } from '../tilePixels';
import type { OverviewStorage } from '../virtualPages';
import { dirtyRegion } from './dirtyRegion';
import { createDisplayCache } from './displayCache';
import { createLassoOverlay } from './lassoOverlay';
import { createReadbackQueue } from './readbackQueue';
import * as shader from './shaders';
import { stampBounds } from './stampBounds';
import { createViewFallback } from './viewFallback';
import { createVirtualTexture } from './virtualTexture';

/** Creates a WebGPU renderer for the selected canvas. Committed CPU tiles remain valid after cache eviction or device loss. */
export async function createPaintRenderer(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  onLost: (message: string) => void,
  options: {
    device?: GPUDevice;
    cacheTiles?: number;
    displayCache?: boolean;
    overviewStorage?: OverviewStorage;
    readTile?: (pixels: TileData) => Promise<Uint8Array>;
    virtualTexture?: boolean;
    onRefine?: () => void;
    onError?: (error: unknown) => void;
  } = {}
) {
  if (!navigator.gpu) throw new Error('WebGPU is unavailable. Open this page in a browser with WebGPU support.');
  const adapter = options.device ? undefined : await navigator.gpu.requestAdapter();
  if (!options.device && !adapter)
    throw new Error('A WebGPU device could not be opened. Check hardware acceleration in your browser.');
  const device = options.device ?? (await adapter!.requestDevice());
  const root = tgpu.initFromDevice({ device });
  const context = canvas.getContext('webgpu');
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
  let animateSelection = true;
  // Match virtual pages so touching a magnified tile does not change existing artwork's filtering.
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' });
  const displayCache = createDisplayCache(root, sampler);
  const cache = new Map<string, ReturnType<typeof createTile>>();
  const spareTiles: ReturnType<typeof createTile>[] = [];
  const tailTiles = new Map<string, Dab[]>();
  // A small reusable pool, independent of committed scratch and its eviction/readback lifecycle.
  const tailPool: ReturnType<typeof createTile>[] = [];
  const strokeTiles = new Map<
    string,
    {
      before: TileData | undefined;
      mask?: Uint8Array;
      output?: Uint8Array;
      pending?: Promise<Result<void>>;
    }
  >();
  const evictionSize = Math.min(16, Math.max(1, Math.floor((options.cacheTiles ?? MAX_RESIDENT_TILES) / 8)));
  const readbacks = createReadbackQueue(device, evictionSize * 2);
  let stroke: { layer: Layer; brush: Brush } | undefined;
  let view: ReturnType<typeof createView> | undefined;
  let viewSignature = '';
  let presentedCamera = '';
  let holdPresentation = '';
  const virtual = options.virtualTexture
    ? createVirtualTexture(
        root,
        async (pixels) => (pixels instanceof Uint8Array ? pixels : options.readTile!(pixels)),
        () => {
          viewSignature = '';
          options.onRefine?.();
        },
        (error) => options.onError?.(error),
        options.overviewStorage
      )
    : undefined;
  const viewFallback = virtual ? createViewFallback(root) : undefined;
  let completeView: { camera: Camera; size: ViewSize } | undefined;
  const dirtyTiles = new Set<string>();
  const setTail = (dabs: readonly Dab[]) => {
    for (const key of tailTiles.keys()) dirtyTiles.add(key);
    tailTiles.clear();
    for (const dab of dabs)
      for (const key of dabTiles(dab)) {
        const list = tailTiles.get(key) ?? [];
        list.push(dab);
        tailTiles.set(key, list);
        dirtyTiles.add(key);
      }
  };
  let frame = 0;
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
    if (cache.size >= Math.max(1, options.cacheTiles ?? MAX_RESIDENT_TILES)) {
      // Submit every command referencing victims before readback or recycling their resources.
      batch?.flush();
      // Amortize readback synchronization over a small LRU batch as the stroke grows.
      const count = evictionSize;
      const victims = [...cache].sort((a, b) => a[1].used - b[1].used).slice(0, count);
      const active = victims.filter(([id, tile]) => strokeTiles.has(id) && tile.mask);
      if (active.length) {
        const snapshots = active.map(([id]) => ({ id, snapshot: strokeTiles.get(id)! }));
        const job = await readbacks.capture(
          active.flatMap(([, tile]) => [root.unwrap(tile.mask!), root.unwrap(tile.texture)])
        );
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
            snapshot.mask = pixels[index * 2]!;
            snapshot.output = pixels[index * 2 + 1]!;
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
      tile.mipmapsDirty = true;
    } else tile = createTile(root, pixels, sampler);
    try {
      tile.used = ++frame;
      if (active) {
        prepareStroke(root, tile);
        replacePixels(device, root.unwrap(tile.base!), await readTile(active.before), batch);
        replacePixels(device, root.unwrap(tile.mask!), active.mask, batch);
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
    prepareStroke(root, temporary);
    const commands = commandBatch(device);
    commands
      .encoder()
      .copyTextureToTexture(
        { texture: root.unwrap(active ? original.base! : original.texture) },
        { texture: root.unwrap(temporary.base!) },
        [TILE_SIZE, TILE_SIZE]
      );
    if (active)
      commands
        .encoder()
        .copyTextureToTexture({ texture: root.unwrap(original.mask!) }, { texture: root.unwrap(temporary.mask!) }, [
          TILE_SIZE,
          TILE_SIZE
        ]);
    else clearAttachment(commands.encoder(), temporary.maskRender!);
    for (let offset = 0; offset < tail.length; offset += STAMP_CAPACITY) {
      if (offset) commands.flush();
      const stamps = tail.slice(offset, offset + STAMP_CAPACITY);
      const data = new Float32Array(stamps.length * 4);
      stamps.forEach((dab, i) => data.set([dab.x - x * TILE_SIZE, dab.y - y * TILE_SIZE, dab.radius, dab.flow], i * 4));
      device.queue.writeBuffer(root.unwrap(temporary.stamps), 0, data);
      const pass = commands
        .encoder()
        .beginRenderPass({ colorAttachments: [{ view: temporary.maskRender!, loadOp: 'load', storeOp: 'store' }] });
      pipelines.stamp.with(pass).with(brushGroup).with(shader.stampLayout, temporary.stamps).draw(6, stamps.length);
      pass.end();
    }
    const pass = commands
      .encoder()
      .beginRenderPass({ colorAttachments: [{ view: temporary.render, loadOp: 'clear', storeOp: 'store' }] });
    pipelines.stroke.with(pass).with(brushGroup).with(temporary.strokeGroup!).draw(3);
    pass.end();
    commands.flush();
    temporary.mipmapsDirty = true;
    return temporary;
  };

  return {
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
        readback: readbacks.stats(),
        previewTileDraws,
        sourceTileDraws,
        virtual: virtual?.stats(),
        displayTiles: displayCache.stats().tiles,
        gpuBytes:
          lasso.bytes() +
          readbacks.stats().bytes +
          (virtual?.stats().gpuBytes ?? 0) +
          (viewFallback?.bytes() ?? 0) +
          displayCache.stats().bytes +
          [...cache.values(), ...spareTiles, ...tailPool].reduce(
            (n, tile) => n + TILE_SIZE * TILE_SIZE * 4 * (4 / 3 + (tile.base ? 2 : 0)),
            0
          )
      };
    },
    debugPages: () => virtual?.debug() ?? [],
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
    /** Captures brush settings and the target layer until commit/cancel. */
    begin(layer: Layer, brush: Brush) {
      if (stroke) throw new Error('Finish the current stroke before beginning another.');
      setTail([]);
      if (virtual && !completeView) viewSignature = '';
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
    },
    /** Groups new stamps by touched tile; only those tiles are rasterized and recomposited. */
    async paint(dabs: readonly Dab[]) {
      if (!stroke || !dabs.length) return;
      const groups = new Map<string, Dab[]>();
      for (const dab of dabs)
        for (const key of dabTiles(dab)) {
          let group = groups.get(key);
          if (!group) {
            group = [];
            groups.set(key, group);
          }
          group.push(dab);
        }
      const commands = commandBatch(device);
      let pendingTiles = 0;
      try {
        for (const [key, dabs] of groups) {
          const id = keyFor(stroke.layer, key);
          const tile = await ensure(stroke.layer, key, commands);
          if (!strokeTiles.has(id)) {
            strokeTiles.set(id, { before: stroke.layer.tiles.get(key) });
            prepareStroke(root, tile);
            commands
              .encoder()
              .copyTextureToTexture({ texture: root.unwrap(tile.texture) }, { texture: root.unwrap(tile.base!) }, [
                TILE_SIZE,
                TILE_SIZE
              ]);
            clearAttachment(commands.encoder(), tile.maskRender!);
          }
          const [tx, ty] = coordinates(key);
          for (let offset = 0; offset < dabs.length; offset += STAMP_CAPACITY) {
            // The same instance buffer must not be overwritten before its previous draw is submitted.
            if (offset) commands.flush();
            const stamps = dabs.slice(offset, offset + STAMP_CAPACITY);
            const data = new Float32Array(stamps.length * 4);
            stamps.forEach((dab, index) =>
              data.set([dab.x - tx * TILE_SIZE, dab.y - ty * TILE_SIZE, dab.radius, dab.flow], index * 4)
            );
            device.queue.writeBuffer(root.unwrap(tile.stamps), 0, data);
            const pass = commands.encoder().beginRenderPass({
              colorAttachments: [{ view: tile.maskRender!, loadOp: 'load', storeOp: 'store' }]
            });
            pipelines.stamp.with(pass).with(brushGroup).with(shader.stampLayout, tile.stamps).draw(6, stamps.length);
            pass.end();
          }
          // Output depends on the final accumulated mask, so composite once per touched region.
          // Keep previous output outside this region, including ink from earlier input batches.
          const bounds = stampBounds(dabs, tx, ty);
          if (bounds) {
            const pass = commands.encoder().beginRenderPass({
              colorAttachments: [{ view: tile.render, loadOp: 'load', storeOp: 'store' }]
            });
            pass.setScissorRect(bounds.x, bounds.y, bounds.width, bounds.height);
            pipelines.stroke.with(pass).with(brushGroup).with(tile.strokeGroup!).draw(3);
            pass.end();
          }
          tile.mipmapsDirty = true;
          displayCache.remove(id);
          dirtyTiles.add(key);
          if (++pendingTiles === 32) {
            commands.flush();
            pendingTiles = 0;
          }
        }
      } finally {
        // An I/O failure must not discard commands for previously processed tiles in this batch.
        commands.flush();
      }
    },
    /** Copies resident touched tiles in one submission/map; retains scratch textures for subsequent strokes. */
    async finish(): Promise<TileChange[]> {
      if (!stroke) return [];
      setTail([]);
      for (const result of await Promise.all([...strokeTiles.values()].map((snapshot) => snapshot.pending)))
        if (result) unwrapResult(result);
      const changes: TileChange[] = [];
      const resident = [...strokeTiles.keys()].filter((id) => cache.has(id));
      const pixels = await readTextures(
        device,
        resident.map((id) => root.unwrap(cache.get(id)!.texture))
      );
      const outputs = new Map(resident.map((id, index) => [id, pixels[index]!]));
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
      stroke = undefined;
      virtual?.invalidate();
      holdPresentation = presentedCamera;
      viewSignature = '';
      return changes;
    },
    /** Discards preview pixels and restores the committed document on the next render. */
    cancel() {
      setTail([]);
      if (strokeTiles.size) {
        completeView = undefined;
        viewFallback?.clear();
      }
      holdPresentation = '';
      if (strokeTiles.size) viewSignature = '';
      for (const id of strokeTiles.keys()) {
        const tile = cache.get(id);
        if (tile) destroyTile(tile);
        cache.delete(id);
      }
      strokeTiles.clear();
      readbacks.clear();
      stroke = undefined;
    },
    /** Invalidates cached pixels after undo, redo, import, or layer deletion. */
    reset() {
      setTail([]);
      completeView = undefined;
      viewFallback?.clear();
      holdPresentation = '';
      virtual?.invalidate();
      displayCache.clear();
      viewSignature = '';
      dirtyTiles.clear();
      for (const tile of [...cache.values(), ...spareTiles]) destroyTile(tile);
      cache.clear();
      spareTiles.length = 0;
      strokeTiles.clear();
      readbacks.clear();
      stroke = undefined;
    },
    /** Rebuilds the viewport without evicting tile resources. Also permits comparison with a full redraw. */
    invalidateView() {
      viewSignature = '';
    },
    /** Rebuilds changed screen regions; camera/layer changes rebuild the full view. Cached output survives tile eviction. */
    async render(layers: Layer[], camera: Camera, size: ViewSize, dpr: number, exact = false) {
      const scale = Math.min(
        dpr,
        2,
        device.limits.maxTextureDimension2D / Math.max(size.width, size.height),
        Math.sqrt(8_388_608 / Math.max(1, size.width * size.height))
      );
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
        viewSignature = '';
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
      const region =
        signature !== viewSignature
          ? { x: 0, y: 0, width, height }
          : dirtyRegion(dirtyTiles, camera, size, { width, height });
      const present = () => {
        // Both passes target the same swapchain texture. The cached artwork never contains the outline.
        const target = context.getCurrentTexture().createView();
        pipelines.present.with(view!.present).withColorAttachment({ view: target, loadOp: 'clear' }).draw(3);
        if (!exact) lasso.render(target, camera, size, width, height, animateSelection ? performance.now() / 1000 : 0);
      };
      if (!region) {
        dirtyTiles.clear();
        present();
        return;
      }
      previewTileDraws = 0;
      sourceTileDraws = 0;
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
          const keys = streamed ? new Set<string>() : new Set(layer.tiles.keys());
          if (active) for (const id of strokeTiles.keys()) keys.add(id.slice(layer.id.length + 1));
          if (active && !exact) for (const key of tailTiles.keys()) keys.add(key);
          const visible = [...keys].filter((key) => {
            const [x, y] = coordinates(key);
            return (
              (x + 1) * TILE_SIZE >= minX &&
              x * TILE_SIZE <= maxX &&
              (y + 1) * TILE_SIZE >= minY &&
              y * TILE_SIZE <= maxY
            );
          });
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
              // Magnified tiles sample level zero. Build the mip chain only when a view needs it.
              if (tile.mipmapsDirty && camera.zoom * scale < 1) {
                tile.texture.generateMipmaps();
                tile.mipmapsDirty = false;
              }
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
      viewSignature = signature;
      dirtyTiles.clear();
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
      strokeTiles.clear();
      brushBuffer.destroy();
      device.removeEventListener('uncapturederror', uncapturedError);
      context.unconfigure();
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
type TileTexture = ReturnType<typeof makeTexture>;
function createTile(root: TgpuRoot, pixels: Uint8Array | undefined, sampler: ReturnType<TgpuRoot['createSampler']>) {
  const texture = makeTexture(root, true);
  writePixels(root.device, root.unwrap(texture), pixels);
  const camera = root.createBuffer(shader.viewLayout.entries.view.uniform).$usage('uniform');
  return {
    texture,
    render: root.unwrap(texture).createView({ baseMipLevel: 0, mipLevelCount: 1 }),
    mipmapsDirty: true,
    camera,
    viewGroup: root.createBindGroup(shader.viewLayout, { view: camera, image: texture, sampler }),
    stamps: root.createBuffer(d.arrayOf(d.vec4f, STAMP_CAPACITY)).$usage('vertex'),
    base: undefined as TileTexture | undefined,
    mask: undefined as TileTexture | undefined,
    maskRender: undefined as GPUTextureView | undefined,
    strokeGroup: undefined as ReturnType<typeof root.createBindGroup<typeof shader.strokeLayout.entries>> | undefined,
    used: 0
  };
}

/** Reuses per-tile scratch allocations; a new stroke copies the base and clears its mask on the GPU. */
function prepareStroke(root: TgpuRoot, tile: ReturnType<typeof createTile>) {
  if (tile.base) return;
  tile.base = makeTexture(root);
  tile.mask = makeTexture(root);
  tile.maskRender = root.unwrap(tile.mask).createView();
  tile.strokeGroup = root.createBindGroup(shader.strokeLayout, { base: tile.base, mask: tile.mask });
}
function destroyTile(tile: ReturnType<typeof createTile>) {
  tile.texture.destroy();
  tile.mask?.destroy();
  tile.base?.destroy();
  tile.camera.destroy();
  tile.stamps.destroy();
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
/** Lazily groups independent tile passes. Flush before readback, slot reuse, or instance-buffer reuse. */
function commandBatch(device: GPUDevice) {
  let encoder: GPUCommandEncoder | undefined;
  return {
    encoder: () => (encoder ??= device.createCommandEncoder()),
    flush() {
      if (!encoder) return;
      device.queue.submit([encoder.finish()]);
      encoder = undefined;
    }
  };
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
