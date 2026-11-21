import type { PsdNewDocumentContext } from '@app-game/psd';
import {
  editLayerTree,
  MAX_FOLDERS,
  orderLayerTree,
  shownLayers,
  siblingBelow,
  subtreeIds,
  withParent,
  type LayerPlace,
  type ShownLayer
} from './layerTree';
import { packTile, type TileData } from './tilePixels';
export { TILE_BYTES } from './tilePixels';

/** A raster layer. Immutable tiles store raw or losslessly packed premultiplied sRGB RGBA8. */
export type Layer = {
  /** Marks a raster layer where saved nodes need it; the document's own rasters leave it out. */
  kind?: 'raster';
  id: string;
  /** The folder the layer is in; absent at the root. See `layerTree`. */
  parentId?: string;
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
/**
 * Separable color blend modes; alpha always follows source-over. Whether they blend encoded sRGB or linear light is
 * the document's `linearBlending`.
 */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';
/**
 * A folder of the layer tree. It owns no pixels, and hiding it hides everything inside it. A new folder is Pass
 * Through at full strength: it shows its layers as they are, so wrapping layers in a visible folder changes nothing
 * on the canvas. With another blend mode it composites isolated: its layers are composited together on their own,
 * then the result is blended into what is below once, with the folder's blend mode and opacity. Pass Through below
 * full opacity fades: its layers composite onto what is below as they are, and the folder's opacity interpolates
 * between what was below and that result (see `groupMode`). A folder can be the clipping base of the clipped layers
 * right above it (see `clipBases`); it cannot be clipped itself, so `clipping` is always absent.
 */
export type LayerGroup = {
  kind: 'group';
  id: string;
  /** The folder the folder is in; absent at the root. */
  parentId?: string;
  name: string;
  /** Hides the folder and everything inside it, whatever their own visibility. */
  visible: boolean;
  /** From 0 to 1; see {@link LayerGroup} for how it applies in each mode. */
  opacity: number;
  blend: GroupBlendMode;
  /** Always absent: a folder cannot be clipped. */
  clipping?: boolean;
};
/** How a folder blends: Pass Through, or one of the raster blend modes, which isolates it; see {@link LayerGroup}. */
export type GroupBlendMode = 'pass-through' | BlendMode;
/** A node of the layer tree: a raster layer or a folder. */
export type DocumentNode = Layer | LayerGroup;
/** The serializable user-visible properties of a raster layer. */
export type RasterInfo = Omit<Layer, 'tiles'>;
/** The serializable user-visible properties of a node: a raster layer's or a folder's. */
export type LayerInfo = RasterInfo | LayerGroup;
/** Before/after tile snapshots for one user action. Undefined means the tile did not exist. */
export type TileChange = {
  layerId: string;
  key: string;
  before: TileData | undefined;
  after: TileData | undefined;
};
/** One undoable step as edits read it; see `undoSteps` of {@link createDocument}. */
export type HistoryStep = { readonly id: number; readonly changes: readonly Readonly<TileChange>[] };
type HistoryEntry = {
  id: number;
  before: LayerInfo[];
  after: LayerInfo[];
  activeBefore: string;
  activeAfter: string;
  tiles: TileChange[];
  bytes: number;
};

/** Creation identity and allocated layer IDs retained in Paint checkpoints and portable drawings. */
export type PsdDocumentIdentity = {
  /** Original Paint creation facts; opening a legacy/imported drawing starts a new Paint identity. */
  creation: PsdNewDocumentContext['creation'];
  /** Monotonic allocation prevents reusing deleted layer IDs. */
  nextLayerId: number;
  /** Includes deleted layers so undo can reuse their identities. Times are Unix seconds. */
  layers: Record<string, { id: number; time: number }>;
};

/**
 * Owns the layer tree and bounded tile-snapshot history. GPU resources are disposable caches of these pixels.
 *
 * The tree is one list of nodes, raster layers and folders, in canonical order (see `layerTree`). Every command that
 * changes it, or a node's properties, is one undo step that records the whole list before and after; history replays
 * those lists, so undoing restores structure and pixels together.
 */
export function createDocument(options: { paged?: boolean } = {}) {
  let nodes: DocumentNode[] = [newLayer('layer-1', 'Layer 1')];
  let active = 'layer-1';
  let psdIdentity = newPsdIdentity();
  /** Layers blend in linear light ("Smooth color") rather than in encoded sRGB, for every blend mode. */
  let linearBlending = true;
  let revision = 0;
  let nextHistoryId = 0,
    baseHistoryId = 0;
  let historySource: HistorySource = { id: 0, label: 'Opened document', layers: cloneLayers(rasters(nodes)) };
  const undo: HistoryEntry[] = [],
    redo: HistoryEntry[] = [];
  let historyBytes = 0;
  /** `shownLayers` of `nodes`, made again whenever a change replaces `nodes`. */
  let shown = { nodes, layers: shownLayers(nodes) };
  const shownNow = () => {
    if (shown.nodes !== nodes) {
      shown = { nodes, layers: shownLayers(nodes) };
    }

    return shown.layers;
  };
  const info = (): LayerInfo[] => nodes.map(nodeInfo);
  const apply = (entry: HistoryEntry, direction: 'before' | 'after') => {
    nodes = withTiles(entry[direction], nodes);
    const byId = new Map(rasters(nodes).map((layer) => [layer.id, layer]));
    for (const change of entry.tiles) {
      const layer = byId.get(change.layerId);
      const pixels = change[direction];
      if (pixels) layer?.tiles.set(change.key, pixels);
      else layer?.tiles.delete(change.key);
    }
    active = direction === 'before' ? entry.activeBefore : entry.activeAfter;
    touchPsdLayers(psdIdentity, entry);
  };
  const record = (value: Omit<HistoryEntry, 'id'>) => {
    touchPsdLayers(psdIdentity, value);
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
  const node = (id: string) => nodes.find((candidate) => candidate.id === id);
  const activeLayer = () => shownNow().find((layer) => layer.id === active);
  /** The topmost raster layer, which becomes active when the active node goes. */
  const topLayer = () => rasters(nodes).at(-1)!.id;
  const pixelBytes = () =>
    rasters(nodes).reduce((n, l) => n + [...l.tiles.values()].reduce((sum, p) => sum + p.byteLength, 0), 0);
  const tileCount = () => rasters(nodes).reduce((n, layer) => n + layer.tiles.size, 0);
  return {
    /** Selects a retained history state without changing current pixels or undo/redo position.
     * Selected immutable versions stay pinned even if their undo entry is pruned or branched away.
     */
    selectHistorySource(id: number) {
      if (id === historySource.id) return;
      const states = [baseHistoryId, ...undo.map((entry) => entry.id), ...[...redo].reverse().map((entry) => entry.id)];
      const target = states.indexOf(id);
      if (target < 0) throw new Error('This history state is no longer available.');
      let snapshot = cloneLayers(historyLayers(nodes));
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
      for (const layer of [...rasters(nodes), ...historySource.layers])
        for (const [key, pixels] of layer.tiles) layer.tiles.set(key, capture(pixels));
      for (const entry of [...undo, ...redo])
        for (const tile of entry.tiles) {
          if (tile.before) tile.before = capture(tile.before);
          if (tile.after) tile.after = capture(tile.after);
        }
    },
    /** Current, undoable and selected-source versions that must survive storage garbage collection. */
    *snapshots(): Generator<TileData> {
      for (const layer of [...rasters(nodes), ...historySource.layers]) yield* layer.tiles.values();
      for (const entry of [...undo, ...redo])
        for (const tile of entry.tiles) {
          if (tile.before) yield tile.before;
          if (tile.after) yield tile.after;
        }
    },
    /**
     * The layer tree: raster layers and folders in canonical order (see `layerTree`), each with its own properties.
     * Read-only; change it through `changeLayer`, `commit` and `mergeDown`.
     */
    get nodes(): readonly DocumentNode[] {
      return nodes;
    },
    /**
     * The raster layers bottom to top, in compositing order, as they show on the canvas (see `shownLayers`): a layer
     * inside a hidden folder reads as hidden, a clipped one without a clipping base among its siblings as unclipped,
     * and each names the folders around it that composite on their own. What renders, exports and samples the drawing
     * reads; a layer's own properties are in `nodes`. Without folders, the same objects as `nodes`.
     */
    get layers(): ShownLayer[] {
      return shownNow() as ShownLayer[];
    },
    /** Changes only when committed document metadata or pixels change; excludes active preview stamps. */
    get revision() {
      return revision;
    },
    /** Id of the active node: the raster layer strokes paint on, or a folder, which nothing paints on. */
    get activeId() {
      return active;
    },
    /** The active node, raster layer or folder, with its own properties. */
    get activeNode(): DocumentNode {
      return node(active)!;
    },
    /** The active raster layer as it shows (see `layers`), or undefined while a folder is active. */
    get activeLayer(): Layer | undefined {
      return activeLayer();
    },
    /**
     * The active raster layer as it shows (see `layers`). Throws while a folder is active: code that may run then
     * reads `activeLayer`.
     */
    get active(): Layer {
      const layer = activeLayer();
      if (!layer) throw new Error('A folder is selected; select a layer to paint on.');
      return layer;
    },
    /** Node `id` with its own properties, if the drawing has it. */
    node,
    get historyBytes() {
      return historyBytes;
    },
    /** Returns a lightweight snapshot for the UI; never sends pixels over this interface. */
    state() {
      const layer = activeLayer();
      return {
        revision,
        historySource: { id: historySource.id, label: historySource.label },
        historyCurrentId: undo.at(-1)?.id ?? baseHistoryId,
        historyStates: [
          { id: baseHistoryId, label: baseHistoryId === 0 ? 'Opened document' : `State ${baseHistoryId}` },
          ...[...undo, ...[...redo].reverse()].map((entry) => ({ id: entry.id, label: `State ${entry.id}` }))
        ],
        /**
         * The raster layers bottom to top, in compositing order, each with its own properties, `parentId` naming its
         * folder; `tileCount` is the number of tiles holding paint, 0 for an empty layer. Folders are in `nodes`.
         */
        layers: rasters(nodes).map(({ tiles, ...layer }) => ({ ...layer, tileCount: tiles.size })),
        /** The layer tree in canonical order (see `layerTree`): raster layers and folders, told apart by `kind`. */
        nodes: nodes.map(nodeState),
        /** The active node: a raster layer, or a folder, which strokes and pixel edits cannot change. */
        activeId: active,
        /**
         * Whether strokes and pixel edits can change the active node: it is a raster layer that shows, itself and
         * every folder it is in visible. Strokes on anything else are ignored, and pixel edits refused.
         */
        activePaintable: !!layer?.visible,
        /** Layers blend in linear light ("Smooth color") rather than in encoded sRGB; see `setLinearBlending`. */
        linearBlending,
        canUndo: undo.length > 0,
        canRedo: redo.length > 0,
        pixelBytes: pixelBytes(),
        tileCount: tileCount()
      };
    },
    /**
     * Commits pixels and an optional new raster layer, which goes right above the active node in the same folder, as
     * one atomic history entry.
     */
    commit(tiles: TileChange[], addedLayer?: RasterInfo) {
      if (!tiles.length) return;
      if (addedLayer && (rasters(nodes).length >= MAX_LAYERS || node(addedLayer.id)))
        throw new Error('Cannot add this layer. A drawing can contain at most 128 unique layers.');
      tiles = tiles.map((tile) => ({
        ...tile,
        after: tile.after instanceof Uint8Array ? packTile(tile.after) : tile.after
      }));
      const bytes =
        pixelBytes() + tiles.reduce((n, tile) => n + (tile.after?.byteLength ?? 0) - (tile.before?.byteLength ?? 0), 0);
      const count =
        tileCount() + tiles.reduce((n, tile) => n + Number(Boolean(tile.after)) - Number(Boolean(tile.before)), 0);
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
        const anchor = node(active)!;
        const tree = editLayerTree(entry.after);
        tree.insert(addedLayer, { parentId: anchor.parentId ?? null, anchorId: anchor.id, side: 'above' });
        entry.after = tree.result();
        entry.activeAfter = addedLayer.id;
      }
      apply({ ...entry, id: nextHistoryId + 1 }, 'after');
      record(entry);
    },
    /**
     * Changes the layer tree or a node's properties as a single undoable action; see {@link LayerAction}. Validates
     * before changing anything: a command that cannot apply throws, or does nothing where `LayerAction` says so, and
     * then records no undo step. Selection itself is not history.
     */
    changeLayer(action: LayerAction) {
      if (action.type === 'select') {
        if (node(action.id)) {
          active = action.id;
          revision++;
        }
        return;
      }
      const before = info(),
        activeBefore = active;
      const tiles: TileChange[] = [];
      let next: DocumentNode[] = nodes;
      switch (action.type) {
        case 'add':
        case 'add-group': {
          const created =
            action.type === 'add'
              ? newLayer(crypto.randomUUID(), `Layer ${rasters(nodes).length + 1}`)
              : newGroup(crypto.randomUUID(), `Group ${folders(nodes).length + 1}`);
          checkCapacity(nodes, created.kind === 'group' ? 0 : 1, created.kind === 'group' ? 1 : 0);
          const tree = editLayerTree(nodes);
          tree.insert(created, action.place ?? { parentId: null, side: 'above' });
          next = tree.result();
          active = created.id;
          break;
        }
        case 'update': {
          const current = node(action.id);
          if (!current) return;
          checkPatch(current, action.patch);
          next = nodes.map((node) => (node.id === action.id ? ({ ...node, ...action.patch } as DocumentNode) : node));
          break;
        }
        case 'merge-down':
          throw new Error('Merge layers through the runtime, which reads their pixels.');
        case 'duplicate': {
          const ids = subtreeIds(nodes, action.id);
          if (!ids.length) return;
          const copied = ids.map((id) => node(id)!);
          checkCapacity(nodes, rasters(copied).length, folders(copied).length);
          const copiedTiles = rasters(copied).reduce((n, layer) => n + layer.tiles.size, 0);
          const copiedBytes = rasters(copied).reduce(
            (n, layer) => n + [...layer.tiles.values()].reduce((sum, p) => sum + p.byteLength, 0),
            0
          );
          if (
            (!options.paged && pixelBytes() + copiedBytes > MAX_DOCUMENT_BYTES) ||
            tileCount() + copiedTiles > MAX_DOCUMENT_TILES
          )
            throw new Error('The drawing reached its storage budget. The layer was not duplicated.');
          const fresh = new Map(ids.map((id) => [id, crypto.randomUUID()]));
          // Tile versions are immutable, so the copies share them until either layer is painted.
          const copies = copied.map((source): DocumentNode => {
            const top = source.id === action.id;
            const placed = withParent(
              { ...source, id: fresh.get(source.id)!, name: top ? `${source.name} copy` : source.name },
              top ? source.parentId : fresh.get(source.parentId!)
            );
            return placed.kind === 'group' ? placed : { ...placed, tiles: new Map(placed.tiles) };
          });
          for (const layer of rasters(copies))
            for (const [key, after] of layer.tiles) tiles.push({ layerId: layer.id, key, before: undefined, after });
          // Right after the source's subtree, which ends with the source, the copy is its sibling right above it.
          const end = nodes.findIndex((node) => node.id === action.id) + 1;
          next = [...nodes.slice(0, end), ...copies, ...nodes.slice(end)];
          active = fresh.get(action.id)!;
          break;
        }
        case 'move': {
          const current = node(action.id);
          if (!current) return;
          const tree = editLayerTree(nodes);
          const parentId = current.parentId ?? null;
          const siblings = tree.children(parentId);
          const anchorId = siblings[siblings.indexOf(action.id) + action.direction];
          if (anchorId === undefined) return;
          tree.move(action.id, { parentId, anchorId, side: action.direction > 0 ? 'above' : 'below' });
          next = tree.result();
          break;
        }
        case 'reorder': {
          const current = node(action.id);
          if (!current || !Number.isInteger(action.index)) return;
          const tree = editLayerTree(nodes);
          const parentId = current.parentId ?? null;
          const siblings = tree.children(parentId);
          const index = siblings.indexOf(action.id);
          if (index === action.index || action.index < 0 || action.index >= siblings.length) return;
          // Past its old place, the layer lands above the sibling now at `index`; otherwise below it.
          const anchorId = siblings[action.index]!;
          tree.move(action.id, { parentId, anchorId, side: action.index > index ? 'above' : 'below' });
          next = tree.result();
          break;
        }
        case 'relocate': {
          const current = node(action.id);
          if (!current) return;
          if (action.clipping !== undefined) checkPatch(current, { clipping: action.clipping });
          const tree = editLayerTree(nodes);
          tree.move(action.id, { parentId: action.parentId, anchorId: action.anchorId, side: action.side });
          next = tree.result();
          if (action.clipping !== undefined && !!current.clipping !== action.clipping) {
            next = next.map((node) =>
              node.id === action.id ? ({ ...node, clipping: action.clipping } as DocumentNode) : node
            );
          }
          break;
        }
        case 'group': {
          const members = outermost(nodes, action.ids);
          if (!members.length) return;
          checkCapacity(nodes, 0, 1);
          const top = node(members.at(-1)!)!;
          const group = newGroup(crypto.randomUUID(), `Group ${folders(nodes).length + 1}`);
          const tree = editLayerTree(nodes);
          tree.insert(group, { parentId: top.parentId ?? null, anchorId: top.id, side: 'above' });
          // Bottom first, each member goes on top of the ones before it, keeping their order.
          for (const id of members) tree.move(id, { parentId: group.id, side: 'above' });
          next = tree.result();
          active = group.id;
          break;
        }
        case 'ungroup': {
          const group = node(action.id);
          if (group?.kind !== 'group') return;
          const tree = editLayerTree(nodes);
          const children = [...tree.children(group.id)];
          // Bottom first, each child goes right below the folder, so they keep their order in its place.
          for (const id of children)
            tree.move(id, { parentId: group.parentId ?? null, anchorId: group.id, side: 'below' });
          tree.remove(group.id);
          next = tree.result();
          if (active === group.id) active = children.at(-1) ?? '';
          break;
        }
        case 'delete': {
          const roots = outermost(nodes, 'ids' in action ? action.ids : [action.id]);
          const removed = new Set(roots.flatMap((id) => subtreeIds(nodes, id)));
          next = nodes.filter((node) => !removed.has(node.id));
          // A drawing keeps at least one raster layer.
          if (!removed.size || !rasters(next).length) return;
          for (const layer of rasters(nodes.filter((node) => removed.has(node.id))))
            for (const [key, before] of layer.tiles) tiles.push({ layerId: layer.id, key, before, after: undefined });
          break;
        }
      }
      if (next === nodes || sameNodes(next, nodes)) return;
      nodes = next;
      if (!node(active)) active = topLayer();
      record({ before, after: info(), activeBefore, activeAfter: active, tiles, bytes: tileBytes(tiles) });
    },
    /**
     * Merges the raster layer `upperId` into the raster layer right below it in the same folder as one undoable
     * change. `merged` holds the lower layer's new pixels for every tile the upper layer covers (`mergeTilePixels`;
     * `undefined` removes the tile). The lower layer keeps its name, visibility, opacity and blend mode, and becomes
     * active. Throws when no raster sibling is right below, as for the bottom layer of a folder or a folder below.
     */
    mergeDown(upperId: string, merged: ReadonlyMap<string, Uint8Array | undefined>) {
      const upper = node(upperId),
        lower = siblingBelow(nodes, upperId);
      if (!upper || upper.kind === 'group' || !lower || lower.kind === 'group')
        throw new Error('There is no layer below to merge into.');
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

      nodes = nodes.filter((node) => node.id !== upperId);
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
    /**
     * Reverts the latest history entry and removes it, without a redo step, so that a following `commit` replaces it:
     * an edit in progress, such as a transform, updates its single undo step this way. Returns the reverted tile
     * changes, which the renderer must reload. Throws, changing nothing, when `id` is not the latest entry.
     */
    revertLatest(id: number): readonly TileChange[] {
      const entry = undo.at(-1);
      if (!entry || entry.id !== id) throw new Error('The drawing changed while this edit was in progress.');
      undo.pop();
      historyBytes -= entry.bytes;
      apply(entry, 'before');
      revision++;
      return entry.tiles;
    },
    /** Id of the latest undoable entry, or `undefined` when there is none. */
    get latestHistoryId(): number | undefined {
      return undo.at(-1)?.id;
    },
    /**
     * The undoable steps, newest first, as read-only views of their tile changes; redo steps are not included. A step
     * that changed only layer properties or order has no changes. Tile data may be paged out: read it through storage.
     */
    undoSteps(): readonly HistoryStep[] {
      return undo.map((entry) => ({ id: entry.id, changes: entry.tiles })).reverse();
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
    /**
     * Copies creation facts and stable layer identities in the document model. Each export adds only current save
     * facts; the flat initializer does not accumulate earlier PSD saved events. Legacy imports get a new identity.
     */
    psdIdentity(): PsdDocumentIdentity {
      for (const layer of rasters(nodes)) {
        if (!Object.hasOwn(psdIdentity.layers, layer.id)) {
          Object.defineProperty(psdIdentity.layers, layer.id, {
            value: { id: psdIdentity.nextLayerId++, time: Date.parse(psdIdentity.creation.when) / 1000 },
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }

      return structuredClone(psdIdentity);
    },
    /** Whether layers blend in linear light ("Smooth color") rather than in encoded sRGB, for every blend mode. */
    linearBlending: () => linearBlending,
    /**
     * Makes every layer blend in linear light, as Photoshop's "Blend RGB colors using gamma 1.0", or in encoded sRGB.
     * A setting of the document, saved with it, outside the undo history.
     */
    setLinearBlending(linear: boolean) {
      if (linear !== linearBlending) {
        linearBlending = linear;
        revision++;
      }
    },
    /**
     * Replaces the drawing with `next`, a validated one whose node `selected` becomes active, and clears undo history.
     * Missing identity starts new Paint creation facts. Throws, changing nothing, for a tree `orderLayerTree` refuses,
     * one without a raster layer, or a `selected` it does not have; puts the nodes in canonical order.
     */
    replace(next: readonly DocumentNode[], selected: string, linear = true, identity?: PsdDocumentIdentity) {
      const ordered = orderLayerTree(next);
      if (!rasters(ordered).length || !ordered.some((node) => node.id === selected)) {
        throw new Error('Invalid layer identifiers.');
      }

      nodes = ordered;
      psdIdentity = identity ? structuredClone(identity) : newPsdIdentity();
      active = selected;
      linearBlending = linear;
      undo.length = redo.length = 0;
      historyBytes = 0;
      nextHistoryId = baseHistoryId = 0;
      historySource = { id: 0, label: 'Opened document', layers: cloneLayers(rasters(nodes)) };
      revision++;
    },
    /**
     * The session's undo history and Erase to History source, for a document that continues this session elsewhere,
     * such as Paint in a new tab; see `restoreHistory`. Call `persist` first, so that it refers to stored tile versions
     * rather than pixels. Structured-cloneable; shares the immutable tile versions.
     */
    history(): DocumentHistory {
      const copy = (entry: HistoryEntry) => ({ ...entry, tiles: entry.tiles.map((tile) => ({ ...tile })) });
      return {
        undo: undo.map(copy),
        redo: redo.map(copy),
        nextId: nextHistoryId,
        baseId: baseHistoryId,
        bytes: historyBytes,
        source: { ...historySource, layers: cloneLayers(historySource.layers) }
      };
    },
    /**
     * Continues the session `history` came from, on the document it ended with, as loaded after `replace`. Throws,
     * changing nothing, when the current layers are not the ones its latest step ended with.
     */
    restoreHistory(next: DocumentHistory) {
      const latest = next.undo.at(-1);
      const ids = (infos: readonly { id: string }[]) => infos.map((layer) => layer.id).join('\n');
      if (latest && (ids(latest.after) !== ids(nodes) || latest.activeAfter !== active)) {
        throw new Error('This history belongs to another drawing.');
      }

      undo.splice(0, undo.length, ...next.undo);
      redo.splice(0, redo.length, ...next.redo);
      nextHistoryId = next.nextId;
      baseHistoryId = next.baseId;
      historyBytes = next.bytes;
      historySource = { ...next.source, layers: cloneLayers(next.source.layers) };
      revision++;
    }
  };
}

/** Undo history handed from one document to the next of the same session; see `history` of {@link createDocument}. */
export type DocumentHistory = {
  /** Undoable steps, oldest first. */
  undo: HistoryEntry[];
  /** Redoable steps, the next one to redo last. */
  redo: HistoryEntry[];
  /** Id of the latest step recorded; the next one gets a higher id. */
  nextId: number;
  /** Id of the state before the oldest undoable step. */
  baseId: number;
  /** Tile bytes the steps hold, counted against the history budget. */
  bytes: number;
  source: HistorySource;
};

/**
 * Layer commands shared by UI and worker; each one that changes the drawing is one undo step. Siblings run from bottom
 * to top; a node is a raster layer or a folder, and a command on a folder takes everything inside it along.
 */
export type LayerAction =
  /**
   * `select` makes a node active, a folder too. `delete` removes the node and everything inside it, unless that would
   * leave no raster layer, when it does nothing. `duplicate` inserts a copy right above the node, with the same pixels
   * and properties (a folder's copy holds copies of its contents), and selects it. `ungroup` puts a folder's contents
   * in its place, in their order, and removes it. `merge-down` needs the layers' pixels, so the runtime computes it
   * and applies it with `mergeDown`; `changeLayer` rejects it.
   */
  | { type: 'select' | 'delete' | 'duplicate' | 'merge-down' | 'ungroup'; id: string }
  /** Deletes several nodes and everything inside them at once; ids inside other deleted folders are skipped. */
  | { type: 'delete'; ids: readonly string[] }
  /**
   * Adds an empty raster layer (`add`) or folder (`add-group`) at `place`, the top of the root without one, and
   * selects it; for example, right above the active node in its folder.
   */
  | { type: 'add' | 'add-group'; place?: LayerPlace }
  /**
   * Puts nodes `ids` into a new folder, in their order on the canvas, and selects it. The folder takes the place of
   * the topmost of them; ids inside other grouped folders are skipped, and unknown ones ignored. The folder is Pass
   * Through at full strength, so grouping siblings that are next to each other changes nothing on the canvas, apart
   * from clipping, which is resolved among siblings (see `clipBases`).
   */
  | { type: 'group'; ids: readonly string[] }
  /**
   * Moves node `id`, and everything inside a folder, to a `LayerPlace`: into a folder, out of it or across folders.
   * With `clipping`, a raster layer is also clipped to whatever ends up right below it, or unclipped, in the same undo
   * step: a drop "onto" a layer or folder. Throws for a folder that does not exist, an anchor that is not in it, a
   * folder moved into itself, or `clipping` on a folder.
   */
  | ({ type: 'relocate'; id: string; clipping?: boolean } & LayerPlace)
  /** Swaps the node with the sibling above (1) or below (-1) it; nothing happens at the end of its folder. */
  | { type: 'move'; id: string; direction: -1 | 1 }
  /**
   * Moves the node to position `index` among its siblings, bottom first, shifting the ones in between; out-of-range
   * is ignored. In a drawing without folders, the position in the layer stack.
   */
  | { type: 'reorder'; id: string; index: number }
  /**
   * Changes node properties. `opacity` runs from 0 to 1. A folder takes `name`, `visible`, `opacity` and a `blend`
   * that may be `pass-through`; it cannot be clipped or alpha-locked (see `LayerGroup`). A raster layer cannot be Pass
   * Through. A patch that breaks these rules throws.
   */
  | {
      type: 'update';
      id: string;
      patch: Partial<Pick<RasterInfo, 'name' | 'visible' | 'opacity' | 'alphaLock' | 'clipping'>> & {
        blend?: GroupBlendMode;
      };
    };

/** A drawing holds at most this many raster layers. */
export const MAX_LAYERS = 128;

function newLayer(id: string, name: string): Layer {
  return { id, name, visible: true, opacity: 1, blend: 'normal', tiles: new Map() };
}

function newGroup(id: string, name: string): LayerGroup {
  return { kind: 'group', id, name, visible: true, opacity: 1, blend: 'pass-through' };
}

/** The raster layers of `nodes`, in their order. */
function rasters<T extends { kind?: string }>(nodes: readonly T[]): Exclude<T, { kind: 'group' }>[] {
  return nodes.filter((node): node is Exclude<T, { kind: 'group' }> => node.kind !== 'group');
}

/** The folders of `nodes`, in their order. */
function folders<T extends { kind?: string }>(nodes: readonly T[]): Extract<T, { kind: 'group' }>[] {
  return nodes.filter((node): node is Extract<T, { kind: 'group' }> => node.kind === 'group');
}

/** A node's properties without its pixels. */
function nodeInfo(node: DocumentNode): LayerInfo {
  if (node.kind === 'group') {
    return { ...node };
  }

  const { tiles: _tiles, ...info } = node;
  return info;
}

/** A node as the UI state has it: a raster with its `kind` and the number of tiles it paints, or a folder. */
function nodeState(node: DocumentNode) {
  if (node.kind === 'group') {
    return { ...node };
  }

  const { tiles, ...layer } = node;
  return { ...layer, kind: 'raster' as const, tileCount: tiles.size };
}

/** Nodes for `infos`, each raster keeping the tiles map it has among `current`, or an empty one. */
function withTiles(infos: readonly LayerInfo[], current: readonly DocumentNode[]): DocumentNode[] {
  const tiles = new Map(rasters(current).map((layer) => [layer.id, layer.tiles]));
  return infos.map((info) =>
    info.kind === 'group' ? { ...info } : { ...info, tiles: tiles.get(info.id) ?? new Map<string, TileData>() }
  );
}

/** Whether two node lists have the same nodes, order and properties; tiles are not compared. */
function sameNodes(a: readonly DocumentNode[], b: readonly DocumentNode[]) {
  return (
    a.length === b.length &&
    a.every((node, index) => JSON.stringify(nodeInfo(node)) === JSON.stringify(nodeInfo(b[index]!)))
  );
}

/**
 * The ids among `ids` that the drawing has and that are not inside another of them, bottom first. In canonical order
 * subtrees do not interleave, so the order of the nodes themselves is their order on the canvas.
 */
function outermost(nodes: readonly DocumentNode[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const inside = (node: DocumentNode) => {
    for (let parent = node.parentId; parent !== undefined; parent = byId.get(parent)?.parentId) {
      if (wanted.has(parent)) {
        return true;
      }
    }

    return false;
  };
  return nodes.filter((node) => wanted.has(node.id) && !inside(node)).map((node) => node.id);
}

/** Throws when adding `layers` raster layers and `groups` folders would exceed the drawing's limits. */
function checkCapacity(nodes: readonly DocumentNode[], layers: number, groups: number) {
  if (layers && rasters(nodes).length + layers > MAX_LAYERS) {
    throw new Error(`A drawing can contain at most ${MAX_LAYERS} layers.`);
  }

  if (groups && folders(nodes).length + groups > MAX_FOLDERS) {
    throw new Error(`A drawing can contain at most ${MAX_FOLDERS} folders.`);
  }
}

/**
 * Throws for a patch node `node` cannot take: an opacity outside 0–1, Pass Through on a raster layer, or clipping or
 * alpha lock on a folder.
 */
function checkPatch(node: DocumentNode, patch: Extract<LayerAction, { type: 'update' }>['patch']) {
  if (patch.opacity !== undefined && !(patch.opacity >= 0 && patch.opacity <= 1)) {
    throw new Error('Opacity runs from 0 to 1.');
  }

  if (node.kind !== 'group') {
    if (patch.blend === 'pass-through') {
      throw new Error('Only a folder can be Pass Through.');
    }

    return;
  }

  if (patch.clipping || patch.alphaLock) {
    throw new Error('A folder cannot be clipped or alpha-locked: it has no pixels of its own.');
  }
}
/** Starts a Paint identity, independently of future save events and imported PSD provenance. */
function newPsdIdentity(): PsdDocumentIdentity {
  const uuid = crypto.randomUUID();
  return {
    creation: {
      originalDocumentId: `xmp.did:${uuid}`,
      instanceId: `xmp.iid:${uuid}`,
      when: new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00'),
      creatorTool: 'Paint'
    },
    nextLayerId: 2,
    layers: {}
  };
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

/**
 * Records actual edit clocks only for raster layers whose metadata or committed pixels changed, including undo/redo;
 * folders are not PSD layers of their own (see `writePsdFile`).
 */
function touchPsdLayers(identity: PsdDocumentIdentity, entry: Pick<HistoryEntry, 'before' | 'after' | 'tiles'>) {
  const changed = new Set(entry.tiles.map((tile) => tile.layerId));
  const before = new Map(entry.before.map((layer) => [layer.id, layer]));
  for (const layer of rasters(entry.after)) {
    if (JSON.stringify(before.get(layer.id)) !== JSON.stringify(layer)) {
      changed.add(layer.id);
    }
  }

  const time = Date.now() / 1000;
  for (const id of changed) {
    const allocated = Object.hasOwn(identity.layers, id) ? identity.layers[id]!.id : identity.nextLayerId++;
    Object.defineProperty(identity.layers, id, {
      value: { id: allocated, time },
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
}

/** The raster layers whose pixels the Erase to History source keeps: the drawing's own, with their own properties. */
function historyLayers(nodes: readonly DocumentNode[]): Layer[] {
  return rasters(nodes);
}

/**
 * Applies one retained history delta to private snapshot maps, including deleted/recreated layers. Keeps raster
 * layers only: the source is read for pixels, by layer id.
 */
function projectHistory(layers: Layer[], entry: HistoryEntry, direction: 'before' | 'after'): Layer[] {
  const old = new Map(layers.map((layer) => [layer.id, layer]));
  const next = rasters(entry[direction]).map((info) => ({
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
