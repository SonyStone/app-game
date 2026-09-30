import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import type { Layer } from '../document';
import type { Camera, ViewSize } from '../camera';
import { createVirtualPages, PAGE_SIDE, MAX_LEVEL, viewLod, type VirtualPage, type OverviewStorage } from '../virtualPages';
import { type TileData } from '../tilePixels';
import { pageCrop, pageFallback } from './pageFallback';
import { createPageWork, ObsoletePageError } from '../pageWork';
import { createPageRequests, type PageDemand } from './pageRequests';

/** Software virtual texture with a shared array-page pool, CPU page selection and instanced draws.
 * Loading is asynchronous and reprioritized per viewport. Resident parents provide coarse fallback.
 * Each canvas target draws through its own `view()`, so targets never cancel each other's loads or recycle each
 * other's visible slots; the non-pinned atlas budget is divided between registered views.
 */
export function createVirtualTexture(
  root: TgpuRoot,
  read: (data: TileData) => Promise<Uint8Array>,
  changed: () => void,
  failure: (error: unknown) => void,
  storage?: OverviewStorage
) {
  const capacity = Math.min(256, root.device.limits.maxTextureArrayLayers);
  const image = root.createTexture({ size: [PAGE_SIDE, PAGE_SIDE, capacity], format: 'rgba8unorm' }).$usage('sampled');
  const cameraBuffer = root.createBuffer(layout.entries.camera.uniform).$usage('uniform');
  // Each resident descendant adds at most three remainder quads per quadtree level.
  const instanceCapacity = capacity * (3 * MAX_LEVEL + 1);
  const instances = root.createBuffer(d.arrayOf(instance, instanceCapacity)).$usage('vertex');
  // writeBuffer copies at call time, so one staging array serves every layer's upload.
  const instanceData = new Float32Array(instanceCapacity * 8);
  const group = root.createBindGroup(layout, {
    image: image.createView(d.texture2dArray()),
    sampler: root.createSampler({ minFilter: 'linear', magFilter: 'linear' }),
    camera: cameraBuffer
  });
  const pipeline = root.createRenderPipeline({
    attribs: instanceLayout.attrib,
    vertex,
    fragment,
    targets: { format: 'rgba8unorm' }
  });
  const work = createPageWork();
  const pages = createVirtualPages(read, undefined, storage, work);
  const entries = new Map<string, { page: VirtualPage; token: string; slot: number; used: number }>();
  let coverageLayers: Layer[] | undefined;
  let coverage: VirtualPage[] = [];
  let pinned = new Set<string>();
  const demand = createPageRequests<VirtualPage>();
  const views = new Set<ReturnType<typeof createView>>();
  const inflight = new Set<string>();
  let free = Array.from({ length: capacity }, (_, i) => i),
    frame = 0,
    disposed = false;
  let uploaded = 0,
    maxPages = 128;
  const id = (page: VirtualPage) => `${page.layerId}/${page.level}/${page.x},${page.y}`;
  /** Writes a loaded page into the atlas. Only a blocking `prepare` may recycle slots other targets display. */
  const upload = (page: VirtualPage, token: string, pixels: Uint8Array, recycleVisible = false) => {
    const key = id(page);
    if (entries.get(key)?.token === token) return true;

    if (disposed || pages.token(page) !== token) return false;
    let entry = entries.get(key);
    if (!entry) {
      if (!free.length) {
        let oldest = [...entries]
          .filter(([key]) => !pinned.has(key) && (recycleVisible || !demand.inUse(key)))
          .sort((a, b) => a[1].used - b[1].used)
          .at(0);
        // A newly built parent can replace one of its visible children atomically.
        // Otherwise a zoom-out covering a full pool could pin every old slot forever.
        oldest ??= [...entries].find(
          ([key, value]) =>
            !pinned.has(key) &&
            value.page.layerId === page.layerId &&
            value.page.level < page.level &&
            Math.floor(value.page.x / 2 ** (page.level - value.page.level)) === page.x &&
            Math.floor(value.page.y / 2 ** (page.level - value.page.level)) === page.y
        );
        // Refinement may fill the pool with visible fallback fragments. A current pinned
        // ancestor still covers an obsolete fallback slot, so replacing that slot cannot make a hole.
        oldest ??= [...entries].find(
          ([key, value]) =>
            !pinned.has(key) &&
            !demand.wanted(key) &&
            coverage.some(
              (parent) =>
                parent.layerId === value.page.layerId &&
                parent.level > value.page.level &&
                Math.floor(value.page.x / 2 ** (parent.level - value.page.level)) === parent.x &&
                Math.floor(value.page.y / 2 ** (parent.level - value.page.level)) === parent.y &&
                entries.get(id(parent))?.token === pages.token(parent)
            )
        );
        if (!oldest) return false;
        free.push(oldest[1].slot);
        entries.delete(oldest[0]);
      }
      entry = { page, token, slot: free.pop()!, used: frame };
    }
    root.device.queue.writeTexture(
      { texture: root.unwrap(image), origin: [0, 0, entry.slot] },
      pixels,
      { bytesPerRow: PAGE_SIDE * 4 },
      [PAGE_SIDE, PAGE_SIDE]
    );
    entry.token = token;
    entries.set(key, entry);
    uploaded += pixels.byteLength;
    changed();
    return true;
  };
  const pump = () => {
    if (disposed) return;
    while (inflight.size < 2) {
      const reserve =
        inflight.size === 1 && ![...inflight].some((key) => pinned.has(key)) ? (key: string) => pinned.has(key) : undefined;
      const next = demand.take(reserve);
      if (!next) break;
      const { key, page } = next;
      if (inflight.has(key)) continue;
      const token = pages.token(page);
      if (entries.get(key)?.token === token) continue;
      inflight.add(key);
      const valid = () => !disposed && demand.wanted(key) && pages.token(page) === token;
      void work
        .task(async () => {
          const pixels = await pages.bordered(page, valid);
          await work.run(() => upload(page, token, pixels), valid, pixels.byteLength);
        }, valid)
        .catch((error: unknown) => {
          if (error instanceof ObsoletePageError) {
            if (!disposed) changed();
            return;
          }
          failure(error);
        })
        .finally(() => {
          inflight.delete(key);
          setTimeout(pump, 0);
        });
    }
  };
  const sync = (layers: Layer[]) => {
    pages.sync(layers);
    if (coverageLayers !== layers) {
      coverageLayers = layers;
      const visible = layers.filter((layer) => layer.visible && layer.opacity > 0);
      coverage =
        visible.length <= 24
          ? visible.flatMap((layer) =>
              pages.overview(layer.id, Math.max(4, Math.floor(capacity / 4 / Math.max(1, visible.length))))
            )
          : [];
      pinned = new Set(coverage.map(id));
    }
    // Reserve the actual pinned coverage, then share the remaining slots among visible layers of every target.
    const visible = Math.max(1, layers.filter((l) => l.visible && l.opacity > 0).length);
    maxPages = Math.max(4, Math.floor((capacity - pinned.size) / (visible * Math.max(1, demand.targets))));
  };
  /** One target's frame state: its page requests, displayed sources and debug selection. */
  function createView(pageDemand: PageDemand<VirtualPage>) {
    let draws = 0,
      fallback = 0,
      // Next free instance in this frame; each layer draws its own range so one encoder can hold the frame.
      cursor = 0,
      cameraWritten = false;
    let selected: (VirtualPage & { resident: boolean; fallback: boolean })[] = [];
    // Actual source pages from the last frame, including cropped fallback sources.
    const displayed = new Map<string, VirtualPage>();
    const view = {
      displayed,
      get draws() {
        return draws;
      },
      get fallback() {
        return fallback;
      },
      /** Starts this target's frame without disturbing other targets' requests or visible slots. */
      begin(layers: Layer[]) {
        sync(layers);
        frame++;
        pageDemand.begin(pinned);
        draws = 0;
        fallback = 0;
        cursor = 0;
        cameraWritten = false;
        selected = [];
        displayed.clear();
      },
      /** Selects committed pages without waiting for reads and uploads their instances into this frame's next
       * range. `covered` is true only when every occupied part of the selection has resident coverage; empty
       * branches need no texture. `draw` encodes the layer into an open pass; active output can then replace
       * covered pixels before layer compositing. The camera must stay fixed for the frame. When the frame's
       * instance range is exhausted, `flush` must submit every encoded draw before the range is reused.
       */
      plan(layer: Layer, camera: Camera, size: ViewSize, scale: number, flush: () => void) {
        const visible = pages.visible(layer.id, camera, size, scale, maxPages);
        const batch: { source: NonNullable<ReturnType<typeof entries.get>>; region: VirtualPage }[] = [];
        let resident: NonNullable<ReturnType<typeof entries.get>>[] | undefined;
        let covered = true;
        for (const page of visible) {
          const key = id(page);
          pageDemand.want(key);
          const entry = entries.get(key);
          const exact = entry?.token === pages.token(page);
          let matches = exact ? [{ source: entry, region: page }] : [];
          if (!exact) {
            resident ??= [...entries.values()].filter(
              (candidate) => candidate.page.layerId === layer.id && candidate.token === pages.token(candidate.page)
            );
            matches = pageFallback(page, resident);
            pageDemand.request(key, page, matches.length ? 2 : 0);
            if (matches.length) fallback++;
          }
          if (
            !pages.isCovered(
              page,
              matches.map(({ region }) => region)
            )
          )
            covered = false;
          selected.push({ ...page, resident: matches.length > 0, fallback: !exact && matches.length > 0 });
          for (const match of matches) {
            match.source.used = frame;
            const sourceKey = id(match.source.page);
            pageDemand.use(sourceKey);
            displayed.set(sourceKey, match.source.page);
            batch.push(match);
          }
        }
        if (!batch.length) return { covered, draw() {} };
        if (!cameraWritten) {
          cameraBuffer.write({
            size: d.vec2f(size.width, size.height),
            zoom: camera.zoom,
            angle: camera.angle,
            mirror: camera.mirrored ? -1 : 1,
            pixelRatio: scale
          });
          cameraWritten = true;
        }
        if (cursor + batch.length > instanceCapacity) {
          flush();
          cursor = 0;
        }
        batch.forEach(({ source, region }, i) => {
          const span = 256 * 2 ** region.level;
          const crop = pageCrop(source.page, region);
          const at = i * 8;
          instanceData[at] = region.x * span - camera.x;
          instanceData[at + 1] = region.y * span - camera.y;
          instanceData[at + 2] = span;
          instanceData[at + 3] = source.slot;
          instanceData[at + 4] = crop.x;
          instanceData[at + 5] = crop.y;
          instanceData[at + 6] = crop.scale;
          instanceData[at + 7] = 0;
        });
        const first = cursor,
          count = batch.length;
        root.device.queue.writeBuffer(root.unwrap(instances), first * 32, instanceData, 0, count * 8);
        cursor += count;
        draws++;
        return {
          covered,
          draw(pass: GPURenderPassEncoder) {
            pipeline.with(pass).with(group).with(instanceLayout, instances).draw(6, count, 0, first);
          }
        };
      },
      /** Visible detail is requested first. Idle capacity builds persistent coarse coverage,
       * even while the user stays zoomed in; navigation never cancels these requests.
       */
      end() {
        for (const page of coverage) {
          const key = id(page);
          if (entries.get(key)?.token !== pages.token(page)) pageDemand.request(key, page, 1);
        }
        pump();
      },
      /** Pages selected by this target's latest frame, with residency and fallback flags. */
      debug: () => selected,
      /** Detaches this target; its pending requests no longer keep loads valid. */
      release() {
        pageDemand.release();
        views.delete(view);
      }
    };
    return view;
  }
  return {
    /** Registers a canvas target. Each target begins, draws and ends its own frames. */
    view() {
      const view = createView(demand.demand());
      views.add(view);
      return view;
    },
    /** Uses the same occupied-page budget as draw, without resetting a frame or following temporary fallback pages. */
    brushLod(layers: Layer[], layer: Layer, camera: Camera, size: ViewSize, scale: number) {
      sync(layers);
      return pages.visible(layer.id, camera, size, scale, maxPages)[0]?.level ?? viewLod(camera.zoom, scale);
    },
    /** Refreshes the last frame's detail and coarse coverage before another stroke can expose the edit.
     * Unchanged page tokens skip all work; refreshed resident pages reuse their existing atlas slots.
     */
    prepare(layers: Layer[]) {
      // Stroke completion awaits this coverage before accepting the next contact.
      // Keep bounded cooperative chunks, but don't throttle them as background streaming.
      return work.blocking(async () => {
        sync(layers);
        await pages.retain(coverage);
        const refresh = new Map(
          [...views]
            .flatMap((view) => [...view.displayed])
            .filter(([key, page]) => entries.has(key) && layers.some((layer) => layer.id === page.layerId))
        );
        for (const page of coverage) refresh.set(id(page), page);
        const targets = [...refresh.values()];
        for (let offset = 0; offset < targets.length; offset += 2) {
          await Promise.all(
            targets.slice(offset, offset + 2).map(async (page) => {
              const key = id(page),
                token = pages.token(page);
              if (entries.get(key)?.token === token) return;
              const valid = () => !disposed && pages.token(page) === token;
              await work.task(async () => {
                const pixels = await pages.bordered(page, valid);
                if (!(await work.run(() => upload(page, token, pixels, true), valid, pixels.byteLength)))
                  throw new Error('Could not prepare the drawing overview.');
              }, valid);
            })
          );
        }
      });
    },
    invalidate() {
      coverageLayers = undefined;
      pages.invalidate();
    },
    stats: () => ({
      ...pages.stats(),
      ...work.stats(),
      pages: entries.size,
      coveragePages: coverage.filter((page) => entries.get(id(page))?.token === pages.token(page)).length,
      coveragePending: coverage.filter((page) => entries.get(id(page))?.token !== pages.token(page)).length,
      pending: demand.pending() + inflight.size,
      uploadedBytes: uploaded,
      drawCalls: [...views].reduce((sum, view) => sum + view.draws, 0),
      fallbackPages: [...views].reduce((sum, view) => sum + view.fallback, 0),
      gpuBytes: capacity * PAGE_SIDE * PAGE_SIDE * 4
    }),
    /** Bytes uploaded so far; cheap enough to include in every frame's damage signature. */
    uploadedBytes: () => uploaded,
    destroy() {
      disposed = true;
      work.dispose();
      demand.clear();
      pages.clear();
      image.destroy();
      cameraBuffer.destroy();
      instances.destroy();
    }
  };
}

