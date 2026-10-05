import { errorMessage, gpuError, type GpuError } from '@app-game/solid-gpu/errors';
import type { GpuDevice, KeepGpuResource } from '@app-game/solid-gpu/gpu';
import { err, ok, ResultAsync } from 'neverthrow';
import tgpu, { d, std } from 'typegpu';
import type { TextDocument } from '../../document';
import type { SceneFrame } from '../createFrame';
import { deferRefinement } from './deferRefinement';
import { pageTileFrame, pageTileKey, pageTileRect, parentTile, visiblePageTiles, type PageTile } from './pageTiles';
import { planPageRefinement } from './planPageRefinement';
import { selectPageTiles } from './selectPageTiles';

/**
 * Retains composed PDF tiles across pan/zoom. Pinned page fallbacks prevent holes;
 * bounded refinement batches use the latest visible working set, including during motion.
 * GPU resources are released through `keep`'s owner; `changed` is the owner's redraw notification.
 */
export function createPageTileCache(
  gpu: GpuDevice,
  {
    document,
    pages,
    keep,
    render,
    sourcesReady,
    fallbacksReady,
    expensive = () => false,
    prepared = () => true,
    changed
  }: {
    document: TextDocument;
    /** Pages with a composed prefix; other pages are never cached. */
    pages: ReadonlySet<number>;
    keep: KeepGpuResource;
    /** Records one page tile's composed prefix into `pass`, using the tile frame's transform. */
    render: (pass: GPURenderPassEncoder, frame: SceneFrame) => void;
    /** Whether every source texel the page's prefix needs is resident, so a refined tile is final. */
    sourcesReady: (page: number) => boolean;
    /** Whether every image fallback of the page is drawable, so a tile has no holes. */
    fallbacksReady: (page: number) => boolean;
    /**
     * Whether rendering a tile of `page` may take seconds of GPU time; such tiles are generated alone, one per fence,
     * so that several of them never form a single job long enough to reset the GPU. Default never.
     */
    expensive?: (page: number) => boolean;
    /**
     * Whether an expensive page can render into a tile with `frame`'s transform yet, for example once cached coverage
     * for its dense outlines exists; until then its tiles wait. Default always.
     */
    prepared?: (page: number, frame: SceneFrame) => boolean;
    /** Requests a redraw after refined tiles land or while they fade in. Never called after disposal. */
    changed: () => void;
  }
) {
  const { root, device, format } = gpu;
  const camera = keep(root.createBuffer(Camera)).$usage('uniform');
  const cameraGroup = root.createBindGroup(cameraLayout, { camera });
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear' });
  const pipeline = root.createRenderPipeline({
    vertex,
    fragment,
    targets: {
      format,
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      }
    },
    primitive: { topology: 'triangle-strip' }
  });
  type Entry = ReturnType<typeof allocate> & { revision: number; used: number };
  const tileSize = fallbackSize(document, pages);
  // Small pages keep one tile per level until it reaches wholePageTexels, so an overview draws one tile per page
  // and renders only the resolution it needs; larger views split into quadrants of that size. Expensive pages keep
  // small tiles, so their cached coverage stays within the largest on-demand table.
  const wholeSplit = Math.max(0, Math.log2(wholePageTexels / tileSize));
  const expensiveSplit = Math.max(0, Math.log2(expensivePageTexels / tileSize));
  const split = (page: number) => (expensive(page) ? expensiveSplit : wholeSplit);
  const entries = new Map<string, Entry>();
  const revisions = new Map<number, number>();
  const pageWorkMs = new Map<number, number>();
  const requestedAt = new Map<string, number>();
  const waiters = new Set<() => void>();
  /** Tiles every view wants, taken from each view's center-first list in turn. */
  let wanted = new Map<string, PageTile>();
  /** Page fallbacks to build while no view is waiting and the camera is still; never overdue. */
  let prefetched: PageTile[] = [];
  /** Each drawing view's latest wanted tiles and motion; views draw independently. */
  const views = new Map<object, { wanted: Map<string, PageTile>; lastTransform?: number[] }>();
  let pending = false;
  let disposed = false;
  let clock = 0;
  let failure: GpuError | undefined;
  const deferred = deferRefinement(refine);
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  // Motion of any view defers refinement; zoomingOut follows the view that moved last.
  let movedAt = -Infinity;
  let zoomingOut = false;
  let nextBatchAt = 0;
  // Fade times are f32 on the GPU; offsets from creation keep millisecond precision in long sessions.
  const epoch = performance.now();

  keep({
    destroy() {
      disposed = true;
      deferred.destroy();
      clearTimeout(fadeTimer);
      entries.forEach(destroy);
      entries.clear();
      finish();
    }
  });

  return {
    /** Read-only counters for navigation/quality diagnostics; no GPU synchronization. */
    get refinement() {
      const missing = [...wanted.values()].filter(needsRefinement);
      return {
        pages: pages.size,
        requested: wanted.size,
        missing: missing.length,
        blocked: missing.filter((tile) => !canRefine(tile)).length,
        pending
      };
    },
    /** First GPU render error; once set, refinement stops and `settle` returns immediately. */
    get failure() {
      return failure;
    },
    /** Estimated bytes of cached tile textures (including mips) and their uniforms. */
    get resourceBytes() {
      return [...entries.values()].reduce((sum, entry) => sum + entry.bytes, 48);
    },
    /** Prepares the supplied initial pages, or all cacheable pages for offline callers. */
    async prepare(initialPages: Iterable<number> = pages) {
      for (const page of initialPages) {
        if (disposed || gpu.checkActive().isErr()) {
          return err(gpuError('destroyed', 'The page tile cache has been destroyed'));
        }

        const result = await generate([{ page, level: 0, x: 0, y: 0 }]);

        if (result.isErr()) {
          return result;
        }
      }

      return ok<void>(undefined);
    },
    /**
     * Builds the pinned whole-page fallbacks of `pages`, in order, while no requested tile can refine and the camera
     * is still, so a later view can switch to tiles at once. Replaces any previous prefetch list; `settle` does not
     * wait for it.
     */
    prefetch(pagesToPrepare: Iterable<number>) {
      prefetched = [...pagesToPrepare]
        .filter((page) => pages.has(page))
        .map((page) => ({ page, level: 0, x: 0, y: 0 }));
      schedule();
    },
    /** Whether `page`'s pinned whole-page fallback is resident, possibly from an older image revision. */
    hasBase(page: number) {
      return entries.has(pageTileKey({ page, level: 0, x: 0, y: 0 }));
    },
    /** Keeps old pixels visible while image uploads invalidate only the affected pages; defaults to all pages. */
    invalidate(changedPages: Iterable<number> = pages) {
      for (const page of changedPages) {
        revisions.set(page, (revisions.get(page) ?? 0) + 1);
      }

      schedule();
    },
    /** Drops `view`'s wanted tiles when it selects the diagnostic direct path; the last paused view cancels refinement. */
    pause(view: object = defaultView) {
      views.get(view)?.wanted.clear();
      mergeWanted();
    },
    /** Forgets a view that stopped drawing, for example when its canvas closes. */
    forgetView(view: object) {
      if (views.delete(view)) {
        mergeWanted();
      }
    },
    /** Waits for requested detail, for deterministic screenshots; interactive drawing never waits. */
    async settle() {
      if (!disposed && !failure && (pending || [...wanted.values()].some(needsRefinement))) {
        schedule();
        await new Promise<void>((resolve) => waiters.add(resolve));
      }

      // Offline capture waits for the short visual transition too; the interactive path never awaits it.
      if (!disposed && !failure) {
        const latest = [...entries.values()].reduce((latest, entry) => Math.max(latest, entry.readyAt), 0);
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, latest + fadeMs - performance.now())));
      }
    },
    /**
     * Replaces `view`'s wanted tiles with those covering the frame's visible pages at its scale, center first, and
     * schedules their refinement. Pages may be requested before they are drawn, so they can switch to composed
     * tiles only once {@link covers} reports them ready. Callers drawing a single view may omit `view`.
     */
    request(frame: SceneFrame, view: object = defaultView) {
      const now = performance.now();
      const transform = [...frame.mul, ...frame.add, ...frame.rotation, frame.width, frame.height];
      const state = views.get(view) ?? { wanted: new Map<string, PageTile>() };
      const { lastTransform } = state;

      if (lastTransform && transform.some((value, index) => value !== lastTransform[index])) {
        movedAt = now;
        zoomingOut = frame.mul[0] < lastTransform[0]!;
      }

      state.lastTransform = transform;
      views.set(view, state);
      const viewWanted = new Map<string, PageTile>();

      for (const { index } of frame.visible) {
        if (!pages.has(index)) {
          continue;
        }

        for (const tile of visiblePageTiles(document, index, frame, tileSize, 0, split(index))) {
          viewWanted.set(pageTileKey(tile), tile);
        }
      }

      // Center-first detail reaches the area under inspection before peripheral pages.
      state.wanted = new Map([...viewWanted].sort(([, a], [, b]) => distance(a) - distance(b)));
      wanted = mergeViews();
      for (const [key, tile] of wanted) {
        if (needsRefinement(tile) && !requestedAt.has(key)) {
          requestedAt.set(key, now);
        }
      }

      const plannedKeys = new Set(work().map(pageTileKey));
      for (const key of requestedAt.keys()) {
        const tile = wanted.get(key);
        if ((!tile && !plannedKeys.has(key)) || (tile && !needsRefinement(tile))) {
          requestedAt.delete(key);
        }
      }

      schedule();

      function distance(tile: PageTile) {
        const rect = pageTileRect(document, tile, split(tile.page));
        const x = (rect.x + rect.width / 2) * frame.mul[0] + frame.add[0];
        const y = (rect.y - rect.height / 2) * frame.mul[1] + frame.add[1];
        return x * x + y * y;
      }
    },
    /**
     * Whether every tile `view` last requested for `page` is resident and fully faded in, at its own level or one
     * level coarser, possibly from an older image revision. Drawing the page from tiles is then at most twice
     * under-resolved, like an ordinary refinement step, and never falls back to the coarse pinned base.
     */
    covers(page: number, view: object = defaultView) {
      const now = performance.now();
      const ready = (tile: PageTile) => {
        const entry = entries.get(pageTileKey(tile));
        return entry !== undefined && now - entry.readyAt >= fadeMs;
      };

      for (const tile of views.get(view)?.wanted.values() ?? []) {
        if (tile.page === page && !ready(tile) && (tile.level <= 1 || !ready(parentTile(tile)))) {
          return false;
        }
      }

      return views.has(view);
    },
    /**
     * Draws the best cached tiles of `view`'s latest {@link request} for the frame's visible pages into `pass`.
     * Never waits for GPU work; newly refined tiles fade in over {@link fadeMs}.
     */
    draw(pass: GPURenderPassEncoder, frame: SceneFrame, view: object = defaultView) {
      clock++;
      const now = performance.now();
      const drawn = new Set(frame.visible.map(({ index }) => index));
      const viewWanted = new Map([...(views.get(view)?.wanted ?? [])].filter(([, tile]) => drawn.has(tile.page)));
      camera.write({ mul: frame.mul, add: frame.add, rotation: frame.rotation, time: now - epoch });
      const selected = selectPageTiles(viewWanted, entries, revisions, now, fadeMs);

      // Coarse ancestors paint first; ready descendants replace only their own opaque page region. An overview draws
      // hundreds of tiles: the first applies the pipeline and camera, later ones only swap their own bind group, since
      // re-applying the full pipeline state per tile dominated the frame's CPU time.
      for (const [index, entry] of selected.entries()) {
        entry.used = clock;

        if (index === 0) {
          pipeline.with(pass).with(cameraGroup).with(entry.group).draw(4);
        } else {
          pass.setBindGroup(tileGroupIndex, root.unwrap(entry.group));
          pass.draw(4);
        }
      }

      if (fadeTimer === undefined && selected.some((entry) => now - entry.readyAt < fadeMs)) {
        fadeTimer = setTimeout(() => {
          fadeTimer = undefined;
          if (!disposed) {
            changed();
          }
        }, 16);
      }
    }
  };

  /** Interleaves the views' center-first lists so every view's center refines before any view's periphery. */
  function mergeViews() {
    const merged = new Map<string, PageTile>();
    const lists = [...views.values()].map((view) => [...view.wanted]);

    for (let rank = 0; lists.some((list) => rank < list.length); rank++) {
      for (const list of lists) {
        const entry = list[rank];

        if (entry && !merged.has(entry[0])) {
          merged.set(entry[0], entry[1]);
        }
      }
    }

    return merged;
  }

  /** Rebuilds the merged wanted tiles after a view leaves or pauses; with none left, cancels queued refinement. */
  function mergeWanted() {
    wanted = mergeViews();

    if (wanted.size === 0) {
      requestedAt.clear();
      deferred.cancel();
      finish();
    } else {
      schedule();
    }
  }

  function next() {
    return work().find(canRefine) ?? prefetched.find(canRefine);
  }

  function work() {
    return planPageRefinement(wanted.values(), (key) => entries.has(key), zoomingOut).map(({ tile, source }) => {
      const key = pageTileKey(tile);
      if (needsRefinement(tile) && !requestedAt.has(key)) {
        requestedAt.set(key, requestedAt.get(source) ?? performance.now());
      }
      return tile;
    });
  }

  function needsRefinement(tile: PageTile) {
    return entries.get(pageTileKey(tile))?.revision !== (revisions.get(tile.page) ?? 0);
  }

  function canRefine(tile: PageTile) {
    const now = performance.now();
    const overdue = now - (requestedAt.get(pageTileKey(tile)) ?? now) >= maxDeferralMs;
    return (
      needsRefinement(tile) &&
      fallbacksReady(tile.page) &&
      (!expensive(tile.page) || prepared(tile.page, pageTileFrame(document, tile, tileSize, split(tile.page)))) &&
      (overdue || (sourcesReady(tile.page) && (!isMoving(now) || (pageWorkMs.get(tile.page) ?? Infinity) <= 8)))
    );
  }

  /** Camera motion within the last {@link motionSettleMs}; refinement then yields to interaction. */
  function isMoving(now: number) {
    return now - movedAt < motionSettleMs;
  }

  function schedule() {
    if (pending || disposed || failure) {
      return;
    }

    deferred.schedule(Math.max(0, nextBatchAt - performance.now()));
  }

  function refine() {
    const tile = next();

    if (!tile) {
      const missing = work().filter(needsRefinement);
      if (missing.length) {
        // Continuous tours and streaming images must not postpone detail indefinitely.
        const now = performance.now();
        const deadline = Math.min(
          ...missing.map((tile) => (requestedAt.get(pageTileKey(tile)) ?? now) + maxDeferralMs)
        );
        deferred.schedule(
          Math.max(16, (isMoving(now) ? Math.min(movedAt + motionSettleMs, deadline) : deadline) - now)
        );
      } else {
        finish();

        // Motion only postpones prefetching; image uploads reschedule pages still waiting for sources.
        const now = performance.now();
        if (isMoving(now) && prefetched.some(needsRefinement)) {
          deferred.schedule(Math.max(16, movedAt + motionSettleMs - now));
        }
      }
      return;
    }

    pending = true;
    const started = performance.now();
    const moving = isMoving(started);
    const planned = work().filter(canRefine);
    const candidates = (planned.length ? planned : prefetched.filter(canRefine))
      // Fill missing surroundings before repeatedly refreshing a center tile as its images stream in.
      .sort((a, b) => Number(entries.has(pageTileKey(a))) - Number(entries.has(pageTileKey(b))));
    const tiles = expensive(candidates[0]!.page)
      ? candidates.slice(0, 1)
      : candidates.filter((tile) => !expensive(tile.page)).slice(0, moving ? 4 : 8);

    void generate(tiles, moving ? 2 : 4).then((result) => {
      pending = false;

      if (disposed) {
        return;
      }

      if (result.isErr()) {
        failure = result.error;
        finish();
      } else {
        evict();

        // Prefetching continues in later batches; requested detail alone decides when settle resolves.
        if (![...wanted.values()].some(needsRefinement)) {
          finish();
        }

        // Leave most GPU time to interaction while moving; expensive jobs automatically back off.
        nextBatchAt = performance.now() + (moving ? Math.min(64, (performance.now() - started) * 2) : 0);
        schedule();
      }

      // Prefetched fallbacks are not drawn until a view requests them, so they need no redraw.
      if (planned.length || result.isErr()) {
        changed();
      }
    });
  }

  /** Submits a small batch before one fence, avoiding a timer/fence round trip for every tile. */
  function generate(tiles: PageTile[], cpuBudgetMs = 4) {
    const allocations: { allocation: ReturnType<typeof allocate>; revision: number }[] = [];

    return ResultAsync.fromThrowable(
      async () => {
        const started = performance.now();

        for (const tile of tiles) {
          const allocation = allocate(tile);
          allocations.push({ allocation, revision: revisions.get(tile.page) ?? 0 });
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: allocation.view, loadOp: 'clear', storeOp: 'store', clearValue: [1, 1, 1, 1] }]
          });
          render(pass, pageTileFrame(document, tile, tileSize, split(tile.page)));
          pass.end();
          device.queue.submit([encoder.finish()]);
          allocation.texture.generateMipmaps();

          // A complex page may already consume the CPU budget by itself.
          if (performance.now() - started >= cpuBudgetMs) {
            break;
          }
        }

        await device.queue.onSubmittedWorkDone();

        if (allocations.length === 1 && allocations[0]!.allocation.tile.level === 0) {
          pageWorkMs.set(allocations[0]!.allocation.tile.page, performance.now() - started);
        }

        for (const { allocation, revision } of allocations) {
          if (disposed) {
            destroy(allocation);
            continue;
          }

          const key = pageTileKey(allocation.tile);
          const previous = entries.get(key);

          if (previous) {
            destroy(previous);
          }

          const readyAt = allocation.tile.level === 0 ? -1000 : performance.now();
          // Level-0 fallbacks keep the -1000 sentinel so they are always fully opaque.
          allocation.placement.patch({ readyAt: allocation.tile.level === 0 ? -1000 : readyAt - epoch });
          entries.set(key, { ...allocation, readyAt, revision, used: clock });
          requestedAt.set(key, performance.now());
        }
      },
      (cause) => {
        for (const { allocation } of allocations) {
          destroy(allocation);
        }

        return gpuError('render', errorMessage(cause), cause);
      }
    )();
  }

  function allocate(tile: PageTile) {
    const frame = pageTileFrame(document, tile, tileSize, split(tile.page));
    const rect = pageTileRect(document, tile, split(tile.page));
    const mipLevelCount = Math.floor(Math.log2(Math.max(frame.width, frame.height))) + 1;
    const texture = root
      .createTexture({ size: [frame.width, frame.height], format, mipLevelCount })
      .$usage('sampled', 'render');
    const placement = root
      .createBuffer(Placement, {
        readyAt: -1000,
        rect: [rect.x, rect.y, rect.width, rect.height],
        uv: [2 / frame.width, 2 / frame.height, (frame.width - 4) / frame.width, (frame.height - 4) / frame.height]
      })
      .$usage('uniform');
    return {
      tile,
      texture,
      placement,
      readyAt: -1000,
      bytes: Math.ceil((frame.width * frame.height * 4 * 4) / 3) + 48,
      view: root.unwrap(texture).createView({ baseMipLevel: 0, mipLevelCount: 1 }),
      group: root.createBindGroup(tileLayout, { image: texture.createView(), sampler, placement })
    };
  }

  function evict() {
    const plannedKeys = new Set(work().map(pageTileKey));
    const candidates = [...entries].filter(([, entry]) => entry.tile.level > 0).sort((a, b) => a[1].used - b[1].used);
    let bytes = candidates.reduce((sum, [, entry]) => sum + entry.bytes, 0);

    for (const [key, entry] of candidates) {
      if (bytes <= 64 * 1024 * 1024) {
        break;
      }

      // The current viewport and its transition fallbacks win over the retention target.
      // Dropping wanted tiles would repeatedly rebuild them and leave parts of a large screen blurry.
      if (wanted.has(key) || plannedKeys.has(key) || entry.used === clock) {
        continue;
      }

      bytes -= entry.bytes;
      entries.delete(key);
      destroy(entry);
    }
  }

  function finish() {
    waiters.forEach((resolve) => resolve());
    waiters.clear();
  }

  function destroy(entry: ReturnType<typeof allocate>) {
    entry.texture.destroy();
    entry.placement.destroy();
  }
}

