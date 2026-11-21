import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { defaultCamera } from './camera';
import { createDocument, TILE_BYTES, type DocumentNode, type Layer } from './document';
import { MAX_FOLDER_DEPTH, MAX_FOLDERS } from './layerTree';
import { readPaintFile, writePaintFile } from './paintFile';
import { writePsdFile } from './psdFile';
import { createRegionHistory } from './regionHistory';
import { wholeSelection } from './selectionMask';
import { decodeDocument, encodeDocument, restoreDocument, snapshotDocument } from './storage';
import { compressTile } from './tileCodec';
import { unpackTile, type TileData } from './tilePixels';
import { createTileStore } from './tileStore';

/** A drawing of root `Base`, folder `Group 1` holding `Inner A` and `Inner B` bottom first, and root `Top`. */
function folderDocument() {
  const doc = createDocument();
  const base = doc.activeId;
  doc.changeLayer({ type: 'update', id: base, patch: { name: 'Base' } });
  doc.changeLayer({ type: 'add-group' });
  const group = doc.activeId;
  doc.changeLayer({ type: 'add', place: { parentId: group, side: 'above' } });
  const a = doc.activeId;
  doc.changeLayer({ type: 'update', id: a, patch: { name: 'Inner A' } });
  doc.changeLayer({ type: 'add', place: { parentId: group, anchorId: a, side: 'above' } });
  const b = doc.activeId;
  doc.changeLayer({ type: 'update', id: b, patch: { name: 'Inner B' } });
  doc.changeLayer({ type: 'add' });
  const top = doc.activeId;
  doc.changeLayer({ type: 'update', id: top, patch: { name: 'Top' } });
  paint(doc, base, '0,0', 1);
  paint(doc, a, '0,0', 2);
  paint(doc, b, '1,0', 3);
  paint(doc, top, '0,1', 4);
  return { doc, ids: { base, group, a, b, top } };
}

function paint(doc: ReturnType<typeof createDocument>, layerId: string, key: string, value: number) {
  const layer = doc.nodes.find((node) => node.id === layerId) as Layer;
  doc.commit([{ layerId, key, before: layer.tiles.get(key), after: new Uint8Array(TILE_BYTES).fill(value) }]);
}

/** The tree in canonical order as `folder/name` paths. */
function outline(nodes: readonly DocumentNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path = (node: DocumentNode): string =>
    node.parentId ? `${path(byId.get(node.parentId)!)}/${node.name}` : node.name;
  return nodes.map(path);
}

const initial = ['Base', 'Group 1/Inner A', 'Group 1/Inner B', 'Group 1', 'Top'];

