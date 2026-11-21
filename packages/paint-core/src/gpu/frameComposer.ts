import { commandBatch } from '@app-game/abr-paint/gpu/commandBatch';
import { d, type TgpuRoot } from 'typegpu';
import { TILE_SIZE } from '../brush';
import { screenToWorld, type Camera, type ViewSize } from '../camera';
import type { BlendMode, Layer } from '../document';
import { maskCoverage, type LayerMask } from '../layerMask';
import { blendModes } from '../layerMerge';
import { stackItems, walkStack } from '../layerStack';
import { isFlatStack, shownMask, type ShownLayer } from '../layerTree';
import type { createDisplayCache } from './displayCache';
import type { FloatingPixelsState } from './floatingPixels';
import { isMaskPlane, maskPlane, type MaskPlane } from './maskPlane';
import { createPixelGrid } from './pixelGrid';
import * as shader from './shaders';
import type { StrokeRaster } from './strokeRaster';
import type { StrokeData } from './strokeState';
import { compositionFormat, type TargetView, type ViewTexture, type ViewTextures } from './targetView';
import type { TileResidency } from './tileResidency';
import { clearAttachment, MAX_RESIDENT_TILES, tileCoordinates, tileId, type createMipmapEnsurer } from './tileTextures';
import type { createVirtualTexture } from './virtualTexture';
import { visibleTileKeys } from './visibleTileKeys';

