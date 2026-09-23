import { err, ok, ResultAsync } from 'neverthrow';
import tgpu, { d, std } from 'typegpu';
import { errorMessage, gpuError, type GpuError } from '../../../../shared/errors';
import type { GpuContext } from '../../../../shared/gpu/context';
import type { KeepGpuResource } from '../../../../shared/gpu/resources';
import type { TextDocument } from '../../document';
import type { SceneFrame } from '../createFrame';
import { deferRefinement } from './deferRefinement';
import { pageTileFrame, pageTileKey, pageTileRect, visiblePageTiles, type PageTile } from './pageTiles';
import { planPageRefinement } from './planPageRefinement';
import { selectPageTiles } from './selectPageTiles';

/**
 * Retains composed PDF tiles across pan/zoom. Pinned page fallbacks prevent holes;
 * bounded refinement batches use the latest visible working set, including during motion.
 */
export function createPageTileCache(
  gpu: GpuContext,
  document: TextDocument,
  pages: Set<number>,
  keep: KeepGpuResource,
  render: (pass: GPURenderPassEncoder, frame: SceneFrame) => void,
  sourcesReady: (page: number) => boolean = () => true,
  fallbacksReady: (page: number) => boolean = () => true
) {
  const { root, device, format } = gpu;
  const events = new EventTarget();
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
  // Larger detail tiles reduce per-pass and per-fence overhead at the same texel density.
  const detailSize = tileSize * 2;
  const entries = new Map<string, Entry>();
  const revisions = new Map<number, number>();
  const pageWorkMs = new Map<number, number>();
  const requestedAt = new Map<string, number>();
  const waiters = new Set<() => void>();
  let wanted = new Map<string, PageTile>();
  let pending = false;
  let disposed = false;
  let clock = 0;
  let failure: GpuError | undefined;
  const deferred = deferRefinement(refine);
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  let lastTransform: number[] | undefined;
  let movedAt = -Infinity;
  let zoomingOut = false;
  let nextBatchAt = 0;

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
    events,
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
    get failure() {
      return failure;
    },
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
    /** Keeps old pixels visible while image uploads invalidate only the affected pages. */
    invalidate(changedPages: Iterable<number>) {
      for (const page of changedPages) {
        revisions.set(page, (revisions.get(page) ?? 0) + 1);
      }

      schedule();
    },
    /** Cancels queued refinement when the diagnostic direct path is selected. */
    pause() {
      wanted.clear();
      requestedAt.clear();
      deferred.cancel();
      finish();
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
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, latest + 100 - performance.now())));
      }
    },
    draw(pass: GPURenderPassEncoder, frame: SceneFrame) {
      clock++;
      const now = performance.now();
      const transform = [...frame.mul, ...frame.add, ...frame.rotation, frame.width, frame.height];

      if (lastTransform && transform.some((value, index) => value !== lastTransform![index])) {
        movedAt = now;
        zoomingOut = frame.mul[0] < lastTransform[0]!;
      }

      lastTransform = transform;
      wanted = new Map();
      camera.write({ mul: frame.mul, add: frame.add, rotation: frame.rotation, time: now });

      for (const { index } of frame.visible) {
        if (!pages.has(index)) {
          continue;
        }

        const previewTiles = visiblePageTiles(document, index, frame, tileSize);
        const visibleTiles =
          previewTiles[0]?.level === 0 ? previewTiles : visiblePageTiles(document, index, frame, detailSize, 1);

        for (const tile of visibleTiles) {
          wanted.set(pageTileKey(tile), tile);
        }
      }

      // Center-first detail reaches the area under inspection before peripheral pages.
      wanted = new Map([...wanted].sort(([, a], [, b]) => distance(a) - distance(b)));
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

      const selected = selectPageTiles(wanted, entries, revisions, now, 100);

      function distance(tile: PageTile) {
        const rect = pageTileRect(document, tile);
        const x = (rect.x + rect.width / 2) * frame.mul[0] + frame.add[0];
        const y = (rect.y - rect.height / 2) * frame.mul[1] + frame.add[1];
        return x * x + y * y;
      }

      // Coarse ancestors paint first; ready descendants replace only their own opaque page region.
      for (const entry of selected) {
        entry.used = clock;
        pipeline.with(pass).with(cameraGroup).with(entry.group).draw(4);
      }

      if (fadeTimer === undefined && selected.some((entry) => now - entry.readyAt < 100)) {
        fadeTimer = setTimeout(() => {
          fadeTimer = undefined;
          if (!disposed) {
            events.dispatchEvent(new Event('change'));
          }
        }, 16);
      }

      schedule();
    }
  };

  function next() {
    return work().find(canRefine);
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
    const moving = performance.now() - movedAt < 80;
    const overdue = performance.now() - (requestedAt.get(pageTileKey(tile)) ?? performance.now()) >= maxDeferralMs;
    return (
      needsRefinement(tile) &&
      fallbacksReady(tile.page) &&
      (overdue || (sourcesReady(tile.page) && (!moving || (pageWorkMs.get(tile.page) ?? Infinity) <= 8)))
    );
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
        const idle = movedAt + 80;
        deferred.schedule(Math.max(16, (idle > now ? Math.min(idle, deadline) : deadline) - now));
      } else {
        finish();
      }
      return;
    }

    pending = true;
    const moving = performance.now() - movedAt < 80;
    const started = performance.now();
    const tiles = work()
      .filter(canRefine)
      // Fill missing surroundings before repeatedly refreshing a center tile as its images stream in.
      .sort((a, b) => Number(entries.has(pageTileKey(a))) - Number(entries.has(pageTileKey(b))))
      .slice(0, moving ? 4 : 8);

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
        // Leave most GPU time to interaction while moving; expensive jobs automatically back off.
        nextBatchAt = performance.now() + (moving ? Math.min(64, (performance.now() - started) * 2) : 0);
        schedule();
      }

      events.dispatchEvent(new Event('change'));
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
          render(pass, pageTileFrame(document, tile, tile.level === 0 ? tileSize : detailSize));
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
          allocation.placement.patch({ readyAt });
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
    const frame = pageTileFrame(document, tile, tile.level === 0 ? tileSize : detailSize);
    const rect = pageTileRect(document, tile);
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