/**
 * Tiles hold 1.25–2.5 texels per screen pixel. Unbiased trilinear sampling always blended in the half-resolution
 * mip, making composed pages visibly softer than directly drawn ones; this keeps sampling near the stored level.
 */
const tileLodBias = -1;
/** Longest side of a whole-page tile before deeper levels split into quadrants. */
const wholePageTexels = 256;
/** The same for expensive pages, whose tiles must stay small enough for on-demand coverage tables. */
const expensivePageTexels = 128;
/** Duration of a refined tile's fade-in over its coarser ancestor. */
const fadeMs = 100;
/** Makes work eligible after this delay; completion still depends on queued CPU/GPU work. */
const maxDeferralMs = 100;
/** The camera counts as moving until this long after its last transform change. */
const motionSettleMs = 80;

const Camera = d.struct({ mul: d.vec2f, add: d.vec2f, rotation: d.vec4f, time: d.f32 });
const Placement = d.struct({ rect: d.vec4f, uv: d.vec4f, readyAt: d.f32 });
/** Bind group index of each tile's resources; the camera's group is zero. */
const tileGroupIndex = 1;
const cameraLayout = tgpu.bindGroupLayout({ camera: { uniform: Camera } }).$idx(0);
const tileLayout = tgpu
  .bindGroupLayout({
    image: { texture: d.texture2d(d.f32) },
    sampler: { sampler: 'filtering' },
    placement: { uniform: Placement }
  })
  .$idx(tileGroupIndex);

const vertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex },
  out: { position: d.builtin.position, uv: d.vec2f }
})((input) => {
  'use gpu';
  const uv = d.vec2f(d.f32(input.index % 2), d.f32(input.index >> 1));
  const rect = tileLayout.$.placement.rect;
  const p = std.add(
    std.mul(d.vec2f(rect.x + uv.x * rect.z, rect.y - uv.y * rect.w), cameraLayout.$.camera.mul),
    cameraLayout.$.camera.add
  );
  const r = cameraLayout.$.camera.rotation;
  return {
    position: d.vec4f(r.x * p.x + r.z * p.y, r.y * p.x + r.w * p.y, 0, 1),
    uv: std.add(tileLayout.$.placement.uv.xy, std.mul(uv, tileLayout.$.placement.uv.zw))
  };
});

const fragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
  'use gpu';
  const opacity = std.clamp((cameraLayout.$.camera.time - tileLayout.$.placement.readyAt) / fadeMs, 0, 1);
  return std.mul(std.textureSampleBias(tileLayout.$.image, tileLayout.$.sampler, input.uv, tileLodBias), opacity);
});

/** Targets 32 MiB for pinned fallbacks; large documents use smaller base tiles and deeper detail levels. */
function fallbackSize(document: TextDocument, pages: ReadonlySet<number>) {
  const area = [...pages].reduce((sum, index) => {
    const { width, height } = document.pages[index]!;
    return sum + Math.min(width / height, height / width);
  }, 0);
  const side = Math.sqrt((32 * 1024 * 1024) / Math.max(1, area) / ((4 * 4) / 3)) - 4;
  return Math.max(8, Math.min(256, 2 ** Math.floor(Math.log2(Math.max(8, side)))));
}

/** View key for callers that draw a single view. */
const defaultView = {};