/**
 * Composes the document into a target's viewport and presents it. Changed screen regions are rebuilt layer by
 * layer: committed pixels come from the virtual texture when streaming, otherwise (and for the active stroke's
 * output and preview tail) from resident or display-cache tiles, with floating pixels cut out and drawn moved; each
 * layer is then blended over the result.
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
    /** Pixels lifted off a layer and shown moved, drawn into that layer before it is blended. */
    floating: FloatingPixelsState;
    /** Whether the selection outline animates; read at presentation. */
    animateSelection: () => boolean;
    /** Whether magnified pixels blend smoothly rather than show as flat squares; see `tileFragment`. */
    smoothPixels: () => boolean;
    /** Whether the pixel grid shows over presented frames, from `pixelGridZoom`. */
    pixelGrid: () => boolean;
    /** Whether layers blend in linear light; see the composite shader's `settings.w`. */
    linearBlending: () => boolean;
    /**
     * The mask shown as the red overlay over presented frames, and its strength, 0–1, at full hiding; none without
     * one. Read every frame.
     */
    overlay: () => { mask: LayerMask; strength: number } | undefined;
  },
  options: {
    cacheTiles?: number;
    displayCache?: boolean;
    adaptiveMipmaps?: boolean;
    batchViewMipmaps?: boolean;
  }
) {
  const grid = createPixelGrid(root, format);
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
    rubylith: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.rubylithFragment,
      targets: {
        format,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
        }
      }
    }),
    clear: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.clearFragment,
      targets: { format: compositionFormat }
    }),
    fade: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.fadeFragment,
      targets: { format: compositionFormat }
    }),
    maskedComposite: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.maskedCompositeFragment,
      targets: { format: compositionFormat }
    }),
    maskedFade: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.maskedFadeFragment,
      targets: { format: compositionFormat }
    }),
    /** A masked clipping base into the 8-bit `clip` texture. */
    maskApply8: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.maskApplyFragment,
      targets: { format: 'rgba8unorm' }
    }),
    /** A masked folder's coverage into a composition texture. */
    maskApply16: root.createRenderPipeline({
      vertex: shader.fullscreenVertex,
      fragment: shader.maskApplyFragment,
      targets: { format: compositionFormat }
    })
  };
  const stats = {
    viewportUpdate: { full: false, pixels: 0 },
    previewTileDraws: 0,
    sourceTileDraws: 0,
    /** Deepest nesting of folder levels the latest frame composited; 0 for a flat stack. */
    folderLevels: 0,
    /** Further composition textures the latest frame used (`ViewTextures.scratch`), each a full view in rgba16float. */
    scratchTextures: 0
  };

  return {
    /** Draw counters and damaged pixels of the latest frame. */
    stats: () => stats,

    /** Rebuilds changed screen regions; camera/layer changes rebuild the full view. Cached output survives tile
     * eviction. Presents unless a finished stroke's preview is held until its refreshed overview is resident.
     */
    async render(
      target: TargetView,
      layers: ShownLayer[],
      camera: Camera,
      size: ViewSize,
      dpr: number,
      exact: boolean
    ) {
      const scale = renderScale(size, dpr, device.limits.maxTextureDimension2D);
      const width = Math.max(1, Math.round(size.width * scale)),
        height = Math.max(1, Math.round(size.height * scale));
      const view =
        target.view && target.view.width === width && target.view.height === height
          ? target.view
          : target.resize(width, height);
      const pages = target.pages();
      const cameraSignature = viewSignature(camera, size, width, height);
      // An exact render, for an export or a capture, never shows the overlay.
      const overlay = exact ? undefined : deps.overlay();
      const signature = `${exact}|${virtual?.uploadedBytes() ?? ''}|${cameraSignature}|${compositionSignature(layers)}${overlay ? `|overlay${maskSignature(overlay.mask)}` : ''}`;
      const plan = target.damage.plan(signature, camera, size, { width, height });
      const region = plan.region;
      stats.previewTileDraws = 0;
      stats.sourceTileDraws = 0;
      stats.folderLevels = 0;
      stats.scratchTextures = 0;
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
        if (overlay) {
          const { settings, binding } = view.overlay();
          settings.write(d.vec4f(0, overlay.strength, overlay.mask.inverted ? 1 : 0, 0));
          const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: swapchain, loadOp: 'load', storeOp: 'store' }]
          });
          pipelines.rubylith.with(pass).with(binding).draw(3);
          pass.end();
        }

        if (!exact) {
          if (deps.pixelGrid()) {
            grid.render(encoder, target, swapchain, camera, size, width, height);
          }

          target
            .selection()
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
        /**
         * Draws `layer`'s pixels in the damaged region into `view.layer`: streamed pages, resident or display-cache
         * tiles, the active stroke's output and floating pixels. Returns false when nothing needs compositing.
         */
        const drawLayer = async (layer: Layer) => {
          const active = stroke.current?.layer.id === layer.id;
          const floats = deps.floating.layerId() === layer.id;
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
              if (!floats) {
                return false;
              }

              // Floating pixels may move over a part of their layer without pixels of its own.
              clearAttachment(frame.encoder(), view.layerRender);
            }
          }

          if (floats) {
            deps.floating.render(frame.encoder(), view.layerRender, region, camera, size);
          }

          return true;
        };
        /**
         * Draws `mask`'s coverage in the damaged region into `view.mask()`: its tiles, including the active stroke's
         * output when the stroke paints the mask, over its `outside` coverage everywhere else.
         */
        const drawMask = async (mask: LayerMask) => {
          const target = view.mask();
          const plane = maskPlane(mask);
          const outside = mask.outside / 255;
          const clearValue = { r: outside, g: outside, b: outside, a: 1 };
          const active = stroke.current?.layer.id === plane.id;
          const area = { width, height, region, bounds };
          const drawn = await drawTiles(
            frame,
            target.render,
            plane,
            active,
            false,
            exact,
            camera,
            size,
            scale,
            area,
            clearValue
          );
          if (!drawn) {
            const pass = frame.encoder().beginRenderPass({
              colorAttachments: [{ view: target.render, loadOp: 'clear', clearValue, storeOp: 'store' }]
            });
            pass.end();
          }

          return target;
        };
        const read = isFlatStack(layers)
          ? await composeFlat(frame, view, layers, region, drawLayer, drawMask)
          : await composeFolders(frame, view, layers, region, drawLayer, drawMask);
        if (overlay) {
          // The overlay keeps its own copy of the mask, updated where the view changed, for presenting.
          copyRegion(frame, await drawMask(overlay.mask), view.overlay().image, region);
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
        pipelines.resolve.with(resolve).with(view.resolveOf(read)).draw(3);
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
   * Composites a flat stack (`isFlatStack`): each layer is drawn into `view.layer`, then blended over the result in
   * `a`/`b`. Returns the texture holding the result.
   */
  async function composeFlat(
    frame: ReturnType<typeof commandBatch>,
    view: ViewTextures,
    layers: readonly ShownLayer[],
    region: Region,
    drawLayer: (layer: Layer) => Promise<boolean>,
    drawMask: (mask: LayerMask) => Promise<ViewTexture>
  ): Promise<ViewTexture> {
    let read = view.a,
      write = view.b;
    let slot = 0;
    const linear = deps.linearBlending() ? 1 : 0;
    /**
     * The clipping base for clipped layers that follow: none before the first unclipped layer, hidden when the
     * base is not drawn, so its clipped layers are not either, and ready once its pixels are in `view.clip`.
     */
    let clipBase: 'none' | 'hidden' | 'ready' = 'none';
    for (const [index, layer] of layers.entries()) {
      // A clipped layer without a base below it is drawn as an ordinary layer.
      const clipped = !!layer.clipping && clipBase !== 'none';
      if (clipped && clipBase === 'hidden') {
        continue;
      }

      if (!layer.visible || layer.opacity <= 0) {
        if (!clipped) {
          clipBase = 'hidden';
        }

        continue;
      }

      if (!(await drawLayer(layer))) {
        if (!clipped) {
          clipBase = 'hidden';
        }

        continue;
      }

      const mask = shownMask(layer);
      const maskTexture = mask && (await drawMask(mask));
      if (!clipped) {
        clipBase = 'ready';
        if (layers[index + 1]?.clipping) {
          // Layers clipped to a masked base see its masked shape.
          if (mask) {
            applyMask(frame, view, slot++, view.entries.layer, maskTexture!, view.entries.clip, mask, region);
          } else {
            copyRegion(frame, view.entries.layer, view.entries.clip, region);
          }
        }
      }

      const pass = frame.encoder().beginRenderPass({
        colorAttachments: [{ view: write === view.a ? view.aRender : view.bRender, loadOp: 'clear', storeOp: 'store' }]
      });
      pass.setScissorRect(region.x, region.y, region.width, region.height);
      if (mask) {
        const bound = view.bindMasked(slot++, 'composite', {
          base: read === view.a ? view.entries.a : view.entries.b,
          source: view.entries.layer,
          clip: view.entries.clip,
          mask: maskTexture!
        });
        bound.settings.write(
          d.vec4f(layer.opacity, blendModes.indexOf(layer.blend), (clipped ? 1 : 0) + (mask.inverted ? 2 : 0), linear)
        );
        pipelines.maskedComposite.with(pass).with(bound.binding).draw(3);
      } else {
        // Each composited layer owns a settings slot, so every composite pass can share the frame encoder.
        const composite = view.composite(slot++);
        composite.settings.write(d.vec4f(layer.opacity, blendModes.indexOf(layer.blend), clipped ? 1 : 0, linear));
        pipelines.composite
          .with(pass)
          .with(read === view.a ? composite.fromA : composite.fromB)
          .draw(3);
      }

      pass.end();
      [read, write] = [write, read];
    }

    return read === view.a ? view.entries.a : view.entries.b;
  }

  /**
   * Writes `source` scaled by the coverage of `mask`, drawn into `maskTexture`, into `target` in `region`, with the
   * frame's `slot`-th settings: the masked shape of a clipping base, or of a folder's coverage.
   */
  function applyMask(
    frame: ReturnType<typeof commandBatch>,
    view: ViewTextures,
    slot: number,
    source: ViewTexture,
    maskTexture: ViewTexture,
    target: ViewTexture,
    mask: LayerMask,
    region: Region
  ) {
    const bound = view.bindMasked(slot, 'apply', { source, mask: maskTexture });
    bound.settings.write(d.vec4f(0, 0, mask.inverted ? 1 : 0, 0));
    const pass = frame.encoder().beginRenderPass({
      colorAttachments: [{ view: target.render, loadOp: 'load', storeOp: 'store' }]
    });
    pass.setScissorRect(region.x, region.y, region.width, region.height);
    (target === view.entries.clip ? pipelines.maskApply8 : pipelines.maskApply16)
      .with(pass)
      .with(bound.binding)
      .draw(3);
    pass.end();
  }

  /**
   * Composites a stack with folders that composite on their own, following `walkStack` as the CPU compositor
   * (`composeStack`) does. Every level is a composition texture of its own: `a` starts the root, cleared in the
   * region; a folder's level comes from the free textures, `b` first, then `view.scratch`. A composite writes into a
   * free texture and frees the one it read, so each live level holds one texture and the frame needs one more
   * than its deepest nesting, plus one for a folder whose coverage clipped layers use. Returns the result's texture.
   */
  async function composeFolders(
    frame: ReturnType<typeof commandBatch>,
    view: ViewTextures,
    layers: readonly ShownLayer[],
    region: Region,
    drawLayer: (layer: Layer) => Promise<boolean>,
    drawMask: (mask: LayerMask) => Promise<ViewTexture>
  ): Promise<ViewTexture> {
    const linear = deps.linearBlending() ? 1 : 0;
    const free: ViewTexture[] = [view.entries.b];
    let scratch = 0;
    let slot = 0;
    const take = () => free.pop() ?? view.scratch(scratch++);
    const release = (texture: ViewTexture | undefined) => {
      if (texture) {
        free.push(texture);
      }
    };
    /** Each level's result so far, and the folder coverage it keeps for clipped layers right above that folder. */
    const levels: { image: ViewTexture; kept?: ViewTexture }[] = [{ image: view.entries.a }];
    /**
     * Writes the `fade`, or the composite, of `source` onto the top level's result, with `settings`; `clip` is the
     * clipping base a composite reads. With `masked`, a mask drawn into that texture scales the source, or the fade.
     */
    const blendOnto = (
      source: ViewTexture,
      clip: ViewTexture,
      settings: d.v4f,
      fade: boolean,
      masked?: ViewTexture
    ) => {
      const level = levels.at(-1)!;
      const target = take();
      const bound = masked
        ? view.bindMasked(slot++, fade ? 'fade' : 'composite', { base: level.image, source, clip, mask: masked })
        : view.bindComposite(slot++, level.image, source, clip, fade);
      bound.settings.write(settings);
      const pass = frame.encoder().beginRenderPass({
        colorAttachments: [{ view: target.render, loadOp: 'clear', storeOp: 'store' }]
      });
      pass.setScissorRect(region.x, region.y, region.width, region.height);
      const pipeline = masked
        ? fade
          ? pipelines.maskedFade
          : pipelines.maskedComposite
        : fade
          ? pipelines.fade
          : pipelines.composite;
      pipeline.with(pass).with(bound.binding).draw(3);
      pass.end();
      release(level.image);
      level.image = target;
    };
    /** `image` scaled by `mask`, drawn into `masked`, in a texture of its own; `image` is released. */
    const maskedCopy = (image: ViewTexture, masked: ViewTexture, mask: LayerMask) => {
      const target = take();
      applyMask(frame, view, slot++, image, masked, target, mask, region);
      release(image);
      return target;
    };
    const dropKept = (level: (typeof levels)[number]) => {
      release(level.kept);
      level.kept = undefined;
    };

    await walkStack(stackItems(layers), {
      async layer(layer, clip, base) {
        const level = levels.at(-1)!;
        if (!clip) {
          dropKept(level);
        }

        if (!(await drawLayer(layer))) {
          return false;
        }

        const mask = shownMask(layer);
        const masked = mask && (await drawMask(mask));
        if (!clip && base) {
          // Layers clipped to a masked base see its masked shape.
          if (mask) {
            applyMask(frame, view, slot++, view.entries.layer, masked!, view.entries.clip, mask, region);
          } else {
            copyRegion(frame, view.entries.layer, view.entries.clip, region);
          }
        }

        const clipTexture = clip?.type === 'group' ? level.kept! : view.entries.clip;
        const flags = (clip ? 1 : 0) + (mask?.inverted ? 2 : 0);
        blendOnto(
          view.entries.layer,
          clipTexture,
          d.vec4f(layer.opacity, blendModes.indexOf(layer.blend), flags, linear),
          false,
          masked
        );
        return true;
      },
      enter(_group, mode) {
        const level = levels.at(-1)!;
        dropKept(level);
        const image = take();
        if (mode === 'fade') {
          copyRegion(frame, level.image, image, region);
        } else {
          const pass = frame.encoder().beginRenderPass({
            colorAttachments: [{ view: image.render, loadOp: 'load', storeOp: 'store' }]
          });
          pass.setScissorRect(region.x, region.y, region.width, region.height);
          pipelines.clear.with(pass).draw(3);
          pass.end();
        }

        levels.push({ image });
        stats.folderLevels = Math.max(stats.folderLevels, levels.length - 1);
      },
      async leave(group, mode, drew, keep) {
        const { image } = levels.pop()!;
        const mask = group.mask;
        // The folder's mask scales its composite, or how far its fade goes, and its coverage for clipped layers.
        const masked = mask && (drew || keep) ? await drawMask(mask) : undefined;
        const inverted = mask?.inverted ? 1 : 0;
        if (drew && mode === 'isolated') {
          const blend = blendModes.indexOf(group.blend as BlendMode);
          blendOnto(image, view.entries.clip, d.vec4f(group.opacity, blend, inverted * 2, linear), false, masked);
        } else if (drew && mode === 'fade') {
          blendOnto(image, view.entries.clip, d.vec4f(group.opacity, 0, inverted, linear), true, masked);
        }

        const level = levels.at(-1)!;
        if (keep) {
          level.kept = masked ? maskedCopy(image, masked, mask!) : image;
        } else {
          release(image);
        }
      }
    });
    stats.scratchTextures = Math.max(stats.scratchTextures, scratch);
    return levels[0]!.image;
  }

  /** Copies `region` of `from` into `to`, two textures of the same format and size. */
  function copyRegion(frame: ReturnType<typeof commandBatch>, from: ViewTexture, to: ViewTexture, region: Region) {
    frame
      .encoder()
      .copyTextureToTexture(
        { texture: root.unwrap(from.texture), origin: [region.x, region.y] },
        { texture: root.unwrap(to.texture), origin: [region.x, region.y] },
        [region.width, region.height]
      );
  }

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
    },
    /** What the first batch clears `layerTarget` to: transparent, or a mask's `outside` coverage. */
    clearValue?: GPUColor
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
        // Stroke output shows as it was read back; a mask plane's committed tiles show their coverage, one channel.
        const coverage = isMaskPlane(layer) && !snapshot?.output;
        const pixels = async () =>
          coverage
            ? maskCoverage(await residency.readTile(source), (layer as MaskPlane).maskOf.outside)
            : (await residency.readTile(source))!;
        let tile =
          tail || residency.has(id) || options.displayCache === false
            ? await residency.ensure(layer, key, frame, pinned)
            : (displayCache.find(id, source, camera.zoom * scale, frame.flush) ??
              displayCache.get(
                id,
                await pixels(),
                camera.zoom * scale,
                source,
                frame.flush,
                coverage ? 'r8unorm' : 'rgba8unorm'
              ));
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
          sharp: deps.smoothPixels() ? 0 : 1,
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
          {
            view: layerTarget,
            loadOp: offset === 0 && !streamed ? 'clear' : 'load',
            ...(clearValue ? { clearValue } : {}),
            storeOp: 'store'
          }
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

