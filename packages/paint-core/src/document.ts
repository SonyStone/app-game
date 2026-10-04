import { packTile, type TileData } from './tilePixels';
export { TILE_BYTES } from './tilePixels';

/** A raster layer. Immutable tiles store raw or losslessly packed premultiplied sRGB RGBA8. */
export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  /** Painting keeps the alpha of the layer's pixels: it recolors them and leaves transparent pixels transparent. */
  alphaLock?: boolean;
  /**
   * The layer shows only where its clipping base, the nearest unclipped layer below, has pixels: its alpha is
   * multiplied by the base's own pixel alpha, before the base's opacity. A hidden base hides its clipped layers; a
   * clipped layer with no layer below shows as an ordinary layer.
   */
  clipping?: boolean;
  tiles: Map<string, TileData>;
};
/** Separable color blend modes; alpha always follows source-over. */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'linear';
/** The serializable user-visible layer properties. */
export type LayerInfo = Omit<Layer, 'tiles'>;
/** Before/after tile snapshots for one user action. Undefined means the tile did not exist. */
export type TileChange = {
  layerId: string;
  key: string;
  before: TileData | undefined;
  after: TileData | undefined;
};
type HistoryEntry = {
  id: number;
  before: LayerInfo[];
  after: LayerInfo[];
  activeBefore: string;
  activeAfter: string;
  tiles: TileChange[];
  bytes: number;
};

