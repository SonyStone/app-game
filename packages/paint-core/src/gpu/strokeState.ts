import type { AbrRasterSettings, createAbrStamps } from '@app-game/abr-paint/gpu/abrStamps';
import type { AbrCoverageSnapshot } from '@app-game/abr-paint/gpu/coverage';
import type { createAbrRetouch } from '@app-game/abr-paint/gpu/retouch';
import type { BrushResource } from '@app-game/abr-paint/resources';
import type { Result } from '../asyncResult';
import { dabTiles, type Brush, type Dab } from '../brush';
import type { Layer, TileChange } from '../document';
import { tileHasAlpha, type TileData } from '../tilePixels';
import type { createDisplayCache } from './displayCache';
import type { StrokeRaster } from './strokeRaster';
import type { TargetViews } from './targetView';
import type { TileResidency } from './tileResidency';

/**
 * Mutable state of the renderer's current stroke, shared by residency (eviction snapshots), rasterization and
 * frame composition. Brush-mode fields describe the most recently begun stroke and persist after it ends.
 */
export type StrokeData = {
  /** The stroke being painted, until finish/cancel/reset. */
  current: { layer: Layer; brush: Brush } | undefined;
  /** Prepared ABR rasterizer when the stroke uses ABR stamps; undefined for round and textured brushes. */
  abr: ReturnType<typeof createAbrStamps> | undefined;
  /** Smudge transports pixels between dabs. */
  smudge: boolean;
  /** Sampling tools replace coverage at every stamp; only dual-brush coverage persists. */
  transientCoverage: boolean;
  /** Immutable history state restored by the history eraser. */
  historySource: Layer | undefined;
  /** Snapshot per touched tile id: the committed version before the stroke and any evicted output. */
  tiles: Map<string, StrokeTileSnapshot>;
  /** Display-only preview stamps per tile key; never committed. */
  tail: Map<string, Dab[]>;
};

/** Committed tile before the stroke plus the evicted stroke output and coverage needed to resume painting it. */
export type StrokeTileSnapshot = {
  before: TileData | undefined;
  mask?: Uint8Array;
  coverage?: AbrCoverageSnapshot;
  output?: Uint8Array;
  /** Pending eviction readback; failed results stay attached until finish or a revisit observes them. */
  pending?: Promise<Result<void>>;
};

export function createStrokeData(): StrokeData {
  return {
    current: undefined,
    abr: undefined,
    smudge: false,
    transientCoverage: false,
    historySource: undefined,
    tiles: new Map(),
    tail: new Map()
  };
}

/**
 * Stroke lifecycle over the shared StrokeData: begin captures the brush and target layer, preview replaces the
 * disposable tail, finish reads touched tiles back into atomic tile changes, and cancel/reset discard them.
 * Every call must be serialized with painting and rendering.
 */
