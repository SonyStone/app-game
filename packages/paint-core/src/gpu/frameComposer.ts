import { commandBatch } from '@app-game/abr-paint/gpu/commandBatch';
import { d, type TgpuRoot } from 'typegpu';
import { TILE_SIZE } from '../brush';
import { screenToWorld, type Camera, type ViewSize } from '../camera';
import type { Layer } from '../document';
import type { createDisplayCache } from './displayCache';
import * as shader from './shaders';
import type { StrokeRaster } from './strokeRaster';
import type { StrokeData } from './strokeState';
import { compositionFormat, type TargetView } from './targetView';
import type { TileResidency } from './tileResidency';
import { clearAttachment, MAX_RESIDENT_TILES, tileCoordinates, tileId, type createMipmapEnsurer } from './tileTextures';
import type { createVirtualTexture } from './virtualTexture';
import { visibleTileKeys } from './visibleTileKeys';

/**
 * Composes the document into a target's viewport and presents it. Changed screen regions are rebuilt layer by
 * layer: committed pixels come from the virtual texture when streaming, otherwise (and for the active stroke's
 * output and preview tail) from resident or display-cache tiles; each layer is then blended over the result.
 */
export function createFrameComposer(
  root: TgpuRoot,
  format: GPUTextureFormat,
  deps: {
    stroke: StrokeData;
    residency: TileResidency;
    raster: StrokeRaster;
    displayCache: ReturnType<typeof createDisplayCache>;
    ensureMipmaps: ReturnType<typeof createMipmapEnsurer>;
    virtual: ReturnType<typeof createVirtualTexture> | undefined;
    /** Whether the selection outline animates; read at presentation. */
    animateSelection: () => boolean;
  },
  options: {
    cacheTiles?: number;
    displayCache?: boolean;
    adaptiveMipmaps?: boolean;
    batchViewMipmaps?: boolean;
  }
) {
  const { stroke, residency, displayCache, virtual } = deps;
  const device = root.device;
  const pipelines = {
    tile: root.createRenderPipeline({
      vertex: shader.tileVertex,
      fragment: shader.tileFragment,
      targets: { format: 'rgba8unorm' }
    }),
    composite: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.compositeFragment,
      targets: { format: compositionFormat }
    }),
    resolve: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.resolveFragment,
      targets: { format: 'rgba8unorm' }
    }),
    present: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.presentFragment,
      targets: { format }
    }),
    clear: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.clearFragment,
      targets: { format: compositionFormat }
    })
  };
  const stats = { viewportUpdate: { full: false, pixels: 0 }, previewTileDraws: 0, sourceTileDraws: 0 };

  return {
    /** Draw counters and damaged pixels of the latest frame. */
    stats: () => stats,

    /** Rebuilds changed screen regions; camera/layer changes rebuild the full view. Cached output survives tile
     * eviction. Presents unless a finished stroke's preview is held until its refreshed overview is resident.
     */
    async render(target: TargetView, layers: Layer[], camera: Camera, size: ViewSize, dpr: number, exact: boolean) {
      const scale = renderScale(size, dpr, device.limits.maxTextureDimension2D);
      const width = Math.max(1, Math.round(size.width * scale)),
        height = Math.max(1, Math.round(size.height * scale));
      const view =
        target.view && target.view.width === width && target.view.height === height
          ? target.view
          : target.resize(width, height);
      const pages = target.pages();
      const cameraSignature = viewSignature(camera, size, width, height);
      const signature = `${exact}|${virtual?.uploadedBytes() ?? ''}|${cameraSignature}|${compositionSignature(layers)}`;
      const plan = target.damage.plan(signature, camera, size, { width, height });
      const region = plan.region;
      stats.previewTileDraws = 0;
      stats.sourceTileDraws = 0;
      stats.viewportUpdate = { full: plan.full, pixels: region ? region.width * region.height : 0 };
      // One encoder holds the frame. It is submitted early only before resources referenced by encoded passes are
      // recycled (tile eviction, display-cache replacement, tail scratch reuse, instance-range wrap) and before
      // helpers that submit their own work which must follow encoded passes (fallback reprojection).
      const frame = commandBatch(device);
      const present = () => {
        // Both passes target the same swapchain texture. The cached artwork never contains the outline.
        const swapchain = target.context.getCurrentTexture().createView();
        const encoder = frame.encoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [{ view: swapchain, loadOp: 'clear', storeOp: 'store' }]
        });
        pipelines.present.with(pass).with(view.present).draw(3);
        pass.end();
        if (!exact) {
          target
            .lasso()
            .render(
              swapchain,
              camera,
              size,
              width,
              height,
              deps.animateSelection() ? performance.now() / 1000 : 0,
              encoder
            );
        }
      };

      try {
        if (!region) {
          present();
          frame.flush();
          target.damage.presented(plan);
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
        const bounds = {
          minX: Math.min(...corners.map((p) => p.x)),
          maxX: Math.max(...corners.map((p) => p.x)),
          minY: Math.min(...corners.map((p) => p.y)),
          maxY: Math.max(...corners.map((p) => p.y))
        };
        // The first composite reads this base only inside the damage region.
        if (plan.full) {
          clearAttachment(frame.encoder(), view.aRender);
        } else {
          const pass = frame.encoder().beginRenderPass({
            colorAttachments: [{ view: view.aRender, loadOp: 'load', storeOp: 'store' }]
          });
          pass.setScissorRect(region.x, region.y, region.width, region.height);
          pipelines.clear.with(pass).draw(3);
          pass.end();
        }

        const stream = virtual && layers.filter((layer) => layer.visible && layer.opacity > 0).length <= 24;
        pages?.begin(layers);
        let read = view.a,
          write = view.b;
        let slot = 0;
        for (const layer of layers) {
          if (!layer.visible || layer.opacity <= 0) {
            continue;
          }

          const active = stroke.current?.layer.id === layer.id;
          let streamed = false;
          if (stream && !exact) {
            const planned = pages!.plan(layer, camera, size, scale, frame.flush);
            const pass = frame.encoder().beginRenderPass({
              colorAttachments: [{ view: view.layerRender, loadOp: 'clear', storeOp: 'store' }]
            });
            pass.setScissorRect(region.x, region.y, region.width, region.height);
            planned.draw(pass);
            // A cold layer keeps the original complete-tile path until background coverage is ready.
            streamed = !active || planned.covered;
            pass.end();
          }

          if (!streamed || active) {
            const drawn = await drawTiles(
              frame,
              view.layerRender,
              layer,
              active,
              streamed,
              exact,
              camera,
              size,
              scale,
              {
                width,
                height,
                region,
                bounds
              }
            );
            if (!drawn) {
              continue;
            }
          }

          // Each composited layer owns a settings slot, so every composite pass can share the frame encoder.
          const composite = view.composite(slot++);
          composite.settings.write(d.vec4f(layer.opacity, BLEND_MODES.indexOf(layer.blend), 0, 0));
          const pass = frame.encoder().beginRenderPass({
            colorAttachments: [
              { view: write === view.a ? view.aRender : view.bRender, loadOp: 'clear', storeOp: 'store' }
            ]
          });
          pass.setScissorRect(region.x, region.y, region.width, region.height);
          pipelines.composite
            .with(pass)
            .with(read === view.a ? composite.fromA : composite.fromB)
            .draw(3);
          pass.end();
          [read, write] = [write, read];
        }

        pages?.end();
        // Keep the last brush preview until its updated overview is resident; navigation remains immediate.
        const refining = !exact && !!pages?.debug().some((page) => !page.resident || page.fallback);
        if (refining && !stroke.current && target.hold === cameraSignature) {
          return;
        }

        if (refining && !stroke.current && target.complete) {
          // Captures the previous composed image, which the resolve pass below has not replaced yet.
          target.fallback?.capture(root.unwrap(view.composed), target.complete.camera, target.complete.size);
          target.complete = undefined;
        }

        target.hold = '';
        target.presented = cameraSignature;
        const resolve = frame.encoder().beginRenderPass({
          colorAttachments: [{ view: view.composedRender, loadOp: 'load', storeOp: 'store' }]
        });
        resolve.setScissorRect(region.x, region.y, region.width, region.height);
        pipelines.resolve
          .with(resolve)
          .with(read === view.a ? view.resolveA : view.resolveB)
          .draw(3);
        resolve.end();
        if (refining && !stroke.current) {
          // Reprojection submits its own pass, which must draw over the resolved region.
          frame.flush();
          target.fallback?.draw(root.unwrap(view.composed), camera, size);
        }

        if (!refining) {
          target.complete = { camera: { ...camera }, size: { ...size } };
          target.fallback?.clear();
        }

        present();
        frame.flush();
        target.damage.presented(plan);
      } finally {
        // Encoded mip passes already advanced tile state; submit them even when the frame stops early or fails.
        frame.flush();
      }
    }
  };

  /**
   * Draws a layer's resident/display tiles (and, for the active stroke, its output and preview tail) into
   * `layerTarget`, replacing streamed pixels. Returns false when nothing needs compositing for this layer.
   */
  async function drawTiles(
    frame: ReturnType<typeof commandBatch>,
    layerTarget: GPUTextureView,
    layer: Layer,
    active: boolean,
    streamed: boolean,
    exact: boolean,
    camera: Camera,
    size: ViewSize,
    scale: number,
    area: {
      width: number;
      height: number;
      region: { x: number; y: number; width: number; height: number };
      bounds: { minX: number; maxX: number; minY: number; maxY: number };
    }
  ) {
    const { region } = area;
    // Committed pixels already come from the pyramid. Only the active stroke's output
    // replaces those pixels; scanning/loading every document tile here defeats virtual texturing.
    const visible = visibleTileKeys(
      layer,
      active ? stroke.tiles : undefined,
      active && !exact ? stroke.tail : undefined,
      streamed,
      area.bounds
    );
    if (!visible.length && !streamed) {
      return false;
    }

    const batchSize = Math.min(
      stroke.tail.size && !exact ? 8 : 64,
      Math.max(1, options.cacheTiles ?? MAX_RESIDENT_TILES)
    );
    for (let offset = 0; offset < visible.length; offset += batchSize) {
      const keys = visible.slice(offset, offset + batchSize);
      const batch = [];
      // Loaded but undrawn members; loading the rest of the batch must not evict them.
      const pinned = new Set<string>();
      let tailSlot = 0;
      for (const key of keys) {
        const [x, y] = tileCoordinates(key);
        const id = tileId(layer.id, key);
        // Display evicted active output without restoring its full-size brush mask/base.
        // Only actual painting may bring that scratch state back into the working set.
        const snapshot = stroke.tiles.get(id);
        // An evicted tile owns a pending snapshot, not an empty/committed replacement.
        if (!residency.has(id)) {
          await residency.awaitSnapshots([snapshot?.pending]);
        }

        const source = snapshot?.output ?? layer.tiles.get(key)!;
        const tail = active && !exact ? stroke.tail.get(key) : undefined;
        let tile =
          tail || residency.has(id) || options.displayCache === false
            ? await residency.ensure(layer, key, frame, pinned)
            : (displayCache.find(id, source, camera.zoom * scale, frame.flush) ??
              displayCache.get(id, (await residency.readTile(source))!, camera.zoom * scale, source, frame.flush));
        pinned.add(id);
        if (tail) {
          // prepareTail submits its own copies: encoded source clears must run first, and earlier
          // batches may still sample the pooled tail tiles it rewrites.
          frame.flush();
          tile = deps.raster.prepareTail(residency.get(id)!, !!snapshot, tail, tailSlot++, x, y);
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

      // Load the entire bounded tile batch before encoding mipmaps. Loading can
      // evict textures or submit tail updates; no unsubmitted mip writes may span it.
      // The mip passes and their display reads then share the frame's submission.
      for (const tile of batch) {
        // Magnified tiles sample level zero. Build the mip chain only when a view needs it.
        const mipScale = camera.zoom * Math.min(area.width / size.width, area.height / size.height);
        if (mipScale < 1) {
          // Keep one level beyond the ideal LOD for trilinear filtering and viewport rounding.
          // Coarse cache entries already represent fewer texels across the same document tile.
          const required =
            options.adaptiveMipmaps === false
              ? 8
              : Math.ceil(Math.log2(tile.texture.props.size[0] / (TILE_SIZE * mipScale))) + 1;
          deps.ensureMipmaps(tile, required, options.batchViewMipmaps === false ? undefined : frame.encoder());
        }
      }

      const pass = frame.encoder().beginRenderPass({
        colorAttachments: [
          { view: layerTarget, loadOp: offset === 0 && !streamed ? 'clear' : 'load', storeOp: 'store' }
        ]
      });
      pass.setScissorRect(region.x, region.y, region.width, region.height);
      // No blending: output includes the pre-stroke base and may be completely transparent
      // after erasing. Replace the layer pixels before applying its opacity/blend exactly once.
      for (const tile of batch) {
        pipelines.tile.with(pass).with(tile.viewGroup).draw(6);
      }

      for (const key of keys) {
        if (active && stroke.tiles.has(tileId(layer.id, key))) {
          stats.previewTileDraws++;
        } else {
          stats.sourceTileDraws++;
        }
      }

      pass.end();
    }

    return true;
  }
}

/** Shared target pixel budget for presentation and contact-time LOD selection. */
export function renderScale(size: ViewSize, dpr: number, maxDimension: number) {
  return Math.min(
    dpr,
    2,
    maxDimension / Math.max(size.width, size.height),
    Math.sqrt(8_388_608 / Math.max(1, size.width * size.height))
  );
}

/** Blend mode indices understood by the composite shader. */
const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'linear'];

/** Identifies a presented camera and backing size without JSON-encoding objects every frame. */
function viewSignature(camera: Camera, size: ViewSize, width: number, height: number) {
  return `${camera.x},${camera.y},${camera.zoom},${camera.angle},${camera.mirrored},${size.width},${size.height},${width},${height}`;
}

/** Layer order and composite settings; length-prefixed ids cannot collide with separators. */
function compositionSignature(layers: readonly Layer[]) {
  let signature = '';
  for (const { id, visible, opacity, blend } of layers) {
    signature += `${id.length}:${id},${visible},${opacity},${blend};`;
  }

  return signature;
}
