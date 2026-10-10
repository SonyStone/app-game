import { TILE_SIZE } from './brush';
import type { Point } from './camera';
import type { HistoryStep, Layer } from './document';
import { tileCoverage, type SelectionMask } from './selectionMask';
import { TILE_BYTES, type TileData } from './tilePixels';

/**
 * Reads the undo history of one layer within a region, for tools that return part of a layer to an earlier state,
 * such as the local undo. `history` lists steps newest first, as `DocumentEditContext.history` does; a depth is an
 * index into it.
 *
 * A step *touches* a region when it changed at least one pixel of the layer where the region covers it, comparing
 * `before` and `after` pixels exactly: a step that changed only other layers, layer properties, or pixels of the same
 * tile outside the region does not. A layer that did not exist before a step was transparent there.
 *
 * Unpacked tiles are kept, least recently used first out, up to `cacheBytes`, so asking again during a session reads
 * storage once. `read` unpacks a tile as `DocumentEditContext.readTile` does.
 */
export function createRegionHistory(read: (pixels: TileData) => Promise<Uint8Array>, cacheBytes = 128 * 1048576) {
  const cache = new Map<TileData, Uint32Array>();
  let cachedBytes = 0;

  return {
    touches,

    /** Depths of the steps that touch `region` on layer `layerId`, newest first. */
    async touching(history: readonly HistoryStep[], layerId: string, region: SelectionMask) {
      const depths: number[] = [];
      for (const [depth, step] of history.entries()) {
        if (await touches(step, layerId, region)) {
          depths.push(depth);
        }
      }

      return depths;
    },

    /** Whether `step` changed the pixel of layer `layerId` at `point`, in document pixels. */
    async changedAt(step: HistoryStep, layerId: string, point: Point) {
      const x = Math.floor(point.x),
        y = Math.floor(point.y);
      const tx = Math.floor(x / TILE_SIZE),
        ty = Math.floor(y / TILE_SIZE);
      const change = step.changes.find(({ layerId: id, key }) => id === layerId && key === `${tx},${ty}`);
      if (!change || change.before === change.after) {
        return false;
      }

      const index = (y - ty * TILE_SIZE) * TILE_SIZE + x - tx * TILE_SIZE;
      return (await pixels(change.before))[index] !== (await pixels(change.after))[index];
    },

    /** The pixels of layer `layerId` that `step` changed, fully covered, as a region. */
    async changedRegion(step: HistoryStep, layerId: string): Promise<SelectionMask> {
      const tiles = new Map<string, Uint8Array>();
      for (const change of step.changes) {
        if (change.layerId !== layerId || change.before === change.after) {
          continue;
        }

        const before = await pixels(change.before),
          after = await pixels(change.after);
        const tile = new Uint8Array(TILE_PIXELS);
        let changed = false;
        for (let index = 0; index < TILE_PIXELS; index++) {
          if (before[index] !== after[index]) {
            tile[index] = 255;
            changed = true;
          }
        }

        if (changed) {
          tiles.set(change.key, tile);
        }
      }

      return { outside: 0, tiles };
    },

    /**
     * Layer `layer`'s tiles with parts of it returned to earlier states: each part shows the layer as it was before
     * the step at its `depth`, in proportion to the part's region coverage, mixed with the current pixels by it. Where
     * parts overlap, the deepest part covering a pixel decides it, since returning to an older state also undoes
     * every later step. Returns the unpacked pixels of the tiles that differ from the current ones, `undefined` for a
     * tile that becomes transparent; with `keys`, only among those tiles.
     */
    async past(
      history: readonly HistoryStep[],
      layer: Layer,
      parts: readonly RegionPart[],
      keys?: Iterable<string>
    ): Promise<Map<string, Uint8Array | undefined>> {
      const result = new Map<string, Uint8Array | undefined>();
      for (const key of keys ?? new Set(parts.flatMap(({ region }) => [...region.tiles.keys()]))) {
        const [tx, ty] = tileOf(key);
        const covering = parts
          .map((part) => ({ depth: part.depth, coverage: partialCoverage(part.region, tx, ty) }))
          .filter((part): part is { depth: number; coverage: Uint8Array | undefined } => part.coverage !== 'outside')
          .sort((a, b) => b.depth - a.depth);
        if (!covering.length) {
          continue;
        }

        const current = await pixels(layer.tiles.get(key));
        const pasts = await Promise.all(
          covering.map(({ depth }) => pixels(stateBefore(history, layer, key, depth)))
        );
        const mixed = new Uint32Array(TILE_PIXELS);
        const bytes = new Uint8Array(mixed.buffer);
        let changed = false;
        for (let index = 0; index < TILE_PIXELS; index++) {
          const now = current[index]!;
          mixed[index] = now;
          const part = covering.findIndex(({ coverage }) => !coverage || coverage[index]! > 0);
          const then = part < 0 ? now : pasts[part]![index]!;
          if (then === now) {
            continue;
          }

          const amount = covering[part]!.coverage?.[index] ?? 255;
          if (amount === 255) {
            mixed[index] = then;
          } else {
            // Premultiplied channels move toward the past in proportion to the coverage.
            for (let channel = 0; channel < 4; channel++) {
              const from = (now >>> (channel * 8)) & 255,
                to = (then >>> (channel * 8)) & 255;
              bytes[index * 4 + channel] = Math.round(from + ((to - from) * amount) / 255);
            }
          }

          changed ||= mixed[index] !== now;
        }

        if (changed) {
          result.set(key, mixed.some((pixel) => pixel !== 0) ? bytes : undefined);
        }
      }

      return result;
    }
  };

  /**
   * Whether `step` changed a pixel of layer `layerId` that `region` covers; with `keys`, only in those tiles, such as
   * the tiles a growing region just gained.
   */
  async function touches(step: HistoryStep, layerId: string, region: SelectionMask, keys?: ReadonlySet<string>) {
    for (const change of step.changes) {
      if (change.layerId !== layerId || change.before === change.after || (keys && !keys.has(change.key))) {
        continue;
      }

      const [tx, ty] = tileOf(change.key);
      const coverage = partialCoverage(region, tx, ty);
      if (coverage === 'outside') {
        continue;
      }

      const before = await pixels(change.before),
        after = await pixels(change.after);
      for (let index = 0; index < TILE_PIXELS; index++) {
        if (before[index] !== after[index] && (!coverage || coverage[index]! > 0)) {
          return true;
        }
      }
    }

    return false;
  }

  /** Unpacked pixels of a tile as RGBA words, transparent for `undefined`, through the cache. */
  async function pixels(data: TileData | undefined): Promise<Uint32Array> {
    if (!data) {
      return transparent;
    }

    const cached = cache.get(data);
    if (cached) {
      cache.delete(data);
      cache.set(data, cached);
      return cached;
    }

    const unpacked = await read(data);
    const words =
      unpacked.byteOffset % 4 === 0
        ? new Uint32Array(unpacked.buffer, unpacked.byteOffset, TILE_PIXELS)
        : new Uint32Array(unpacked.slice().buffer);
    cache.set(data, words);
    cachedBytes += TILE_BYTES;
    while (cachedBytes > cacheBytes && cache.size > 1) {
      cache.delete(cache.keys().next().value!);
      cachedBytes -= TILE_BYTES;
    }

    return words;
  }
}