describe('folders in the document', () => {
  it('adds folders and layers at a place, each one undo step, and tells the UI the tree', () => {
    const { doc, ids } = folderDocument();
    expect(outline(doc.nodes)).toEqual(initial);
    expect(doc.state().nodes.map((node) => node.kind)).toEqual(['raster', 'raster', 'raster', 'group', 'raster']);
    expect(doc.state().nodes.find((node) => node.id === ids.a)).toMatchObject({ parentId: ids.group, tileCount: 1 });
    // `layers` stay the raster layers, in compositing order, as before folders.
    expect(doc.state().layers.map((layer) => layer.name)).toEqual(['Base', 'Inner A', 'Inner B', 'Top']);

    doc.changeLayer({ type: 'select', id: ids.a });
    doc.changeLayer({ type: 'add', place: { parentId: ids.group, anchorId: ids.a, side: 'above' } });
    expect(outline(doc.nodes)).toEqual([
      'Base',
      'Group 1/Inner A',
      'Group 1/Layer 5',
      'Group 1/Inner B',
      'Group 1',
      'Top'
    ]);
    doc.undo();
    expect(outline(doc.nodes)).toEqual(initial);
    expect(doc.activeId).toBe(ids.a);
    doc.redo();
    expect(doc.activeLayer?.name).toBe('Layer 5');

    const steps = doc.state().historyStates.length;
    expect(() => doc.changeLayer({ type: 'add', place: { parentId: 'missing', side: 'above' } })).toThrow(
      'no such folder'
    );
    expect(() => doc.changeLayer({ type: 'add', place: { parentId: ids.top, side: 'above' } })).toThrow(
      'no such folder'
    );
    expect(() => doc.changeLayer({ type: 'add', place: { parentId: null, anchorId: ids.a, side: 'above' } })).toThrow(
      'not in this folder'
    );
    expect(doc.state().historyStates).toHaveLength(steps);
  });

  it('groups nodes of several folders in their order at the topmost one’s place, as one undo step', () => {
    const { doc, ids } = folderDocument();
    const shownBefore = doc.layers.map(shownFields);
    // A selected node inside another selected folder stays where it is in that folder.
    doc.changeLayer({ type: 'group', ids: [ids.top, ids.a, ids.base, 'unknown'] });
    expect(outline(doc.nodes)).toEqual([
      'Group 1/Inner B',
      'Group 1',
      'Group 2/Base',
      'Group 2/Inner A',
      'Group 2/Top',
      'Group 2'
    ]);
    expect(doc.activeNode).toMatchObject({ kind: 'group', name: 'Group 2', blend: 'pass-through', opacity: 1 });
    doc.undo();
    expect(outline(doc.nodes)).toEqual(initial);
    expect(doc.layers.map(shownFields)).toEqual(shownBefore);
    doc.redo();
    expect(outline(doc.nodes).at(-1)).toBe('Group 2');

    doc.undo();
    doc.changeLayer({ type: 'group', ids: [ids.group, ids.b] });
    expect(outline(doc.nodes)).toEqual([
      'Base',
      'Group 2/Group 1/Inner A',
      'Group 2/Group 1/Inner B',
      'Group 2/Group 1',
      'Group 2',
      'Top'
    ]);
    // Grouping siblings next to each other changes nothing on the canvas.
    expect(doc.layers.map(shownFields)).toEqual(shownBefore);
  });

  it('ungroups a folder into its place, in order, as one undo step', () => {
    const { doc, ids } = folderDocument();
    doc.changeLayer({ type: 'select', id: ids.group });
    doc.changeLayer({ type: 'ungroup', id: ids.group });
    expect(outline(doc.nodes)).toEqual(['Base', 'Inner A', 'Inner B', 'Top']);
    expect(doc.activeId).toBe(ids.b);
    doc.undo();
    expect(outline(doc.nodes)).toEqual(initial);
    expect(doc.activeId).toBe(ids.group);
    doc.redo();
    expect(outline(doc.nodes)).toEqual(['Base', 'Inner A', 'Inner B', 'Top']);
  });

  it('relocates a node into, out of and across folders; refuses a folder into itself and changes nothing', () => {
    const { doc, ids } = folderDocument();
    doc.changeLayer({ type: 'relocate', id: ids.top, parentId: ids.group, side: 'below' });
    expect(outline(doc.nodes)).toEqual(['Base', 'Group 1/Top', 'Group 1/Inner A', 'Group 1/Inner B', 'Group 1']);
    doc.changeLayer({ type: 'relocate', id: ids.b, parentId: null, anchorId: ids.group, side: 'above' });
    expect(outline(doc.nodes)).toEqual(['Base', 'Group 1/Top', 'Group 1/Inner A', 'Group 1', 'Inner B']);
    doc.undo();
    doc.undo();
    expect(outline(doc.nodes)).toEqual(initial);

    doc.changeLayer({ type: 'add-group', place: { parentId: ids.group, side: 'above' } });
    const inner = doc.activeId;
    const steps = doc.state().historyStates.length;
    expect(() => doc.changeLayer({ type: 'relocate', id: ids.group, parentId: inner, side: 'above' })).toThrow(
      'inside itself'
    );
    expect(() => doc.changeLayer({ type: 'relocate', id: ids.group, parentId: ids.group, side: 'above' })).toThrow(
      'inside itself'
    );
    expect(() =>
      doc.changeLayer({ type: 'relocate', id: ids.top, parentId: ids.group, anchorId: ids.base, side: 'above' })
    ).toThrow('not in this folder');
    // Moving a node to where it is records nothing.
    doc.changeLayer({ type: 'relocate', id: ids.top, parentId: null, side: 'above' });
    expect(doc.state().historyStates).toHaveLength(steps);
    expect(outline(doc.nodes)).toEqual([
      'Base',
      'Group 1/Inner A',
      'Group 1/Inner B',
      'Group 1/Group 2',
      'Group 1',
      'Top'
    ]);
  });

  it('moves and reorders among siblings inside a folder', () => {
    const { doc, ids } = folderDocument();
    doc.changeLayer({ type: 'move', id: ids.a, direction: 1 });
    expect(outline(doc.nodes)).toEqual(['Base', 'Group 1/Inner B', 'Group 1/Inner A', 'Group 1', 'Top']);
    doc.changeLayer({ type: 'reorder', id: ids.a, index: 0 });
    expect(outline(doc.nodes)).toEqual(initial);
    const steps = doc.state().historyStates.length;
    doc.changeLayer({ type: 'move', id: ids.b, direction: 1 });
    doc.changeLayer({ type: 'reorder', id: ids.b, index: 2 });
    expect(doc.state().historyStates).toHaveLength(steps);
    doc.changeLayer({ type: 'reorder', id: ids.group, index: 0 });
    expect(outline(doc.nodes)).toEqual(['Group 1/Inner A', 'Group 1/Inner B', 'Group 1', 'Base', 'Top']);
  });

  it('deletes whole subtrees as one undo step and restores their pixels on undo', () => {
    const { doc, ids } = folderDocument();
    const before = doc.state().tileCount;
    doc.changeLayer({ type: 'select', id: ids.a });
    doc.changeLayer({ type: 'delete', id: ids.group });
    expect(outline(doc.nodes)).toEqual(['Base', 'Top']);
    expect(doc.state().tileCount).toBe(before - 2);
    expect(doc.activeId).toBe(ids.top);
    // The removed tile versions stay in history, so storage keeps them.
    expect([...doc.snapshots()].length).toBeGreaterThanOrEqual(before);
    doc.undo();
    expect(outline(doc.nodes)).toEqual(initial);
    expect(doc.activeId).toBe(ids.a);
    expect(unpackTile((doc.node(ids.b) as Layer).tiles.get('1,0') as Uint8Array)[0]).toBe(3);
    doc.redo();
    expect(outline(doc.nodes)).toEqual(['Base', 'Top']);
    doc.undo();

    doc.changeLayer({ type: 'delete', ids: [ids.group, ids.a, ids.top] });
    expect(outline(doc.nodes)).toEqual(['Base']);
    doc.undo();
    expect(outline(doc.nodes)).toEqual(initial);

    // A drawing keeps a raster layer: deleting them all does nothing and records nothing.
    const steps = doc.state().historyStates.length;
    doc.changeLayer({ type: 'delete', ids: [ids.base, ids.group, ids.top] });
    expect(outline(doc.nodes)).toEqual(initial);
    expect(doc.state().historyStates).toHaveLength(steps);
  });

  it('duplicates a folder with copies of its contents that share pixels, as one undo step', () => {
    const { doc, ids } = folderDocument();
    doc.changeLayer({ type: 'duplicate', id: ids.group });
    expect(outline(doc.nodes)).toEqual([
      ...initial.slice(0, 4),
      'Group 1 copy/Inner A',
      'Group 1 copy/Inner B',
      'Group 1 copy',
      'Top'
    ]);
    const copy = doc.activeNode;
    expect(copy).toMatchObject({ kind: 'group', name: 'Group 1 copy' });
    const copies = doc.nodes.filter((node) => node.parentId === copy.id) as Layer[];
    expect(copies.every((node) => ![ids.a, ids.b].includes(node.id))).toBe(true);
    expect(copies[0]!.tiles.get('0,0')).toBe((doc.node(ids.a) as Layer).tiles.get('0,0'));
    doc.undo();
    expect(outline(doc.nodes)).toEqual(initial);
    doc.redo();
    expect(doc.activeId).toBe(copy.id);
  });

  it('keeps a folder unclipped; hiding it hides what is inside', () => {
    const { doc, ids } = folderDocument();
    doc.changeLayer({ type: 'update', id: ids.group, patch: { name: 'Sketch', visible: false } });
    expect(doc.layers.map((layer) => [layer.name, layer.visible])).toEqual([
      ['Base', true],
      ['Inner A', false],
      ['Inner B', false],
      ['Top', true]
    ]);
    // Own properties are unchanged.
    expect(doc.state().layers.every((layer) => layer.visible)).toBe(true);
    const steps = doc.state().historyStates.length;
    expect(() => doc.changeLayer({ type: 'update', id: ids.group, patch: { clipping: true } })).toThrow('folder');
    expect(doc.state().historyStates).toHaveLength(steps);
    doc.undo();
    expect(doc.node(ids.group)).toMatchObject({ name: 'Group 1', visible: true });
  });

  it('merges down only into the raster sibling right below', () => {
    const { doc, ids } = folderDocument();
    doc.mergeDown(ids.b, new Map([['1,0', new Uint8Array(TILE_BYTES).fill(9)]]));
    expect(outline(doc.nodes)).toEqual(['Base', 'Group 1/Inner A', 'Group 1', 'Top']);
    expect(doc.activeId).toBe(ids.a);
    doc.undo();
    expect(outline(doc.nodes)).toEqual(initial);
    expect(() => doc.mergeDown(ids.a, new Map())).toThrow('no layer below');
    expect(() => doc.mergeDown(ids.top, new Map())).toThrow('no layer below');
    expect(() => doc.mergeDown(ids.group, new Map())).toThrow('no layer below');
  });

  it('limits folders and nesting, changing nothing when a command would exceed them', () => {
    const doc = createDocument();
    let parentId: string | null = null;
    for (let depth = 0; depth <= MAX_FOLDER_DEPTH; depth++) {
      doc.changeLayer({ type: 'add-group', place: { parentId, side: 'above' } });
      parentId = doc.activeId;
    }
    const nodes = doc.nodes;
    expect(() => doc.changeLayer({ type: 'add', place: { parentId, side: 'above' } })).toThrow('nested at most');
    expect(() => doc.changeLayer({ type: 'group', ids: [parentId!] })).toThrow('nested at most');
    expect(doc.nodes).toBe(nodes);

    const many = createDocument();
    for (let count = 0; count < MAX_FOLDERS; count++) many.changeLayer({ type: 'add-group' });
    expect(() => many.changeLayer({ type: 'add-group' })).toThrow('at most 128 folders');
    expect(() => many.changeLayer({ type: 'group', ids: [many.layers[0]!.id] })).toThrow('at most 128 folders');
  });

  it('paints only on a raster layer that shows, and adds a new layer above a selected folder', () => {
    const { doc, ids } = folderDocument();
    doc.changeLayer({ type: 'select', id: ids.group });
    expect(doc.activeLayer).toBeUndefined();
    expect(() => doc.active).toThrow('folder');
    expect(doc.state().activePaintable).toBe(false);

    doc.changeLayer({ type: 'select', id: ids.a });
    expect(doc.state().activePaintable).toBe(true);
    doc.changeLayer({ type: 'update', id: ids.group, patch: { visible: false } });
    expect(doc.activeLayer?.visible).toBe(false);
    expect(doc.state().activePaintable).toBe(false);

    doc.changeLayer({ type: 'select', id: ids.group });
    doc.commit([{ layerId: 'new', key: '5,5', before: undefined, after: new Uint8Array(TILE_BYTES).fill(1) }], {
      id: 'new',
      name: 'Pasted',
      visible: true,
      opacity: 1,
      blend: 'normal'
    });
    expect(outline(doc.nodes)).toEqual([...initial.slice(0, 4), 'Pasted', 'Top']);
  });

  it('hands its history to a reopened drawing, whose undo restores folders', () => {
    const { doc, ids } = folderDocument();
    doc.changeLayer({ type: 'group', ids: [ids.base, ids.top] });
    const history = structuredClone(doc.history());
    const next = createDocument();
    next.replace(
      doc.nodes.map((node) => (node.kind === 'group' ? { ...node } : { ...node, tiles: new Map(node.tiles) })),
      doc.activeId
    );
    next.restoreHistory(history);
    next.undo();
    expect(outline(next.nodes)).toEqual(initial);
    // The opened state had only the first layer, still empty.
    next.selectHistorySource(0);
    expect(next.historySourceLayer(ids.base)?.tiles.size).toBe(0);
    expect(next.historySourceLayer(ids.top)).toBeUndefined();
    next.redo();
    expect(outline(next.nodes)).toEqual([
      'Group 1/Inner A',
      'Group 1/Inner B',
      'Group 1',
      'Group 2/Base',
      'Group 2/Top',
      'Group 2'
    ]);
  });

  it('leaves folder steps out of a layer’s region history, as steps of other layers are', async () => {
    const { doc, ids } = folderDocument();
    doc.changeLayer({ type: 'group', ids: [ids.top] });
    doc.changeLayer({ type: 'relocate', id: ids.top, parentId: ids.group, side: 'above' });
    paint(doc, ids.top, '0,1', 5);
    const history = createRegionHistory(async (pixels) => unpackTile(pixels as Uint8Array));
    // Newest first: the new paint (0), relocate (1), group (2), then Top's first paint (3).
    expect(await history.touching(doc.undoSteps(), ids.top, wholeSelection)).toEqual([0, 3]);
  });

  it('refuses to open a tree it cannot show', () => {
    const doc = createDocument();
    const layer = doc.layers[0]!;
    expect(() => doc.replace([{ ...layer, parentId: 'missing' }], layer.id)).toThrow('not a folder');
    expect(() =>
      doc.replace([{ kind: 'group', id: 'g', name: 'G', visible: true, opacity: 1, blend: 'pass-through' }], 'g')
    ).toThrow();
    expect(doc.layers[0]).toBe(layer);
  });
});

