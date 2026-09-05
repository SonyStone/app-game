import { TILE_SIZE } from './brush';
import { screenToWorld, type Camera, type ViewSize } from './camera';
import type { Layer } from './document';
import { packTile, unpackTile, type TileData } from './tilePixels';

/** Sparse overview pyramid. Level n covers 2^n source tiles along each axis.
 * Derived pages are disposable; only level-zero snapshots are authoritative for painting and undo.
 */
export function createVirtualPages(
  read: (data: TileData) => Promise<Uint8Array>,
  budget = 16 * 1048576,
  storage?: OverviewStorage
) {
  const layers = new Map<
    string,
    { source: Map<string, TileData>; counts: Map<string, number>; versions: Map<string, number> }
  >();
  const hashes = new Map<string, { revision: number; value: Promise<string> }>();
  const arrayIds = new WeakMap<Uint8Array, string>();
  let restoredPages = 0;
  const cache = new Map<string, Uint8Array>();
  const pending = new Map<string, Promise<Uint8Array>>();
  let sourceLayers: Layer[] | undefined;
  let bytes = 0,
    built = 0,
    yieldAt = 0,
    generation = 0;
  const version = (page: VirtualPage) => {
    const versions = layers.get(page.layerId)?.versions;
    const values: number[] = [];
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++) values.push(versions?.get(`${page.level}/${page.x + x},${page.y + y}`) ?? 0);
    return values.join(',');
  };
  const token = (page: VirtualPage) => `${page.layerId}/${address(page)}/${version(page)}`;
  const contentKey = (page: VirtualPage): Promise<string> => {
    const index = layers.get(page.layerId);
    if (!index?.counts.has(address(page))) return Promise.resolve('empty');
    if (page.level === 0) {
      const source = index.source.get(`${page.x},${page.y}`)!;
      if (!(source instanceof Uint8Array)) return Promise.resolve(source.storageId);
      let id = arrayIds.get(source);
      if (!id) {
        id = crypto.randomUUID();
        arrayIds.set(source, id);
      }
      return Promise.resolve(id);
    }
    const node = `${page.layerId}/${address(page)}`;
    const revision = index.versions.get(address(page))!;
    const cached = hashes.get(node);
    if (cached?.revision === revision) return cached.value;
    const children = [0, 1, 2, 3].map((i) =>
      contentKey({ ...page, level: page.level - 1, x: page.x * 2 + (i % 2), y: page.y * 2 + Math.floor(i / 2) })
    );
    const value = Promise.all(children).then(async (ids) => {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(['paint-overview-box-v1', page.level, ...ids]))
      );
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    });
    hashes.set(node, { revision, value });
    return value;
  };
  const pagePixels = async (page: VirtualPage, valid = () => true): Promise<Uint8Array> => {
    if (!valid()) throw new Error('Obsolete virtual page');
    const layer = layers.get(page.layerId);
    if (!layer?.counts.has(address(page))) return EMPTY;
    // Interior pixels depend only on this node. Neighbor revisions invalidate gutters, not these pixels.
    const pixelToken = () => `${page.layerId}/${address(page)}/${layer.versions.get(address(page)) ?? 0}`;
    const id = pixelToken();
    const found = cache.get(id);
    if (found) {
      cache.delete(id);
      cache.set(id, found);
      return found;
    }
    const inflight = pending.get(id);
    if (inflight) {
      try {
        return await inflight;
      } catch (error) {
        if (valid() && error instanceof Error && error.message === 'Obsolete virtual page')
          return pagePixels(page, valid);
        throw error;
      }
    }
    const task = (async () => {
      if (performance.now() >= yieldAt) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        yieldAt = performance.now() + 4;
      }
      if (!valid()) throw new Error('Obsolete virtual page');
      const key = storage && page.level > 0 ? await contentKey(page) : undefined;
      const stored = key ? await storage!.read(key) : undefined;
      let pixels: Uint8Array;
      if (stored) {
        pixels = unpackTile(stored);
        restoredPages++;
      } else if (page.level === 0) {
        const source = layer.source.get(`${page.x},${page.y}`);
        pixels = source ? unpackTile(await read(source)) : EMPTY;
      } else {
        pixels = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const child = await pagePixels(
              { ...page, level: page.level - 1, x: page.x * 2 + dx, y: page.y * 2 + dy },
              valid
            );
            downsampleInto(child, pixels, dx, dy);
          }
      }
      if (!valid() || id !== pixelToken()) throw new Error('Obsolete virtual page');
      if (key && !stored) await storage!.write(key, packTile(pixels));
      if (pixels !== EMPTY) {
        cache.set(id, pixels);
        bytes += pixels.byteLength;
        if (!stored && page.level > 0) built++;
        while (bytes > budget && cache.size) {
          const oldest = cache.keys().next().value!;
          bytes -= cache.get(oldest)!.byteLength;
          cache.delete(oldest);
        }
      }
      return pixels;
    })().finally(() => pending.delete(id));
    pending.set(id, task);
    return task;
  };
  return {
    /** Reindexes only changed document versions, including negative coordinates and layer removal. */
    sync(next: Layer[]) {
      if (next === sourceLayers) return;
      sourceLayers = next;
      for (const id of layers.keys()) if (!next.some((layer) => layer.id === id)) layers.delete(id);
      for (const layer of next) {
        let index = layers.get(layer.id);
        if (!index) {
          index = { source: new Map(), counts: new Map(), versions: new Map() };
          layers.set(layer.id, index);
        }
        const keys = new Set([...index.source.keys(), ...layer.tiles.keys()]);
        for (const key of keys) {
          const before = index.source.get(key),
            after = layer.tiles.get(key);
          if (before === after) continue;
          const revision = ++generation;
          const [x, y] = key.split(',').map(Number);
          for (let level = 0; level <= MAX_LEVEL; level++) {
            const px = Math.floor(x! / 2 ** level),
              py = Math.floor(y! / 2 ** level);
            const node = `${level}/${px},${py}`;
            const count = (index.counts.get(node) ?? 0) + Number(!!after) - Number(!!before);
            if (count) index.counts.set(node, count);
            else index.counts.delete(node);
            index.versions.set(node, revision);
          }
          if (after) index.source.set(key, after);
          else index.source.delete(key);
        }
      }
    },
    /** A small whole-layer overview is prepared independently of the current camera.
     * Four source levels cover the normal zoom-out range. Coarsen further when the document is larger.
     */
    overview(layerId: string, maxPages: number): VirtualPage[] {
      const counts = layers.get(layerId)?.counts;
      if (!counts) return [];
      const byLevel = Array.from({ length: MAX_LEVEL + 1 }, () => [] as VirtualPage[]);
      for (const key of counts.keys()) {
        const [levelText, coords] = key.split('/');
        const level = Number(levelText);
        if (level < 4) continue;
        const [x, y] = coords!.split(',').map(Number);
        byLevel[level]!.push({ layerId, level, x: x!, y: y! });
      }
      for (let level = 4; level <= MAX_LEVEL; level++) {
        const candidates = byLevel[level]!;
        if (candidates.length <= maxPages) return candidates;
      }
      // Extremely scattered drawings may not fit even at the coarsest supported level.
      return byLevel[MAX_LEVEL]!.slice(0, maxPages);
    },
    /** Selects visible occupied pages without scanning every source tile. */
    visible(layerId: string, camera: Camera, size: ViewSize, scale: number, maxPages = 128): VirtualPage[] {
      const corners = [
        [0, 0],
        [size.width, 0],
        [0, size.height],
        [size.width, size.height]
      ].map(([x, y]) => screenToWorld({ x: x!, y: y! }, camera, size));
      let level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(-Math.log2(camera.zoom * scale))));
      const bounds = (level: number) => {
        const span = TILE_SIZE * 2 ** level;
        return {
          x0: Math.floor(Math.min(...corners.map((p) => p.x)) / span),
          x1: Math.floor(Math.max(...corners.map((p) => p.x)) / span),
          y0: Math.floor(Math.min(...corners.map((p) => p.y)) / span),
          y1: Math.floor(Math.max(...corners.map((p) => p.y)) / span)
        };
      };
      let box = bounds(level);
      while ((box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1) > maxPages && level < MAX_LEVEL) box = bounds(++level);
      const result: VirtualPage[] = [];
      const index = layers.get(layerId);
      for (let y = box.y0; y <= box.y1; y++)
        for (let x = box.x0; x <= box.x1; x++)
          if (index?.counts.has(`${level}/${x},${y}`)) result.push({ layerId, level, x, y });
      const span = TILE_SIZE * 2 ** level;
      return result.sort(
        (a, b) =>
          Math.hypot((a.x + 0.5) * span - camera.x, (a.y + 0.5) * span - camera.y) -
          Math.hypot((b.x + 0.5) * span - camera.x, (b.y + 0.5) * span - camera.y)
      );
    },
    token,
    pagePixels,
    /** Keeps the current coarse roots durable when older derived versions are pruned. */
    async retain(pages: VirtualPage[]) {
      storage?.retain?.(await Promise.all(pages.map(contentKey)));
    },
    /** One-pixel gutters make bilinear samples cross page boundaries without edge replication seams. */
    async bordered(page: VirtualPage, valid = () => true) {
      const id = token(page);
      const result = new Uint8Array(PAGE_SIDE * PAGE_SIDE * 4);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const pixels = await pagePixels({ ...page, x: page.x + dx, y: page.y + dy }, valid);
          const width = dx === 0 ? TILE_SIZE : 1,
            height = dy === 0 ? TILE_SIZE : 1;
          const sx = dx < 0 ? TILE_SIZE - 1 : 0,
            sy = dy < 0 ? TILE_SIZE - 1 : 0;
          const tx = dx < 0 ? 0 : dx === 0 ? 1 : PAGE_SIDE - 1;
          const ty = dy < 0 ? 0 : dy === 0 ? 1 : PAGE_SIDE - 1;
          for (let row = 0; row < height; row++)
            result.set(
              pixels.subarray(((sy + row) * TILE_SIZE + sx) * 4, ((sy + row) * TILE_SIZE + sx + width) * 4),
              ((ty + row) * PAGE_SIDE + tx) * 4
            );
        }
      if (!valid() || id !== token(page)) throw new Error('Obsolete virtual page');
      return result;
    },
    invalidate() {
      sourceLayers = undefined;
    },
    stats: () => ({ overviewBytes: bytes, builtPages: built, restoredPages }),
    clear() {
      cache.clear();
      hashes.clear();
      layers.clear();
      sourceLayers = undefined;
      bytes = 0;
    }
  };
}

/** World-space page address. Coordinates are signed at every overview level. */
export type VirtualPage = { layerId: string; level: number; x: number; y: number };
export const PAGE_SIDE = TILE_SIZE + 2;
export const MAX_LEVEL = 12;
function address(page: VirtualPage) {
  return `${page.level}/${page.x},${page.y}`;
}

/** Box-filter premultiplied channels together; four children each fill one quadrant. */
function downsampleInto(source: Uint8Array, target: Uint8Array, qx: number, qy: number) {
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const from = (y * 2 * 256 + x * 2) * 4;
      const to = ((y + qy * 128) * 256 + x + qx * 128) * 4;
      for (let c = 0; c < 4; c++)
        target[to + c] = Math.round(
          (source[from + c]! + source[from + 4 + c]! + source[from + 1024 + c]! + source[from + 1028 + c]!) / 4
        );
    }
}
const EMPTY = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);

/** Lossless derived-page storage; keys encode all child versions, independent of transient GPU state. */
export type OverviewStorage = {
  retain?: (keys: string[]) => void;
  read: (key: string) => Promise<Uint8Array | undefined>;
  write: (key: string, pixels: Uint8Array) => void | Promise<void>;
};
