import { d, tgpu, type TgpuRoot } from 'typegpu';
import { TILE_SIZE, dabTiles, type Brush, type Dab } from '../brush';
import { screenToWorld, type Camera, type ViewSize } from '../camera';
import type { Layer, TileChange } from '../document';
import { packTile, unpackTile } from '../tilePixels';
import { dirtyRegion } from './dirtyRegion';
import { createDisplayCache } from './displayCache';
import * as shader from './shaders';

/** Creates a worker-owned renderer. Committed CPU tiles remain valid after cache eviction or device loss. */
export async function createPaintRenderer(
  canvas: OffscreenCanvas,
  onLost: (message: string) => void,
  options: { device?: GPUDevice; cacheTiles?: number; displayCache?: boolean } = {}
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
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'nearest', mipmapFilter: 'linear' });
  const displayCache = createDisplayCache(root, sampler);
  const cache = new Map<string, ReturnType<typeof createTile>>();
  const strokeTiles = new Map<string, { before: Uint8Array | undefined; mask?: Uint8Array; output?: Uint8Array }>();
  let stroke: { layer: Layer; brush: Brush } | undefined;
  let view: ReturnType<typeof createView> | undefined;
  let viewSignature = '';
  const dirtyTiles = new Set<string>();
  let frame = 0;
  const brushBuffer = root.createBuffer(shader.brushLayout.entries.settings.uniform).$usage('uniform');
  const brushGroup = root.createBindGroup(shader.brushLayout, { settings: brushBuffer });
  const keyFor = (layer: Layer, key: string) => `${layer.id}/${key}`;

  /** Evicts least-recently-used tiles. Active mask readback occurs only when the cache is full. */
  const ensure = async (layer: Layer, key: string) => {
    const id = keyFor(layer, key);
    let tile = cache.get(id);
    if (tile) {
      tile.used = ++frame;
      return tile;
    }
    if (cache.size >= Math.max(1, options.cacheTiles ?? MAX_RESIDENT_TILES)) {
      const [oldId, old] = [...cache].reduce((a, b) => (a[1].used < b[1].used ? a : b));
      const active = strokeTiles.get(oldId);
      if (active && old.mask) {
        [active.mask, active.output] = (
          await readTextures(device, [root.unwrap(old.mask), root.unwrap(old.texture)])
        ).map(packTile);
      }
      destroyTile(old);
      cache.delete(oldId);
    }
    const active = strokeTiles.get(id);
    tile = createTile(root, active?.output ?? layer.tiles.get(key), sampler);
    tile.used = ++frame;
    if (active) {
      prepareStroke(root, tile);
      writePixels(device, root.unwrap(tile.base!), active.before);
      writePixels(device, root.unwrap(tile.mask!), active.mask);
    }
    cache.set(id, tile);
    return tile;
  };

  return {
    /** Resident texture budget is bounded; the count also includes active-stroke resources. */
    stats() {
      return {
        residentTiles: cache.size,
        displayTiles: displayCache.stats().tiles,
        gpuBytes:
          displayCache.stats().bytes +
          [...cache.values()].reduce((n, tile) => n + TILE_SIZE * TILE_SIZE * 4 * (4 / 3 + (tile.base ? 2 : 0)), 0)
      };
    },
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
      for (const [key, dabs] of groups) {
        const id = keyFor(stroke.layer, key);
        const tile = await ensure(stroke.layer, key);
        if (!strokeTiles.has(id)) {
          strokeTiles.set(id, { before: stroke.layer.tiles.get(key) });
          prepareStroke(root, tile);
          const encoder = device.createCommandEncoder();
          encoder.copyTextureToTexture({ texture: root.unwrap(tile.texture) }, { texture: root.unwrap(tile.base!) }, [
            TILE_SIZE,
            TILE_SIZE
          ]);
          clearAttachment(encoder, tile.maskRender!);
          device.queue.submit([encoder.finish()]);
        }
        const [tx, ty] = coordinates(key);
        for (let offset = 0; offset < dabs.length; offset += STAMP_CAPACITY) {
          const batch = dabs.slice(offset, offset + STAMP_CAPACITY);
          const data = new Float32Array(batch.length * 4);
          batch.forEach((dab, index) =>
            data.set([dab.x - tx * TILE_SIZE, dab.y - ty * TILE_SIZE, dab.radius, dab.flow], index * 4)
          );
          device.queue.writeBuffer(root.unwrap(tile.stamps), 0, data);
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: tile.maskRender!, loadOp: 'load', storeOp: 'store' }]
          });
          pipelines.stamp.with(pass).with(brushGroup).with(shader.stampLayout, tile.stamps).draw(6, batch.length);
          pass.end();
          pipelines.stroke
            .with(encoder)
            .with(brushGroup)
            .with(tile.strokeGroup!)
            .withColorAttachment({ view: tile.render, loadOp: 'clear' })
            .draw(3);
          device.queue.submit([encoder.finish()]);
        }
        tile.mipmapsDirty = true;
        displayCache.remove(id);
        dirtyTiles.add(key);
      }
    },
    /** Copies resident touched tiles in one submission/map; retains scratch textures for subsequent strokes. */
    async finish(): Promise<TileChange[]> {
      if (!stroke) return [];
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
      return changes;
    },
    /** Discards preview pixels and restores the committed document on the next render. */
    cancel() {
      if (strokeTiles.size) viewSignature = '';
      for (const id of strokeTiles.keys()) {
        const tile = cache.get(id);
        if (tile) destroyTile(tile);
        cache.delete(id);
      }
      strokeTiles.clear();
      stroke = undefined;
    },
    /** Invalidates cached pixels after undo, redo, import, or layer deletion. */
    reset() {
      displayCache.clear();
      viewSignature = '';
      dirtyTiles.clear();
      for (const tile of cache.values()) destroyTile(tile);
      cache.clear();
      strokeTiles.clear();
      stroke = undefined;
    },
    /** Rebuilds the viewport without evicting tile resources. Also permits comparison with a full redraw. */
    invalidateView() {
      viewSignature = '';
    },
    /** Rebuilds changed screen regions; camera/layer changes rebuild the full view. Cached output survives tile eviction. */
    async render(layers: Layer[], camera: Camera, size: ViewSize, dpr: number) {
      const scale = Math.min(
        dpr,
        2,
        device.limits.maxTextureDimension2D / Math.max(size.width, size.height),
        Math.sqrt(8_388_608 / Math.max(1, size.width * size.height))
      );
      const width = Math.max(1, Math.round(size.width * scale)),
        height = Math.max(1, Math.round(size.height * scale));
      if (!view || view.width !== width || view.height !== height) {
        view?.destroy();
        canvas.width = width;
        canvas.height = height;
        view = createView(root, width, height);
        viewSignature = '';
      }
      const signature = JSON.stringify([
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
      if (!region) {
        dirtyTiles.clear();
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
      let read = view.a,
        write = view.b;
      for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        const keys = new Set(layer.tiles.keys());
        if (stroke?.layer.id === layer.id) for (const id of strokeTiles.keys()) keys.add(id.slice(layer.id.length + 1));
        const visible = [...keys].filter((key) => {
          const [x, y] = coordinates(key);
          return (
            (x + 1) * TILE_SIZE >= minX && x * TILE_SIZE <= maxX && (y + 1) * TILE_SIZE >= minY && y * TILE_SIZE <= maxY
          );
        });
        if (!visible.length) continue;
        const batchSize = Math.min(64, Math.max(1, options.cacheTiles ?? MAX_RESIDENT_TILES));
        for (let offset = 0; offset < visible.length; offset += batchSize) {
          const batch = [];
          for (const key of visible.slice(offset, offset + batchSize)) {
            const [x, y] = coordinates(key);
            const id = keyFor(layer, key);
            const tile =
              cache.has(id) || strokeTiles.has(id) || options.displayCache === false
                ? await ensure(layer, key)
                : displayCache.get(id, layer.tiles.get(key)!, camera.zoom * scale);
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
            colorAttachments: [{ view: view.layerRender, loadOp: offset === 0 ? 'clear' : 'load', storeOp: 'store' }]
          });
          pass.setScissorRect(region.x, region.y, region.width, region.height);
          for (const tile of batch) pipelines.tile.with(pass).with(tile.viewGroup).draw(6);
          pass.end();
          device.queue.submit([encoder.finish()]);
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
      const copy = device.createCommandEncoder();
      const origin = { x: region.x, y: region.y };
      copy.copyTextureToTexture(
        { texture: root.unwrap(read), origin },
        { texture: root.unwrap(view.composed), origin },
        [region.width, region.height]
      );
      device.queue.submit([copy.finish()]);
      pipelines.present.with(view.present).withColorAttachment({ view: context, loadOp: 'clear' }).draw(3);
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
      view?.destroy();
      displayCache.destroy();
      for (const tile of cache.values()) destroyTile(tile);
      cache.clear();
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
