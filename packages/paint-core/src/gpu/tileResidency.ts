import { commandBatch } from '@app-game/abr-paint/gpu/commandBatch';
import { commandSlots } from '@app-game/abr-paint/gpu/commandSlots';
import type { TgpuRoot } from 'typegpu';
import { attempt, unwrapResult, type Result } from '../asyncResult';
import type { Layer } from '../document';
import { tileHasAlpha, unpackTile, type TileData } from '../tilePixels';
import { evictionVictims } from './evictionVictims';
import { createReadbackQueue } from './readbackQueue';
import type { StrokeData } from './strokeState';
import {
  createStrokeScratch,
  createTile,
  destroyStrokeScratch,
  destroyTile,
  MAX_RESIDENT_TILES,
  prepareStroke,
  replacePixels,
  replaceTransmittance,
  scratchBytes,
  STAMP_CAPACITY,
  tileBytes,
  tileId,
  type PaintTile,
  type StrokeScratch
} from './tileTextures';

/**
 * Bounded set of full-resolution document tiles resident on the GPU for painting and exact display.
 *
 * `ensure` loads a tile (from the active stroke's snapshot or the committed layer), evicting least-recently-used
 * tiles in small groups when the budget is full. Evicting a tile the active stroke changed reads its pixels (and
 * the coverage needed to resume painting it) back into the stroke snapshot first. Committed CPU tiles stay
 * authoritative; everything here is a disposable cache. Calls must be serialized with painting and rendering.
 */