const layout = tgpu.bindGroupLayout({
  image: { texture: d.texture2dArray() },
  sampler: { sampler: 'filtering' },
  camera: { uniform: d.struct({ size: d.vec2f, zoom: d.f32, angle: d.f32, mirror: d.f32, pixelRatio: d.f32 }) }
});
const instance = d.struct({ page: d.vec4f, crop: d.vec4f });
const instanceLayout = tgpu.vertexLayout(d.arrayOf(instance), 'instance');
/** Page coordinates are relative to the camera before upload, preserving far-origin precision. */
export const vertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex, page: d.vec4f, crop: d.vec4f },
  out: {
    position: d.builtin.position,
    uv: d.vec2f,
    slot: d.interpolate('flat', d.u32),
    footprint: d.interpolate('flat', d.f32)
  }
})((input) => {
  'use gpu';
  const corners = d.arrayOf(
    d.vec2f,
    6
  )([d.vec2f(0, 0), d.vec2f(1, 0), d.vec2f(0, 1), d.vec2f(0, 1), d.vec2f(1, 0), d.vec2f(1, 1)]);
  const uv = corners[input.index]!;
  const p = std.add(input.page.xy, std.mul(uv, input.page.z));
  const x = p.x * layout.$.camera.mirror;
  const c = std.cos(layout.$.camera.angle);
  const s = std.sin(layout.$.camera.angle);
  const screen = std.mul(d.vec2f(x * c - p.y * s, x * s + p.y * c), layout.$.camera.zoom);
  return {
    position: d.vec4f((screen.x * 2) / layout.$.camera.size.x, (-screen.y * 2) / layout.$.camera.size.y, 0, 1),
    uv: std.add(input.crop.xy, std.mul(uv, input.crop.z)),
    slot: d.u32(input.page.w),
    footprint: (256 * input.crop.z) / (input.page.z * layout.$.camera.zoom * layout.$.camera.pixelRatio)
  };
});
/** Pages have explicit gutters and an explicit LOD; atlas slots cannot filter into each other. */
export const fragment = tgpu.fragmentFn({
  in: { uv: d.vec2f, slot: d.interpolate('flat', d.u32), footprint: d.interpolate('flat', d.f32) },
  out: d.vec4f
})((input) => {
  'use gpu';
  const uv = std.div(std.add(std.mul(input.uv, 256), d.vec2f(1)), PAGE_SIDE);
  const radius = std.clamp((input.footprint - 1) * 0.5, 0, 0.5) / PAGE_SIDE;
  if (radius <= 0) return samplePage(uv, input.slot);
  // Integrate a minified page's pixel footprint; offsets stay within its one-texel gutters.
  return std.mul(
    std.add(
      std.add(
        samplePage(std.add(uv, d.vec2f(-radius, -radius)), input.slot),
        samplePage(std.add(uv, d.vec2f(radius, -radius)), input.slot)
      ),
      std.add(
        samplePage(std.add(uv, d.vec2f(-radius, radius)), input.slot),
        samplePage(std.add(uv, d.vec2f(radius, radius)), input.slot)
      )
    ),
    0.25
  );
});

const samplePage = tgpu.fn(
  [d.vec2f, d.u32],
  d.vec4f
)((uv, slot) => {
  'use gpu';
  return std.textureSampleLevel(layout.$.image, layout.$.sampler, uv, d.i32(slot), 0);
});