/** Owns layer order and bounded tile-snapshot history. GPU resources are disposable caches of these pixels. */
export function createDocument(options: { paged?: boolean } = {}) {
  let layers: Layer[] = [newLayer('layer-1', 'Layer 1')];
  let active = 'layer-1';
  let revision = 0;
  let nextHistoryId = 0,
    baseHistoryId = 0;
  let historySource: HistorySource = { id: 0, label: 'Opened document', layers: cloneLayers(layers) };
  const undo: HistoryEntry[] = [],
    redo: HistoryEntry[] = [];
  let historyBytes = 0;
  const info = () => layers.map(({ tiles: _tiles, ...layer }) => ({ ...layer }));
  const apply = (entry: HistoryEntry, direction: 'before' | 'after') => {
    const old = new Map(layers.map((layer) => [layer.id, layer]));
    layers = entry[direction].map((layer) => ({ ...layer, tiles: old.get(layer.id)?.tiles ?? new Map() }));
    for (const change of entry.tiles) {
      const layer = layers.find((layer) => layer.id === change.layerId);
      const pixels = change[direction];
      if (pixels) layer?.tiles.set(change.key, pixels);
      else layer?.tiles.delete(change.key);
    }
    active = direction === 'before' ? entry.activeBefore : entry.activeAfter;
  };
  const record = (value: Omit<HistoryEntry, 'id'>) => {
    const entry = { ...value, id: ++nextHistoryId };
    for (const entry of redo) historyBytes -= entry.bytes;
    redo.length = 0;
    undo.push(entry);
    historyBytes += entry.bytes;
    while (undo.length > 1 && (historyBytes > (options.paged ? 1024 * 1048576 : HISTORY_BYTES) || undo.length > 100)) {
      const removed = undo.shift()!;
      historyBytes -= removed.bytes;
      baseHistoryId = removed.id;
    }
    revision++;
  };
  return {
    /** Selects a retained history state without changing current pixels or undo/redo position.
     * Selected immutable versions stay pinned even if their undo entry is pruned or branched away.
     */
    selectHistorySource(id: number) {
      if (id === historySource.id) return;
      const states = [baseHistoryId, ...undo.map((entry) => entry.id), ...[...redo].reverse().map((entry) => entry.id)];
      const target = states.indexOf(id);
      if (target < 0) throw new Error('This history state is no longer available.');
      let snapshot = cloneLayers(layers);
      for (let index = undo.length; index > target; index--)
        snapshot = projectHistory(snapshot, undo[index - 1]!, 'before');
      for (let index = undo.length; index < target; index++)
        snapshot = projectHistory(snapshot, redo[redo.length - 1 - (index - undo.length)]!, 'after');
      historySource = { id, label: id === 0 ? 'Opened document' : `State ${id}`, layers: snapshot };
      revision++;
    },
    /** Borrowed read-only source for the active tool; an absent layer cannot be restored from that state. */
    historySourceLayer(id: string) {
      return historySource.layers.find((layer) => layer.id === id);
    },
    /** Structured-cloneable session handoff; tile versions also participate in persist/GC. */
    historySourceSnapshot(): HistorySource {
      return { ...historySource, layers: cloneLayers(historySource.layers) };
    },
    /** Restores a process-owned handoff after document loading, not data from an imported paint file. */
    restoreHistorySource(source: HistorySource) {
      historySource = { ...source, layers: cloneLayers(source.layers) };
      nextHistoryId = Math.max(nextHistoryId, source.id) + 1;
      baseHistoryId = nextHistoryId;
      revision++;
    },
    /** Replaces resident snapshots with immutable disk references, including history. */
    persist(capture: (pixels: TileData) => TileData) {
      for (const layer of [...layers, ...historySource.layers])
        for (const [key, pixels] of layer.tiles) layer.tiles.set(key, capture(pixels));
      for (const entry of [...undo, ...redo])
        for (const tile of entry.tiles) {
          if (tile.before) tile.before = capture(tile.before);
          if (tile.after) tile.after = capture(tile.after);
        }
    },
    /** Current, undoable and selected-source versions that must survive storage garbage collection. */
    *snapshots(): Generator<TileData> {
      for (const layer of [...layers, ...historySource.layers]) yield* layer.tiles.values();
      for (const entry of [...undo, ...redo])
        for (const tile of entry.tiles) {
          if (tile.before) yield tile.before;
          if (tile.after) yield tile.after;
        }
    },
    get layers() {
      return layers;
    },
    /** Changes only when committed document metadata or pixels change; excludes active preview stamps. */
    get revision() {
      return revision;
    },
    get active() {
      return layers.find((layer) => layer.id === active)!;
    },
    get historyBytes() {
      return historyBytes;
    },
    /** Returns a lightweight snapshot for the UI; never sends pixels over this interface. */
    state() {
      return {
        revision,
        historySource: { id: historySource.id, label: historySource.label },
        historyCurrentId: undo.at(-1)?.id ?? baseHistoryId,
        historyStates: [
          { id: baseHistoryId, label: baseHistoryId === 0 ? 'Opened document' : `State ${baseHistoryId}` },
          ...[...undo, ...[...redo].reverse()].map((entry) => ({ id: entry.id, label: `State ${entry.id}` }))
        ],
        layers: info(),
        activeId: active,
        canUndo: undo.length > 0,
        canRedo: redo.length > 0,
        pixelBytes: layers.reduce((n, l) => n + [...l.tiles.values()].reduce((sum, p) => sum + p.byteLength, 0), 0),
        tileCount: layers.reduce((n, l) => n + l.tiles.size, 0)
      };
    },
    /** Commits pixels and an optional new layer above the active layer as one atomic history entry. */
    commit(tiles: TileChange[], addedLayer?: LayerInfo) {
      if (!tiles.length) return;
      if (addedLayer && (layers.length >= 128 || layers.some((layer) => layer.id === addedLayer.id)))
        throw new Error('Cannot add this layer. A drawing can contain at most 128 unique layers.');
      tiles = tiles.map((tile) => ({
        ...tile,
        after: tile.after instanceof Uint8Array ? packTile(tile.after) : tile.after
      }));
      const current = {
        pixelBytes: layers.reduce(
          (n, layer) => n + [...layer.tiles.values()].reduce((sum, p) => sum + p.byteLength, 0),
          0
        ),
        tileCount: layers.reduce((n, layer) => n + layer.tiles.size, 0)
      };
      const bytes =
        current.pixelBytes +
        tiles.reduce((n, tile) => n + (tile.after?.byteLength ?? 0) - (tile.before?.byteLength ?? 0), 0);
      const count =
        current.tileCount +
        tiles.reduce((n, tile) => n + Number(Boolean(tile.after)) - Number(Boolean(tile.before)), 0);
      if ((!options.paged && bytes > MAX_DOCUMENT_BYTES) || count > MAX_DOCUMENT_TILES)
        throw new Error(
          'The drawing reached its storage budget. The last stroke was not added. Save your drawing before freeing space.'
        );
      const entry: Omit<HistoryEntry, 'id'> = {
        before: info(),
        after: info(),
        activeBefore: active,
        activeAfter: active,
        tiles,
        bytes: tileBytes(tiles)
      };
      if (addedLayer) {
        entry.after.splice(layers.findIndex((layer) => layer.id === active) + 1, 0, addedLayer);
        entry.activeAfter = addedLayer.id;
      }
      apply({ ...entry, id: nextHistoryId + 1 }, 'after');
      record(entry);
    },
    /** Changes layer properties/order in a single undoable action. Selection itself is not history. */
    changeLayer(action: LayerAction) {
      if (action.type === 'select') {
        if (layers.some((l) => l.id === action.id)) {
          active = action.id;
          revision++;
        }
        return;
      }
      const before = info(),
        activeBefore = active;
      const tiles: TileChange[] = [];
      switch (action.type) {
        case 'add': {
          if (layers.length >= 128) throw new Error('A drawing can contain at most 128 layers.');
          const layer = newLayer(crypto.randomUUID(), `Layer ${layers.length + 1}`);
          layers.push(layer);
          active = layer.id;
          break;
        }
        case 'update': {
          const layer = layers.find((l) => l.id === action.id);
          if (layer) Object.assign(layer, action.patch);
          break;
        }
        case 'merge-down':
          throw new Error('Merge layers through the runtime, which reads their pixels.');
        case 'duplicate': {
          const index = layers.findIndex((l) => l.id === action.id);
          if (index < 0) return;
          if (layers.length >= 128) throw new Error('A drawing can contain at most 128 layers.');
          const source = layers[index]!;
          const tileCount = layers.reduce((n, layer) => n + layer.tiles.size, 0) + source.tiles.size;
          const pixelBytes = layers.reduce(
            (n, layer) => n + [...layer.tiles.values()].reduce((sum, p) => sum + p.byteLength, 0),
            0
          );
          const sourceBytes = [...source.tiles.values()].reduce((sum, p) => sum + p.byteLength, 0);
          if ((!options.paged && pixelBytes + sourceBytes > MAX_DOCUMENT_BYTES) || tileCount > MAX_DOCUMENT_TILES)
            throw new Error('The drawing reached its storage budget. The layer was not duplicated.');
          // Tile versions are immutable, so the copy shares them until either layer is painted.
          const layer: Layer = {
            ...source,
            id: crypto.randomUUID(),
            name: `${source.name} copy`,
            tiles: new Map(source.tiles)
          };
          for (const [key, after] of layer.tiles) tiles.push({ layerId: layer.id, key, before: undefined, after });
          layers.splice(index + 1, 0, layer);
          active = layer.id;
          break;
        }
        case 'move': {
          const index = layers.findIndex((l) => l.id === action.id);
          const next = index + action.direction;
          if (index >= 0 && next >= 0 && next < layers.length) {
            const [layer] = layers.splice(index, 1);
            layers.splice(next, 0, layer!);
          }
          break;
        }
        case 'reorder': {
          const index = layers.findIndex((l) => l.id === action.id);
          if (index < 0 || index === action.index || !Number.isInteger(action.index)) return;
          if (action.index < 0 || action.index >= layers.length) return;
          const [layer] = layers.splice(index, 1);
          layers.splice(action.index, 0, layer!);
          break;
        }
        case 'delete': {
          if (layers.length <= 1) return;
          const layer = layers.find((l) => l.id === action.id);
          if (!layer) return;
          for (const [key, before] of layer.tiles) tiles.push({ layerId: layer.id, key, before, after: undefined });
          layers = layers.filter((l) => l.id !== action.id);
          if (active === action.id) active = layers.at(-1)!.id;
          break;
        }
      }
      record({ before, after: info(), activeBefore, activeAfter: active, tiles, bytes: tileBytes(tiles) });
    },
    /**
     * Merges the layer `upperId` into the layer below it as one undoable change. `merged` holds the lower layer's new
     * pixels for every tile the upper layer covers (`mergeTilePixels`; `undefined` removes the tile). The lower layer
     * keeps its name, visibility, opacity and blend mode, and becomes active. Throws for the bottom layer.
     */
    mergeDown(upperId: string, merged: ReadonlyMap<string, Uint8Array | undefined>) {
      const index = layers.findIndex((layer) => layer.id === upperId);
      if (index <= 0) throw new Error('There is no layer below to merge into.');
      const upper = layers[index]!,
        lower = layers[index - 1]!;
      const before = info(),
        activeBefore = active;
      const tiles: TileChange[] = [];
      for (const [key, pixels] of merged) {
        tiles.push({ layerId: lower.id, key, before: lower.tiles.get(key), after: pixels && packTile(pixels) });
      }

      for (const [key, pixels] of upper.tiles) tiles.push({ layerId: upper.id, key, before: pixels, after: undefined });
      for (const change of tiles) {
        if (change.layerId !== lower.id) continue;
        if (change.after) lower.tiles.set(change.key, change.after);
        else lower.tiles.delete(change.key);
      }

      layers = layers.filter((layer) => layer.id !== upperId);
      active = lower.id;
      record({ before, after: info(), activeBefore, activeAfter: active, tiles, bytes: tileBytes(tiles) });
    },
    /** Restores exact snapshots, avoiding nondeterministic GPU replay during undo.
     * Returns the replaced tiles so pixel caches can reload only those, or undefined when nothing was undone.
     */
    undo(): readonly TileChange[] | undefined {
      const entry = undo.pop();
      if (entry) {
        apply(entry, 'before');
        redo.push(entry);
        revision++;
      }

      return entry?.tiles;
    },
    /** Reapplies the same snapshots that were originally committed; returns them like {@link undo}. */
    redo(): readonly TileChange[] | undefined {
      const entry = redo.pop();
      if (entry) {
        apply(entry, 'after');
        undo.push(entry);
        revision++;
      }

      return entry?.tiles;
    },
    /** Replaces a document after validation, clearing its session-only undo history. */
    replace(next: Layer[], selected: string) {
      layers = next;
      active = selected;
      undo.length = redo.length = 0;
      historyBytes = 0;
      nextHistoryId = baseHistoryId = 0;
      historySource = { id: 0, label: 'Opened document', layers: cloneLayers(layers) };
      revision++;
    }
  };
}