export function createStrokeState(
  data: StrokeData,
  deps: {
    residency: TileResidency;
    raster: StrokeRaster;
    retouch: ReturnType<typeof createAbrRetouch<Layer>>;
    targets: TargetViews;
    displayCache: ReturnType<typeof createDisplayCache>;
    /** Invalidates virtual-texture coverage after committed pixels change. */
    invalidateOverview: () => void;
    /** Whether commits can change the virtual-texture representation of other targets. */
    streaming: boolean;
    allowsTile: (key: string) => boolean;
    sharedScratch?: boolean;
  }
) {
  const { residency, raster, retouch, targets } = deps;

  return {
    /** Captures brush settings and the target layer until commit/cancel. Optional native coverage replaces hardness.
     * Textured dabs must carry the tip's circumscribed radius; use texturedBrush to map brush size correctly.
     */
    begin(
      layer: Layer,
      brush: Brush,
      tip?: { resource: BrushResource; angle: number },
      abr?: AbrRasterSettings<Layer>
    ) {
      if (data.current) {
        throw new Error('Finish the current stroke before beginning another.');
      }

      data.abr = abr ? raster.prepareAbr(abr) : undefined;
      data.smudge = !!abr?.smudge;
      data.transientCoverage = !!(abr?.smudge || abr?.filter || abr?.mixer) && !(abr?.values.useDualBrush && abr.dual);
      residency.configure(data.transientCoverage && deps.sharedScratch !== false);
      data.historySource = abr?.historySource;
      raster.prepareTip(tip);
      setTail([]);
      for (const target of targets.all()) {
        // Without a complete view to reproject, a streaming target must rebuild before the stroke shows.
        if (deps.streaming && !target.complete) {
          target.damage.invalidate();
        }

        target.dropFallback();
      }

      data.current = { layer, brush: { ...brush } };
      raster.prepareBrush(brush);
      retouch.begin(abr, brush.color, residency.sharedScratch);
    },

    /** Replaces display-only stamps; these never enter readback, history or saved tiles. */
    preview(dabs: readonly Dab[]) {
      setTail(data.current ? dabs : []);
    },

    /** Commits touched pixels in bounded readback chunks; retains reusable GPU resources for subsequent strokes. */
    async finish(): Promise<TileChange[]> {
      const stroke = data.current;
      if (!stroke) {
        return [];
      }

      setTail([]);
      await residency.awaitSnapshots([...data.tiles.values()].map((snapshot) => snapshot.pending));

      const outputs = await residency.readBack([...data.tiles.keys()].filter((id) => residency.has(id)));
      const changes: TileChange[] = [];
      for (const [id, snapshot] of data.tiles) {
        const read = outputs.get(id);
        const after = read?.pixels ?? snapshot.output;
        const key = id.slice(stroke.layer.id.length + 1);
        if (after) {
          changes.push({
            layerId: stroke.layer.id,
            key,
            before: snapshot.before,
            after: (read ? read.alpha : tileHasAlpha(after)) ? after : undefined
          });
        }
      }

      data.tiles.clear();
      retouch.finish();
      end();
      deps.invalidateOverview();
      for (const target of targets.all()) {
        target.holdPreview();
        // VT can change representation at commit. Every target retains its preview until ready too.
        if (deps.streaming) {
          target.damage.invalidate();
        }
      }

      for (const change of changes) {
        targets.mark(change.key);
      }

      return changes;
    },

    /** Discards preview pixels and restores the committed document on the next render. */
    cancel() {
      retouch.cancel();
      setTail([]);
      for (const target of targets.all()) {
        if (data.tiles.size) {
          target.dropFallback();
        } else {
          target.hold = '';
        }
      }

      const layerId = data.current?.layer.id ?? '';
      for (const id of data.tiles.keys()) {
        targets.mark(id.slice(layerId.length + 1));
        deps.displayCache.remove(id);
        residency.discard(id);
      }

      data.tiles.clear();
      residency.cancelReadbacks();
      end();
    },

    /** Invalidates cached pixels after undo, redo or import. */
    reset() {
      retouch.cancel();
      setTail([]);
      for (const target of targets.all()) {
        target.dropFallback();
      }

      deps.invalidateOverview();
      deps.displayCache.clear();
      targets.invalidate();
      residency.clear();
      data.tiles.clear();
      end();
    },

    /** Occupied tile keys of the active stroke on `layer`, for the debug wireframe. */
    activeKeys(layer: Layer) {
      if (data.current?.layer.id !== layer.id) {
        return [];
      }

      return [...data.tiles.keys()].map((id) => id.slice(layer.id.length + 1));
    }
  };

  /** Clears the stroke and its per-stroke history tiles; brush-mode fields persist until the next begin. */
  function end() {
    data.current = undefined;
    data.historySource = undefined;
    raster.releaseHistoryTiles();
  }

  /** Replaces the disposable tail, damaging both the old and the new tail tiles on every target. */
  function setTail(dabs: readonly Dab[]) {
    for (const key of data.tail.keys()) {
      targets.mark(key);
    }

    data.tail.clear();
    for (const dab of dabs) {
      for (const key of dabTiles(dab)) {
        if (!deps.allowsTile(key)) {
          continue;
        }

        const list = data.tail.get(key) ?? [];
        list.push(dab);
        data.tail.set(key, list);
        targets.mark(key);
      }
    }
  }
}

/** The renderer's stroke lifecycle. */
export type StrokeState = ReturnType<typeof createStrokeState>;