/** Makes work eligible after this delay; completion still depends on queued CPU/GPU work. */
const maxDeferralMs = 100;

const Camera = d.struct({ mul: d.vec2f, add: d.vec2f, rotation: d.vec4f, time: d.f32 });
const Placement = d.struct({ rect: d.vec4f, uv: d.vec4f, readyAt: d.f32 });
const cameraLayout = tgpu.bindGroupLayout({ camera: { uniform: Camera } });
const tileLayout = tgpu.bindGroupLayout({
  image: { texture: d.texture2d(d.f32) },
  sampler: { sampler: 'filtering' },
  placement: { uniform: Placement }
});

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
  const opacity = std.clamp((cameraLayout.$.camera.time - tileLayout.$.placement.readyAt) / 100, 0, 1);
  return std.mul(std.textureSample(tileLayout.$.image, tileLayout.$.sampler, input.uv), opacity);
});

/** Targets 32 MiB for pinned fallbacks; large documents use smaller base tiles and deeper detail levels. */
function fallbackSize(document: TextDocument, pages: Set<number>) {
  const area = [...pages].reduce((sum, index) => {
    const { width, height } = document.pages[index]!;
    return sum + Math.min(width / height, height / width);
  }, 0);
  const side = Math.sqrt((32 * 1024 * 1024) / Math.max(1, area) / ((4 * 4) / 3)) - 4;
  return Math.max(8, Math.min(256, 2 ** Math.floor(Math.log2(Math.max(8, side)))));
}