describe('saved folders', () => {
  it('round-trip through snapshots, portable JSON and .paint files', async () => {
    const { doc, ids } = folderDocument();
    doc.changeLayer({ type: 'duplicate', id: ids.group });
    doc.changeLayer({ type: 'select', id: ids.group });
    const saved = snapshotDocument(doc.nodes, doc.activeId, defaultCamera());
    expect(saved.version).toBe(4);
    expect(saved.layers.map((node) => node.kind)).toContain('group');

    const restored = restoreDocument(saved);
    expect(outline(restored.nodes)).toEqual(outline(doc.nodes));
    expect(restored.activeId).toBe(ids.group);
    expect(restored.layers.map((layer) => layer.id)).toEqual(doc.layers.map((layer) => layer.id));
    expect(outline(decodeDocument(encodeDocument(saved)).nodes)).toEqual(outline(doc.nodes));

    let reads = 0;
    const file = await writePaintFile(saved, async (data) => {
      reads++;
      return data as Uint8Array;
    });
    expect(new TextDecoder().decode(new Uint8Array(await file.slice(0, 8).arrayBuffer()))).toBe('PAINT5\r\n');
    // The copies share their tiles with the originals, so each tile version is stored once.
    expect(reads).toBe(4);
    const loaded = await readPaintFile(file);
    expect(outline(loaded.nodes)).toEqual(outline(doc.nodes));
    const reopened = createDocument();
    reopened.replace(loaded.nodes, loaded.activeId);
    expect(reopened.layers.map((layer) => [layer.id, layer.tiles.size])).toEqual(
      doc.layers.map((layer) => [layer.id, layer.tiles.size])
    );
  });

  it('opens drawings saved before folders with their layers at the root', async () => {
    const pixels = new Uint8Array(TILE_BYTES).fill(6);
    const legacy = {
      version: 2,
      tileSize: 256,
      activeId: 'b',
      camera: defaultCamera(),
      blending: 'linear',
      layers: [
        { id: 'a', name: 'A', visible: true, opacity: 1, blend: 'normal', tiles: [{ key: '0,0', pixels }] },
        // Fields a legacy version does not know are dropped: this layer opens at the root.
        { id: 'b', name: 'B', visible: false, opacity: 0.5, blend: 'multiply', parentId: 'a', kind: 'group', tiles: [] }
      ]
    };
    const restored = restoreDocument(legacy);
    expect(restored.nodes.map((node) => [node.id, node.kind, node.parentId])).toEqual([
      ['a', undefined, undefined],
      ['b', undefined, undefined]
    ]);
    expect(restoreDocument({ ...legacy, version: 3 }).nodes).toHaveLength(2);

    const file = await legacyVersion4File(legacy);
    const loaded = await readPaintFile(file);
    expect(loaded.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(unpackTile(loaded.layers[0]!.tiles.get('0,0') as Uint8Array)[0]).toBe(6);
  });

  it('refuses clipped folders and broken trees', () => {
    const { doc, ids } = folderDocument();
    const saved = snapshotDocument(doc.nodes, doc.activeId, defaultCamera());
    const withFolder = (patch: object) => ({
      ...saved,
      layers: saved.layers.map((node) => (node.id === ids.group ? { ...node, ...patch } : node))
    });
    expect(() => restoreDocument(withFolder({ clipping: true }))).toThrow('cannot show');
    expect(() => restoreDocument(withFolder({ parentId: ids.group }))).toThrow('inside itself');
    expect(() => restoreDocument(withFolder({ parentId: ids.base }))).toThrow('not a folder');
    expect(() => restoreDocument({ ...saved, layers: saved.layers.filter((node) => node.kind === 'group') })).toThrow();
    // A portable file cannot refer to stored tile versions.
    const referring = {
      ...saved,
      layers: saved.layers.map((node) =>
        node.kind === 'group'
          ? node
          : {
              ...node,
              tiles: node.tiles.map((tile) => ({ ...tile, pixels: { storageId: crypto.randomUUID(), byteLength: 8 } }))
            }
      )
    };
    expect(() => restoreDocument(referring, true)).toThrow('external tile reference');
    expect(restoreDocument(referring).nodes).toHaveLength(saved.layers.length);
  });

  it('migrates a stored version 3 checkpoint, and keeps the tiles of layers in folders through collection', async () => {
    const name = 'folders-checkpoint';
    const store = await createTileStore(name, 0);
    const tile = store.capture(new Uint8Array(TILE_BYTES).fill(8));
    await store.flush();
    await putCheckpoint(name, {
      version: 3,
      tileSize: 256,
      activeId: 'old',
      camera: defaultCamera(),
      layers: [
        { id: 'old', name: 'Old', visible: true, opacity: 1, blend: 'normal', tiles: [{ key: '0,0', pixels: tile }] }
      ]
    });
    const loaded = (await store.load())!;
    expect(loaded.nodes.map((node) => [node.id, node.kind, node.parentId])).toEqual([['old', undefined, undefined]]);

    const doc = createDocument();
    doc.replace(loaded.nodes, loaded.activeId);
    doc.changeLayer({ type: 'group', ids: ['old'] });
    await store.save(snapshotDocument(doc.nodes, doc.activeId, defaultCamera()));
    // Nothing else refers to the tile: only the checkpoint's layer inside the folder keeps it.
    await store.collect(() => []);
    const reloaded = (await store.load())!;
    expect(outline(reloaded.nodes)).toEqual(['Group 1/Old', 'Group 1']);
    const data = reloaded.layers[0]!.tiles.get('0,0')!;
    expect(unpackTile(await store.read(data))[0]).toBe(8);
    expect(store.stats().missingTiles).toBe(0);
    await store.close();
  });

  it('exports a drawing in folders to the same PSD as the same layers flat', async () => {
    const read = async (data: TileData) => data as Uint8Array;
    const { doc, ids } = folderDocument();
    const flat = createDocument();
    flat.replace(
      doc.layers.map(({ parentId: _parentId, ...layer }) => ({ ...layer, tiles: new Map(layer.tiles) })),
      ids.top
    );
    const region = { left: 0, top: 0, width: 512, height: 512 };
    const bytes = async (layers: Layer[]) =>
      new Uint8Array(await (await writePsdFile(layers, read, region)).arrayBuffer());
    expect(await bytes(doc.layers)).toEqual(await bytes(flat.layers));

    // A hidden folder exports its layers hidden, as the same layers hidden flat.
    doc.changeLayer({ type: 'update', id: ids.group, patch: { visible: false } });
    flat.changeLayer({ type: 'update', id: ids.a, patch: { visible: false } });
    flat.changeLayer({ type: 'update', id: ids.b, patch: { visible: false } });
    expect(await bytes(doc.layers)).toEqual(await bytes(flat.layers));
  });
});

/**
 * The fields that decide how a raster composites, as `compositionSignature` reads them, and its tile versions by
 * identity: comparing the pixels themselves would walk every byte.
 */
function shownFields(layer: Layer) {
  return {
    id: layer.id,
    visible: layer.visible,
    opacity: layer.opacity,
    blend: layer.blend,
    clipping: !!layer.clipping,
    tiles: [...layer.tiles].map(([key, data]) => [key, versionNumber(data)])
  };
}

const versions = new WeakMap<TileData, number>();
let versionCount = 0;

/** A number naming tile version `data`, the same for the same object. */
function versionNumber(data: TileData) {
  const known = versions.get(data);
  if (known !== undefined) {
    return known;
  }

  versions.set(data, ++versionCount);
  return versionCount;
}

/** A `.paint` file of version 4, as Paint wrote it before folders, of a version 2 document with inline pixels. */
async function legacyVersion4File(document: { layers: { tiles: { key: string; pixels: Uint8Array }[] }[] }) {
  const magic = new TextEncoder().encode('PAINT4\r\n');
  const parts: BlobPart[] = [magic];
  const index: { offset: number; length: number; byteLength: number }[] = [];
  let offset = magic.byteLength;
  const layers = [];
  for (const layer of document.layers) {
    const tiles = [];
    for (const tile of layer.tiles) {
      const stored = await compressTile(tile.pixels);
      tiles.push({ key: tile.key, tile: index.length });
      index.push({ offset, length: stored.byteLength, byteLength: tile.pixels.byteLength });
      parts.push(new Blob([stored as Uint8Array<ArrayBuffer>]));
      offset += stored.byteLength;
    }

    layers.push({ ...layer, tiles });
  }

  const header = new TextEncoder().encode(JSON.stringify({ ...document, version: 4, layers, tiles: index }));
  const trailer = new Uint8Array(16);
  new DataView(trailer.buffer).setBigUint64(0, BigInt(offset), true);
  new DataView(trailer.buffer).setUint32(8, header.byteLength, true);
  trailer.set(new TextEncoder().encode('P4IX'), 12);
  return new Blob([...parts, header, trailer]);
}

/** Writes `checkpoint` as the current drawing of tile store `name`, as an older Paint did. */
async function putCheckpoint(name: string, checkpoint: object) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    tx.objectStore('documents').put(checkpoint, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