/** Part of a layer returned to the state before the step at `depth` in the history, where `region` covers it. */
export type RegionPart = { region: SelectionMask; depth: number };

/**
 * The tile `key` of `layer` as it was before the step at `depth`: the `before` of the oldest step from the newest to
 * that one that changed the tile, or the current tile when none did.
 */
function stateBefore(history: readonly HistoryStep[], layer: Layer, key: string, depth: number) {
  let state = layer.tiles.get(key);
  for (const step of history.slice(0, depth + 1)) {
    const change = step.changes.find(({ layerId, key: changed }) => layerId === layer.id && changed === key);
    if (change) {
      state = change.before;
    }
  }

  return state;
}

/** A region's coverage bytes of a tile, `undefined` when it covers the whole tile, or `outside` when none of it. */
function partialCoverage(region: SelectionMask, tx: number, ty: number) {
  const coverage = tileCoverage(region, tx, ty);
  return coverage.kind === 'partial' ? coverage.coverage : coverage.kind === 'inside' ? undefined : 'outside';
}

function tileOf(key: string): [number, number] {
  const [x, y] = key.split(',').map(Number);
  return [x!, y!];
}

const TILE_PIXELS = TILE_SIZE * TILE_SIZE;
/** A transparent tile; never written. */
const transparent = new Uint32Array(TILE_PIXELS);