/** A rectangle of the view's backing pixels. */
type Region = { x: number; y: number; width: number; height: number };

/** Shared target pixel budget for presentation and contact-time LOD selection. */
export function renderScale(size: ViewSize, dpr: number, maxDimension: number) {
  return Math.min(
    dpr,
    2,
    maxDimension / Math.max(size.width, size.height),
    Math.sqrt(8_388_608 / Math.max(1, size.width * size.height))
  );
}

/** Identifies a presented camera and backing size without JSON-encoding objects every frame. */
function viewSignature(camera: Camera, size: ViewSize, width: number, height: number) {
  return `${camera.x},${camera.y},${camera.zoom},${camera.angle},${camera.mirrored},${size.width},${size.height},${width},${height}`;
}

/**
 * Layer order and composite settings, clipping included; length-prefixed ids cannot collide with separators. Reads
 * the layers as they show (`createDocument`'s `layers`), so a change of folders damages the view exactly when it
 * changes what the canvas shows: wrapping layers in a visible folder changes nothing, hiding it changes the layers'
 * visibility, and a folder that composites on its own adds itself, its settings and the folders around it to each of
 * its layers, as a folder a layer is clipped to adds itself. A flat stack's signature is what it was before folders
 * could blend. An enabled mask adds its id, `outside` and inversion to its layer or folder; its tiles damage the view
 * as they change, as a layer's do.
 */
export function compositionSignature(layers: readonly ShownLayer[]) {
  let signature = '';
  for (const layer of layers) {
    const { id, visible, opacity, blend, clipping, group, clipGroup } = layer;
    signature += `${id.length}:${id},${visible},${opacity},${blend},${!!clipping}${maskSignature(shownMask(layer))}`;
    for (let folder = group; folder; folder = folder.parent) {
      signature += `/${folder.id.length}:${folder.id},${folder.visible},${folder.opacity},${folder.blend},${folder.base}`;
      signature += maskSignature(folder.mask);
    }

    if (clipGroup) {
      signature += `^${clipGroup.id.length}:${clipGroup.id}`;
    }

    signature += ';';
  }

  return signature;
}

/** What an enabled mask adds to `compositionSignature`; nothing without one, so a drawing without masks keeps its own. */
function maskSignature(mask: LayerMask | undefined) {
  return mask ? `#${mask.id.length}:${mask.id},${mask.outside},${mask.inverted}` : '';
}