/** Layer commands shared by UI and worker. Layer order runs from bottom to top. */
export type LayerAction =
  /**
   * `duplicate` inserts a copy above the layer, with the same pixels and properties, and selects it. `merge-down`
   * needs the layers' pixels, so the runtime computes it and applies it with `mergeDown`; `changeLayer` rejects it.
   */
  | { type: 'select' | 'delete' | 'duplicate' | 'merge-down'; id: string }
  | { type: 'add' }
  | { type: 'move'; id: string; direction: -1 | 1 }
  /** Moves the layer to position `index`, bottom first, shifting the layers in between; out-of-range is ignored. */
  | { type: 'reorder'; id: string; index: number }
  | {
      type: 'update';
      id: string;
      patch: Partial<Pick<LayerInfo, 'name' | 'visible' | 'opacity' | 'blend' | 'alphaLock' | 'clipping'>>;
    };

function newLayer(id: string, name: string): Layer {
  return { id, name, visible: true, opacity: 1, blend: 'linear', tiles: new Map() };
}
function tileBytes(changes: TileChange[]): number {
  return changes.reduce((n, c) => n + (c.before?.byteLength ?? 0) + (c.after?.byteLength ?? 0), 0);
}
const HISTORY_BYTES = 64 * 1024 * 1024;
/** Budget counts stored tile bytes, not the empty area covered by a sparse stroke. */
export const MAX_DOCUMENT_BYTES = 256 * 1024 * 1024;
/** Separate metadata bound; spatial coordinates remain unrestricted. */
export const MAX_DOCUMENT_TILES = 65_536;

/** Session-only history source. Maps share immutable tile versions; they never alias live layer maps. */
export type HistorySource = { id: number; label: string; layers: Layer[] };

function cloneLayers(layers: readonly Layer[]): Layer[] {
  return layers.map((layer) => ({ ...layer, tiles: new Map(layer.tiles) }));
}

/** Applies one retained history delta to private snapshot maps, including deleted/recreated layers. */
function projectHistory(layers: Layer[], entry: HistoryEntry, direction: 'before' | 'after'): Layer[] {
  const old = new Map(layers.map((layer) => [layer.id, layer]));
  const next = entry[direction].map((info) => ({
    ...info,
    tiles: old.get(info.id)?.tiles ?? new Map<string, TileData>()
  }));
  for (const change of entry.tiles) {
    const layer = next.find((layer) => layer.id === change.layerId);
    const pixels = change[direction];
    if (pixels) layer?.tiles.set(change.key, pixels);
    else layer?.tiles.delete(change.key);
  }
  return next;
}