export function createTileResidency(
  root: TgpuRoot,
  sampler: ReturnType<TgpuRoot['createSampler']>,
  stroke: StrokeData,
  options: {
    /** Hard pixel-tile limit for constrained devices and eviction verification. */
    cacheTiles?: number;
    /** Reuse transient sampling scratch; false retains per-tile scratch for GPU comparisons. */
    sharedScratch?: boolean;
    readTile?: (pixels: TileData) => Promise<Uint8Array>;
    onError?: (error: unknown) => void;
  }
) {
  const device = root.device;
  const cache = new Map<string, PaintTile>();
  const spareTiles: PaintTile[] = [];
  const samplingScratch: StrokeScratch[] = [];
  let sharedScratch = false;
  let residentLimit = Math.max(1, options.cacheTiles ?? MAX_RESIDENT_TILES);
  const scratchLimit = Math.min(32, residentLimit);
  const reserveSamplingScratch = commandSlots(scratchLimit);
  const evictionSize = Math.min(16, Math.max(1, Math.floor((options.cacheTiles ?? MAX_RESIDENT_TILES) / 8)));
  const readbackBatch = evictionSize * 4;
  const readbacks = createReadbackQueue(device, readbackBatch);
  let frame = 0;
  let disposed = false;
  // Test hooks: GPU checks wait on these instead of sleeping to prove a consumer is blocked on readback.
  let snapshotWaits = 0;
  let settledSnapshots = 0;

  return {
    /** Evicts least-recently-used tiles. Active mask readback occurs only when the cache is full.
     * `batch` is flushed before victims are recycled and receives transparent clears. `pinned` ids are loaded
     * members of an undrawn render batch; they are never evicted to make room.
     */
    async ensure(layer: Layer, key: string, batch?: ReturnType<typeof commandBatch>, pinned?: ReadonlySet<string>) {
      const id = tileId(layer.id, key);
      let tile = cache.get(id);
      if (tile) {
        tile.used = ++frame;
        return tile;
      }

      if (cache.size >= residentLimit) {
        await evict(batch, pinned);
      }

      const active = stroke.tiles.get(id);
      await awaitSnapshots([active?.pending]);

      const pixels = await readTile(active?.output ?? layer.tiles.get(key));
      tile = spareTiles.pop();
      if (tile) {
        replacePixels(device, root.unwrap(tile.texture), pixels, batch);
        tile.mipLevelReady = 0;
      } else {
        tile = createTile(root, pixels, sampler);
      }

      tile.strokeDirty = false;
      try {
        tile.used = ++frame;
        if (active && !sharedScratch) {
          const scratch = prepareStroke(root, tile);
          if (!stroke.transientCoverage) {
            replacePixels(device, root.unwrap(scratch.base), await readTile(active.before), batch);
            if (!stroke.abr) {
              replaceTransmittance(device, root.unwrap(scratch.transmittance), active.transmittance, batch);
            }
          }

          if (stroke.abr) {
            scratch.abr ??= stroke.abr.createTile(scratch.base, scratch.mask, STAMP_CAPACITY);
            if (!stroke.transientCoverage) {
              scratch.abr.coverage.restore(active.coverage, unpackTile, batch);
            }
          }
        }

        cache.set(id, tile);
        return tile;
      } catch (error) {
        // A failed source read must not orphan an allocated slot outside the bounded pool.
        // Paint's finally block still submits any queued clears before the next command can reuse it.
        spareTiles.push(tile);
        throw error;
      }
    },

    /** Resident tile for `id`, without loading or touching its LRU position. */
    get: (id: string) => cache.get(id),
    has: (id: string) => cache.has(id),
    readTile,

    /** Whether sampling tools currently borrow shared scratch instead of per-tile scratch. */
    get sharedScratch() {
      return sharedScratch;
    },
    get residentLimit() {
      return residentLimit;
    },
    get evictionSize() {
      return evictionSize;
    },
    get scratchLimit() {
      return scratchLimit;
    },

    /** Borrows a shared sampling scratch slot that is free in `commands`' current submission. */
    samplingScratch(commands: ReturnType<typeof commandBatch>) {
      return (samplingScratch[reserveSamplingScratch(commands)] ??= createStrokeScratch(root));
    },

    /**
     * Switches between per-tile and shared sampling scratch at stroke begin. Keeps the previous texture budget:
     * each freed four-texture scratch set buys three mipmapped tiles.
     */
    configure(shared: boolean) {
      if (shared === sharedScratch) {
        return;
      }

      residentLimit = Math.max(
        1,
        options.cacheTiles ?? (shared ? MAX_RESIDENT_TILES * 4 - scratchLimit * 3 : MAX_RESIDENT_TILES)
      );
      for (const tile of spareTiles) {
        destroyTile(tile);
      }

      spareTiles.length = 0;
      if (shared) {
        for (const tile of cache.values()) {
          if (tile.scratch) {
            destroyStrokeScratch(tile.scratch);
          }

          tile.scratch = undefined;
        }
      } else {
        for (const scratch of samplingScratch) {
          destroyStrokeScratch(scratch);
        }

        samplingScratch.length = 0;
        const victims = [...cache].sort((a, b) => a[1].used - b[1].used);
        for (const [id, tile] of victims.slice(0, Math.max(0, cache.size - residentLimit))) {
          destroyTile(tile);
          cache.delete(id);
        }
      }

      sharedScratch = shared;
    },

    /**
     * Reads resident stroke tiles back for commit through the bounded eviction staging buffers, two batches in
     * flight. Alpha is checked on the raw mapped pixels; the returned arrays are already packed.
     */
    async readBack(ids: readonly string[]) {
      const outputs = new Map<string, { pixels: Uint8Array; alpha: boolean }>();
      const reads: Promise<void>[] = [];
      for (let offset = 0; offset < ids.length; offset += readbackBatch) {
        const chunk = ids.slice(offset, offset + readbackBatch);
        const alpha: boolean[] = [];
        const job = await readbacks.capture(
          chunk.map((id) => root.unwrap(cache.get(id)!.texture)),
          (raw, index) => (alpha[index] = tileHasAlpha(raw))
        );
        reads.push(
          job.ready.then((result) => {
            const pixels = unwrapResult(result);
            chunk.forEach((id, index) => outputs.set(id, { pixels: pixels[index]!, alpha: alpha[index]! }));
          })
        );
      }

      await Promise.all(reads);
      return outputs;
    },

    /** Destroys a discarded stroke's resident tile; its committed pixels reload on next use. */
    discard(id: string) {
      const tile = cache.get(id);
      if (tile) {
        destroyTile(tile);
      }

      cache.delete(id);
    },

    /** Returns a deleted layer's resident tiles to the spare pool. `owned` matches that layer's tile ids. */
    releaseWhere(owned: (id: string) => boolean) {
      for (const [id, tile] of cache) {
        if (owned(id)) {
          spareTiles.push(tile);
          cache.delete(id);
        }
      }
    },

    /** Invalidates pending eviction readbacks of a discarded stroke. */
    cancelReadbacks() {
      readbacks.clear();
    },

    /** Destroys every resident tile and sampling scratch; committed pixels reload on demand. */
    clear() {
      for (const tile of [...cache.values(), ...spareTiles]) {
        destroyTile(tile);
      }

      cache.clear();
      spareTiles.length = 0;
      for (const scratch of samplingScratch) {
        destroyStrokeScratch(scratch);
      }

      samplingScratch.length = 0;
      readbacks.clear();
    },

    awaitSnapshots,

    stats() {
      const readback = { ...readbacks.stats(), snapshotWaits, settledSnapshots };
      return {
        residentTiles: cache.size + spareTiles.length,
        samplingScratchTiles: samplingScratch.length,
        readback,
        bytes:
          readback.bytes +
          samplingScratch.reduce((sum, scratch) => sum + scratchBytes(scratch), 0) +
          [...cache.values(), ...spareTiles].reduce((sum, tile) => sum + tileBytes(tile), 0)
      };
    },

    destroy() {
      disposed = true;
      readbacks.destroy();
      for (const tile of [...cache.values(), ...spareTiles]) {
        destroyTile(tile);
      }

      for (const scratch of samplingScratch) {
        destroyStrokeScratch(scratch);
      }

      cache.clear();
      spareTiles.length = samplingScratch.length = 0;
    }
  };

  /** Resolves a committed tile reference through storage; raw arrays and absent tiles pass through. */
  async function readTile(pixels: TileData | undefined) {
    if (pixels === undefined || pixels instanceof Uint8Array) {
      return pixels;
    }

    if (!options.readTile) {
      throw new Error('Missing tile storage reader.');
    }

    return options.readTile(pixels);
  }

  /** Retires one LRU group, starting a readback of any victim the active stroke changed. */
  async function evict(batch: ReturnType<typeof commandBatch> | undefined, pinned: ReadonlySet<string> | undefined) {
    // Submit every command referencing victims before readback or recycling their resources.
    batch?.flush();
    // Amortize readback synchronization over a small LRU batch as the stroke grows.
    const victims = evictionVictims(cache, evictionSize, pinned);
    // A tile loaded only for pickup still matches its saved snapshot. Reading it
    // back again makes large smudge footprints thrash the CPU/GPU boundary.
    const active = victims.filter(([id, tile]) => stroke.tiles.has(id) && tile.strokeDirty);
    if (active.length) {
      const coverage = stroke.abr?.coveragePlan(stroke.transientCoverage);
      const roundMask = !stroke.abr && !stroke.transientCoverage;
      const channels = 1 + (coverage?.count ?? Number(roundMask));
      const snapshots = active.map(([id]) => ({ id, snapshot: stroke.tiles.get(id)! }));
      const job = await readbacks.capture(
        active.flatMap(([, tile]) => [
          root.unwrap(tile.texture),
          ...(coverage?.count
            ? coverage.sources(tile.scratch!.abr!.coverage)
            : roundMask
              ? [root.unwrap(tile.scratch!.transmittance)]
              : [])
        ])
      );
      const pending = attempt(async () => {
        const result = await job.ready;
        settledSnapshots++;
        // Cancellation removes the snapshot; late outcomes belong to that discarded stroke.
        if (disposed || !snapshots.some(({ id, snapshot }) => stroke.tiles.get(id) === snapshot)) {
          return;
        }

        if (!result.ok) {
          options.onError?.(result.error);
          throw result.error;
        }

        const pixels = result.value;
        snapshots.forEach(({ id, snapshot }, index) => {
          if (stroke.tiles.get(id) !== snapshot || snapshot.pending !== pending) {
            return;
          }

          const at = index * channels;
          snapshot.output = pixels[at]!;
          snapshot.transmittance = roundMask ? pixels[at + 1] : undefined;
          snapshot.coverage = coverage?.snapshot(pixels, at + 1);
          snapshot.pending = undefined;
        });
      });
      // Failed results stay attached until finish/revisit explicitly observes them.
      for (const { snapshot } of snapshots) {
        snapshot.pending = pending;
      }
    }

    for (const [id, tile] of victims) {
      spareTiles.push(tile);
      cache.delete(id);
    }
  }

  /**
   * Waits for evicted tiles' pending readbacks and throws the first failure. Every consumer that must not read a tile
   * before its snapshot lands (revisit, pickup, display, finish) waits here; calls that actually wait are counted in
   * `stats().readback.snapshotWaits`.
   */
  async function awaitSnapshots(pending: readonly (Promise<Result<void>> | undefined)[]) {
    const waiting = pending.filter((snapshot) => snapshot !== undefined);

    if (waiting.length) {
      snapshotWaits++;
    }

    for (const result of await Promise.all(waiting)) {
      unwrapResult(result);
    }
  }
}

/** The renderer's tile cache. */
export type TileResidency = ReturnType<typeof createTileResidency>;
