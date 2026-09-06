import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import type { Layer } from '../document';
import type { Camera, ViewSize } from '../camera';
import { createVirtualPages, PAGE_SIDE, MAX_LEVEL, type VirtualPage, type OverviewStorage } from '../virtualPages';
import { type TileData } from '../tilePixels';
import { pageCrop, pageFallback } from './pageFallback';
import { createPageWork, ObsoletePageError } from '../pageWork';

/** Software virtual texture with a shared array-page pool, CPU page selection and instanced draws.
 * Loading is asynchronous and reprioritized per viewport. Resident parents provide coarse fallback.
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
  const instances = root.createBuffer(d.arrayOf(instance, capacity * (3 * MAX_LEVEL + 1))).$usage('vertex');
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
  let requests = new Map<string, { page: VirtualPage; priority: number }>();
  let wanted = new Set<string>();
  const inflight = new Set<string>();
  let free = Array.from({ length: capacity }, (_, i) => i),
    frame = 0,
    disposed = false;
  let uploaded = 0,
    draws = 0,
    fallback = 0,
    maxPages = 128;
  let selected: (VirtualPage & { resident: boolean; fallback: boolean })[] = [];
  // Actual source pages from the last frame, including cropped fallback sources.
  const displayed = new Map<string, VirtualPage>();
  const id = (page: VirtualPage) => `${page.layerId}/${page.level}/${page.x},${page.y}`;
  const upload = (page: VirtualPage, token: string, pixels: Uint8Array) => {
    const key = id(page);
    if (entries.get(key)?.token === token) return true;

    if (disposed || pages.token(page) !== token) return false;
    let entry = entries.get(key);
    if (!entry) {
      if (!free.length) {
        let oldest = [...entries]
          .filter(([key, value]) => !pinned.has(key) && value.used < frame)
          .sort((a, b) => a[1].used - b[1].used)[0];
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
            !wanted.has(key) &&
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
    while (inflight.size < 2 && requests.size) {
      const reservation =
        inflight.size === 1 && ![...inflight].some((key) => pinned.has(key))
          ? [...requests].find(([key]) => pinned.has(key))
          : undefined;
      const [key, { page }] = reservation ?? [...requests].sort((a, b) => a[1].priority - b[1].priority)[0]!;
      requests.delete(key);
      if (inflight.has(key)) continue;
      const token = pages.token(page);
      if (entries.get(key)?.token === token) continue;
      inflight.add(key);
      const valid = () => !disposed && wanted.has(key) && pages.token(page) === token;
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
  const begin = (layers: Layer[], resetDisplayed = true) => {
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
    // Reserve the actual pinned coverage, then share the remaining slots among visible layers.
    maxPages = Math.max(
      4,
      Math.floor((capacity - pinned.size) / Math.max(1, layers.filter((l) => l.visible && l.opacity > 0).length))
    );
    frame++;
    requests = new Map();
    wanted = new Set(pinned);
    draws = 0;
    fallback = 0;
    selected = [];
    if (resetDisplayed) displayed.clear();
  };
  return {
    begin,
    /** Refreshes the last frame's detail and coarse coverage before another stroke can expose the edit.
     * Unchanged page tokens skip all work; refreshed resident pages reuse their existing atlas slots.
     */
    async prepare(layers: Layer[]) {
      begin(layers, false);
      await pages.retain(coverage);
      const refresh = new Map(
        [...displayed].filter(([key, page]) => entries.has(key) && layers.some((layer) => layer.id === page.layerId))
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
              if (!(await work.run(() => upload(page, token, pixels), valid, pixels.byteLength)))
                throw new Error('Could not prepare the drawing overview.');
            }, valid);
          })
        );
      }
    },
    /** Draws committed pages without waiting for reads. Returns true only when every occupied
     * part of the selection has resident coverage. Empty branches need no texture.
     * Active output can replace covered pixels in this layer target before layer compositing.
     */
    draw(layer: Layer, pass: GPURenderPassEncoder, camera: Camera, size: ViewSize, scale: number) {
      const visible = pages.visible(layer.id, camera, size, scale, maxPages);
      const batch: { source: NonNullable<ReturnType<typeof entries.get>>; region: VirtualPage }[] = [];
      let resident: NonNullable<ReturnType<typeof entries.get>>[] | undefined;
      let covered = true;
      for (const page of visible) {
        const key = id(page);
        wanted.add(key);
        const entry = entries.get(key);
        const exact = entry?.token === pages.token(page);
        let matches = exact ? [{ source: entry, region: page }] : [];
        if (!exact) {
          resident ??= [...entries.values()].filter(
            (candidate) => candidate.page.layerId === layer.id && candidate.token === pages.token(candidate.page)
          );
          matches = pageFallback(page, resident);
          requests.set(key, { page, priority: matches.length ? 2 : 0 });
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
          displayed.set(id(match.source.page), match.source.page);
          batch.push(match);
        }
      }
      if (!batch.length) return covered;
      cameraBuffer.write({
        size: d.vec2f(size.width, size.height),
        zoom: camera.zoom,
        angle: camera.angle,
        mirror: camera.mirrored ? -1 : 1,
        pixelRatio: scale
      });
      const data = new Float32Array(batch.length * 8);
      batch.forEach(({ source, region }, i) => {
        const span = 256 * 2 ** region.level;
        const crop = pageCrop(source.page, region);
        data.set(
          [region.x * span - camera.x, region.y * span - camera.y, span, source.slot, crop.x, crop.y, crop.scale, 0],
          i * 8
        );
      });
      root.device.queue.writeBuffer(root.unwrap(instances), 0, data);
      pipeline.with(pass).with(group).with(instanceLayout, instances).draw(6, batch.length);
      draws++;
      return covered;
    },
    end() {
      // Visible detail is requested first. Idle capacity builds persistent coarse coverage,
      // even while the user stays zoomed in; navigation never cancels these requests.
      for (const page of coverage) {
        const key = id(page);
        if (entries.get(key)?.token !== pages.token(page)) requests.set(key, { page, priority: 1 });
      }
      pump();
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
      pending: requests.size + inflight.size,
      uploadedBytes: uploaded,
      drawCalls: draws,
      fallbackPages: fallback,
      gpuBytes: capacity * PAGE_SIDE * PAGE_SIDE * 4
    }),
    debug: () => selected,
    destroy() {
      disposed = true;
      work.dispose();
      requests.clear();
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
