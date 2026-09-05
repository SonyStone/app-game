import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import type { Layer } from '../document';
import type { Camera, ViewSize } from '../camera';
import { createVirtualPages, PAGE_SIDE, type VirtualPage, type OverviewStorage } from '../virtualPages';
import { type TileData } from '../tilePixels';
import { disjointPages, pageFallback } from './pageFallback';

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
  const instances = root.createBuffer(d.arrayOf(d.vec4f, 256)).$usage('vertex');
  const group = root.createBindGroup(layout, {
    image: image.createView(d.texture2dArray()),
    sampler: root.createSampler({ minFilter: 'linear', magFilter: 'linear' }),
    camera: cameraBuffer
  });
  const pipeline = root.createRenderPipeline({
    attribs: { page: instanceLayout.attrib },
    vertex,
    fragment,
    targets: { format: 'rgba8unorm' }
  });
  const pages = createVirtualPages(read, undefined, storage);
  const entries = new Map<string, { page: VirtualPage; token: string; slot: number; used: number }>();
  let coverageLayers: Layer[] | undefined;
  let coverage: VirtualPage[] = [];
  let pinned = new Set<string>();
  let requests = new Map<string, VirtualPage>();
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
      const [key, page] = reservation ?? requests.entries().next().value!;
      requests.delete(key);
      if (inflight.has(key)) continue;
      const token = pages.token(page);
      if (entries.get(key)?.token === token) continue;
      inflight.add(key);
      void pages
        .bordered(page, () => !disposed && wanted.has(key))
        .then((pixels) => {
          upload(page, token, pixels);
        })
        .catch((error) => {
          if (error instanceof Error && error.message === 'Obsolete virtual page') {
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
  const begin = (layers: Layer[]) => {
    maxPages = Math.max(
      4,
      Math.floor(capacity / Math.max(1, layers.filter((l) => l.visible && l.opacity > 0).length) / 2)
    );
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
    frame++;
    requests = new Map();
    wanted = new Set(pinned);
    draws = 0;
    fallback = 0;
    selected = [];
  };
  return {
    begin,
    /** Updates and uploads the coarse levels before a completed edit becomes navigable. */
    async prepare(layers: Layer[]) {
      begin(layers);
      await pages.retain(coverage);
      for (let offset = 0; offset < coverage.length; offset += 2) {
        await Promise.all(
          coverage.slice(offset, offset + 2).map(async (page) => {
            const key = id(page),
              token = pages.token(page);
            if (entries.get(key)?.token === token) return;
            const pixels = await pages.bordered(page, () => !disposed);
            if (!upload(page, token, pixels)) throw new Error('Could not prepare the drawing overview.');
          })
        );
      }
    },
    /** One draw per layer. Read requests never block this render pass. */
    draw(layer: Layer, pass: GPURenderPassEncoder, camera: Camera, size: ViewSize, scale: number) {
      const visible = pages.visible(layer.id, camera, size, scale, maxPages);
      const render = new Map<string, NonNullable<ReturnType<typeof entries.get>>>();
      let resident: NonNullable<ReturnType<typeof entries.get>>[] | undefined;
      for (const page of visible) {
        const key = id(page);
        wanted.add(key);
        const entry = entries.get(key);
        const exact = entry?.token === pages.token(page);
        let matches = exact ? [entry] : [];
        if (!exact) {
          requests.set(key, page);
          resident ??= [...entries.values()].filter(
            (candidate) => candidate.page.layerId === layer.id && candidate.token === pages.token(candidate.page)
          );
          matches = pageFallback(page, resident);
          if (matches.length) fallback++;
        }
        selected.push({ ...page, resident: matches.length > 0, fallback: !exact && matches.length > 0 });
        for (const match of matches) {
          match.used = frame;
          render.set(id(match.page), match);
        }
      }
      const batch = disjointPages([...render.values()]);
      if (!batch.length) return;
      cameraBuffer.write({
        size: d.vec2f(size.width, size.height),
        zoom: camera.zoom,
        angle: camera.angle,
        mirror: camera.mirrored ? -1 : 1,
        padding: 0
      });
      const data = new Float32Array(batch.length * 4);
      batch.forEach((entry, i) => {
        const span = 256 * 2 ** entry.page.level;
        data.set([entry.page.x * span - camera.x, entry.page.y * span - camera.y, span, entry.slot], i * 4);
      });
      root.device.queue.writeBuffer(root.unwrap(instances), 0, data);
      pipeline.with(pass).with(group).with(instanceLayout, instances).draw(6, batch.length);
      draws++;
    },
    end() {
      // Visible detail is requested first. Idle capacity builds persistent coarse coverage,
      // even while the user stays zoomed in; navigation never cancels these requests.
      for (const page of coverage) {
        const key = id(page);
        if (entries.get(key)?.token !== pages.token(page)) requests.set(key, page);
      }
      pump();
    },
    invalidate() {
      coverageLayers = undefined;
      pages.invalidate();
    },
    stats: () => ({
      ...pages.stats(),
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
  camera: { uniform: d.struct({ size: d.vec2f, zoom: d.f32, angle: d.f32, mirror: d.f32, padding: d.f32 }) }
});
const instanceLayout = tgpu.vertexLayout(d.arrayOf(d.vec4f), 'instance');
/** Page coordinates are relative to the camera before upload, preserving far-origin precision. */
export const vertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex, page: d.vec4f },
  out: { position: d.builtin.position, uv: d.vec2f, slot: d.interpolate('flat', d.u32) }
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
    uv,
    slot: d.u32(input.page.w)
  };
});
/** Pages have explicit gutters and an explicit LOD; atlas slots cannot filter into each other. */
export const fragment = tgpu.fragmentFn({ in: { uv: d.vec2f, slot: d.interpolate('flat', d.u32) }, out: d.vec4f })((
  input
) => {
  'use gpu';
  return std.textureSampleLevel(
    layout.$.image,
    layout.$.sampler,
    std.div(std.add(std.mul(input.uv, 256), d.vec2f(1)), PAGE_SIDE),
    d.i32(input.slot),
    0
  );
});
