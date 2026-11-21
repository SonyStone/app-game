import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { defaultCamera } from './camera';
import { createDocument, TILE_BYTES, type DocumentNode, type Layer, type LayerMask } from './document';
import {
  coverageFromRgba,
  coverageTile,
  isMaskTile,
  MASK_TILE_PIXELS,
  maskBrushColor,
  maskCoverage,
  maskPixels,
  maskRgba,
  newMask,
  packMaskTile,
  paintCoverage,
  storedGoal,
  unpackMaskTile
} from './layerMask';
import { appliedMaskTiles, mergeDownTiles } from './layerMerge';
import { applyLiveState, listLiveTiles } from './liveDrawing';
import { readPaintFile, writePaintFile } from './paintFile';
import { createRegionHistory } from './regionHistory';
import { wholeSelection } from './selectionMask';
import { decodeDocument, encodeDocument, restoreDocument, savedTiles, snapshotDocument } from './storage';
import { compressTile, restoreTile } from './tileCodec';
import { packTile, unpackTile, type TileData } from './tilePixels';

type Doc = ReturnType<typeof createDocument>;

/** A tile of coverage `value` everywhere, or `values` at its first pixels and `rest` after them. */
function coverage(value: number, values: number[] = []) {
  const tile = new Uint8Array(MASK_TILE_PIXELS).fill(value);
  tile.set(values);
  return tile;
}

/** An opaque tile of one premultiplied RGBA value. */
function pixelsOf(rgba: [number, number, number, number]) {
  const tile = new Uint8Array(TILE_BYTES);
  for (let index = 0; index < TILE_BYTES; index += 4) {
    tile.set(rgba, index);
  }

  return tile;
}

/** A drawing whose layer `Base` has paint at 0,0 and folder `Group 1` holds layer `Inner`; returns their ids. */
function drawing() {
  const doc = createDocument();
  const base = doc.activeId;
  doc.changeLayer({ type: 'update', id: base, patch: { name: 'Base' } });
  doc.commit([{ layerId: base, key: '0,0', before: undefined, after: pixelsOf([200, 100, 50, 255]) }]);
  doc.changeLayer({ type: 'add-group' });
  const group = doc.activeId;
  doc.changeLayer({ type: 'add', place: { parentId: group, side: 'above' } });
  const inner = doc.activeId;
  doc.changeLayer({ type: 'update', id: inner, patch: { name: 'Inner' } });
  return { doc, base, group, inner };
}

/** The mask of node `id`, which must have one. */
function maskOf(doc: Doc, id: string): LayerMask {
  const mask = doc.node(id)?.mask;
  expect(mask).toBeDefined();
  return mask!;
}

/** Paints stored coverage `tile` into the mask of node `id` at `key` as one step. */
function paintMask(doc: Doc, id: string, key: string, tile: Uint8Array) {
  const mask = maskOf(doc, id);
  doc.commit([{ layerId: mask.id, key, before: mask.tiles.get(key), after: tile }]);
}

describe('mask tiles', () => {
  it('pack one byte per pixel, uniform tiles in twelve bytes, with a header no RGBA tile has', () => {
    const uniform = packMaskTile(coverage(128));
    expect(uniform.byteLength).toBe(12);
    expect(unpackMaskTile(uniform)).toEqual(coverage(128));
    const dense = packMaskTile(coverage(0, [1, 2, 3]));
    expect(dense.byteLength).toBe(8 + MASK_TILE_PIXELS);
    expect(unpackMaskTile(dense)).toEqual(coverage(0, [1, 2, 3]));
    // Packing a packed tile returns it.
    expect(packMaskTile(dense)).toBe(dense);

    expect(isMaskTile(dense)).toBe(true);
    expect(isMaskTile(packTile(new Uint8Array(TILE_BYTES)))).toBe(false);
    expect(() => unpackMaskTile(packTile(pixelsOf([1, 1, 1, 1])))).toThrow('mask tile');
    expect(() => packMaskTile(new Uint8Array(10))).toThrow('one byte per pixel');
    expect(() => unpackMaskTile({ storageId: 'x', byteLength: 12 })).toThrow('Load this tile');
  });

  it('read as `outside` where there is no tile, and need no tile when uniformly `outside`', () => {
    expect(maskCoverage(undefined, 255)).toEqual(coverage(255));
    // A tile storage lost reads as an empty RGBA tile; a mask reads it as having no tile.
    expect(maskCoverage(packTile(new Uint8Array(TILE_BYTES)), 7)).toEqual(coverage(7));
    expect(coverageTile(coverage(255), 255)).toBeUndefined();
    expect(coverageTile(coverage(255, [254]), 255)).toBeDefined();
  });

  it('survive storage compression unchanged', async () => {
    for (const tile of [packMaskTile(coverage(9)), packMaskTile(coverage(0, [255, 3])), packMaskTile(coverage(77))]) {
      expect(await restoreTile(await compressTile(tile))).toEqual(tile);
    }
  });

  it('paint `old + c × (goal − old)` towards Reveal, Hide and the inverted goals, rounded', () => {
    const old = coverage(0, [0, 255, 100, 100]);
    // Reveal is 255, Hide 0; an inverted mask stores them reversed.
    expect(storedGoal(255, false)).toBe(255);
    expect(storedGoal(255, true)).toBe(0);
    expect(storedGoal(0, true)).toBe(255);
    // A soft stroke: coverage 128 of 255 moves half way.
    expect([...paintCoverage(old, 128, 255).subarray(0, 4)]).toEqual([128, 255, 178, 178]);
    expect([...paintCoverage(old, 128, 0).subarray(0, 4)]).toEqual([0, 127, 50, 50]);
    // Coverage per pixel, as a selection gives it.
    const amount = coverage(0, [255, 0, 51, 0]);
    expect([...paintCoverage(old, amount, 255).subarray(0, 4)]).toEqual([255, 255, 131, 100]);
    expect(maskBrushColor(255)).toBe('#ffffff');
    expect(maskBrushColor(0)).toBe('#000000');
    expect(maskBrushColor(128)).toBe('#808080');
  });

  it('expand to opaque grey for the GPU and come back from a painted readback', () => {
    const rgba = maskRgba(coverage(0, [10, 200]));
    expect([...rgba.subarray(0, 8)]).toEqual([10, 10, 10, 255, 200, 200, 200, 255]);
    expect(coverageFromRgba(rgba, false)).toEqual(coverage(0, [10, 200]));
    expect(coverageFromRgba(rgba, true)).toEqual(coverage(0, [10, 200]));
    // An eraser lowers alpha: the removed coverage moves to Hide, stored 0 or, inverted, 255.
    const erased = new Uint8Array(TILE_BYTES);
    erased.set([100, 100, 100, 128, 0, 0, 0, 0, 51, 51, 51, 51]);
    expect([...coverageFromRgba(erased, false).subarray(0, 3)]).toEqual([100, 0, 51]);
    expect([...coverageFromRgba(erased, true).subarray(0, 3)]).toEqual([227, 255, 255]);
  });

  it('scale every premultiplied channel by the effective coverage when baked into pixels', () => {
    const pixels = pixelsOf([200, 100, 50, 255]);
    const masked = maskPixels(pixels, coverage(255, [0, 128, 51]), false);
    expect([...masked.subarray(0, 16)]).toEqual([0, 0, 0, 0, 100, 50, 25, 128, 40, 20, 10, 51, 200, 100, 50, 255]);
    const inverted = maskPixels(pixels, coverage(255, [0]), true);
    expect([...inverted.subarray(0, 8)]).toEqual([200, 100, 50, 255, 0, 0, 0, 0]);
  });
});

describe('masks in the document', () => {
  it('adds a Reveal all mask to a raster or a folder, linked, enabled and the paint target, as one undo step', () => {
    const { doc, base, group } = drawing();
    const steps = doc.state().historyStates.length;
    doc.changeLayer({ type: 'add-mask', id: base });
    const mask = maskOf(doc, base);
    expect(mask).toMatchObject({ outside: 255, enabled: true, linked: true, inverted: false });
    expect(mask.tiles.size).toBe(0);
    expect(mask.id).not.toBe(base);
    expect(doc.activeId).toBe(base);
    expect(doc.activeTarget).toEqual({ type: 'mask', id: mask.id });
    expect(doc.activeMask).toBe(mask);
    expect(doc.state()).toMatchObject({ activeTarget: { type: 'mask', id: mask.id }, activePaintable: true });
    expect(doc.state().historyStates).toHaveLength(steps + 1);
    // The UI state names the mask's properties and tile count, never its tiles.
    const state = doc.state().nodes.find((node) => node.id === base)!;
    expect(state.mask).toEqual({
      id: mask.id,
      outside: 255,
      enabled: true,
      linked: true,
      inverted: false,
      tileCount: 0
    });
    expect(doc.state().layers.find((layer) => layer.id === base)!.mask).toEqual(state.mask);
    expect(() => doc.changeLayer({ type: 'add-mask', id: base })).toThrow('already has a mask');

    doc.changeLayer({ type: 'add-mask', id: group });
    expect(maskOf(doc, group).id).not.toBe(mask.id);
    expect(doc.activeTarget).toEqual({ type: 'mask', id: maskOf(doc, group).id });

    doc.undo();
    expect(doc.node(group)?.mask).toBeUndefined();
    expect(doc.activeTarget).toEqual({ type: 'mask', id: mask.id });
    doc.undo();
    expect(doc.node(base)?.mask).toBeUndefined();
    // Back to what was active before: the layer `Inner`, painting its pixels.
    expect(doc.activeTarget).toEqual({ type: 'pixels' });
    doc.redo();
    expect(doc.activeTarget).toEqual({ type: 'mask', id: mask.id });
  });

  it('selects the pixels or the mask of a node as the paint target, outside the history', () => {
    const { doc, base, group, inner } = drawing();
    doc.changeLayer({ type: 'add-mask', id: base });
    const steps = doc.state().historyStates.length;
    doc.changeLayer({ type: 'select', id: base });
    expect(doc.activeTarget).toEqual({ type: 'pixels' });
    doc.changeLayer({ type: 'select', id: base, target: 'mask' });
    expect(doc.activeTarget).toEqual({ type: 'mask', id: maskOf(doc, base).id });
    // Without a mask, asking for it paints the pixels; a folder without a mask paints nothing.
    doc.changeLayer({ type: 'select', id: inner, target: 'mask' });
    expect(doc.activeTarget).toEqual({ type: 'pixels' });
    doc.changeLayer({ type: 'select', id: group, target: 'mask' });
    expect(doc.activeTarget).toEqual({ type: 'none' });
    expect(doc.state().activePaintable).toBe(false);
    expect(doc.state().historyStates).toHaveLength(steps);
  });

  it('paints a mask only while its node shows', () => {
    const { doc, group } = drawing();
    doc.changeLayer({ type: 'add-mask', id: group });
    expect(doc.state().activePaintable).toBe(true);
    doc.changeLayer({ type: 'update', id: group, patch: { visible: false } });
    expect(doc.state().activePaintable).toBe(false);
  });

  it('enables, links and inverts a mask, each one undo step, and refuses other values', () => {
    const { doc, base } = drawing();
    doc.changeLayer({ type: 'add-mask', id: base });
    const steps = doc.state().historyStates.length;
    doc.changeLayer({ type: 'update-mask', id: base, patch: { enabled: false } });
    doc.changeLayer({ type: 'update-mask', id: base, patch: { linked: false } });
    doc.changeLayer({ type: 'update-mask', id: base, patch: { inverted: true } });
    expect(maskOf(doc, base)).toMatchObject({ enabled: false, linked: false, inverted: true });
    expect(doc.state().historyStates).toHaveLength(steps + 3);
    // The same values again change nothing and record nothing.
    doc.changeLayer({ type: 'update-mask', id: base, patch: { inverted: true } });
    expect(doc.state().historyStates).toHaveLength(steps + 3);
    expect(() =>
      doc.changeLayer({ type: 'update-mask', id: base, patch: { enabled: 'yes' as unknown as boolean } })
    ).toThrow('enabled or not');
    expect(() => doc.changeLayer({ type: 'update-mask', id: doc.state().nodes[1]!.id, patch: {} })).toThrow('no mask');

    doc.undo();
    expect(maskOf(doc, base)).toMatchObject({ enabled: false, linked: false, inverted: false });
    doc.undo();
    doc.undo();
    expect(maskOf(doc, base)).toMatchObject({ enabled: true, linked: true, inverted: false });
  });

  it('stores coverage tiles in the mask plane, packed, dropping those equal to `outside`, with undo and redo', () => {
    const { doc, base } = drawing();
    doc.changeLayer({ type: 'add-mask', id: base });
    const mask = maskOf(doc, base);
    const colour = doc.node(base) as Layer;
    const pixels = colour.tiles.get('0,0');
    paintMask(doc, base, '0,0', coverage(255, [0, 128]));
    expect(isMaskTile(mask.tiles.get('0,0'))).toBe(true);
    expect([...unpackMaskTile(mask.tiles.get('0,0')!).subarray(0, 3)]).toEqual([0, 128, 255]);
    // The colour plane is untouched.
    expect((doc.node(base) as Layer).tiles.get('0,0')).toBe(pixels);
    expect(doc.state().nodes.find((node) => node.id === base)!.mask!.tileCount).toBe(1);

    // A tile painted back to `outside` everywhere is removed.
    paintMask(doc, base, '0,0', coverage(255));
    expect(maskOf(doc, base).tiles.has('0,0')).toBe(false);
    doc.undo();
    expect([...unpackMaskTile(maskOf(doc, base).tiles.get('0,0')!).subarray(0, 2)]).toEqual([0, 128]);
    doc.undo();
    expect(maskOf(doc, base).tiles.size).toBe(0);
    doc.redo();
    expect(maskOf(doc, base).tiles.size).toBe(1);
    // RGBA pixels are not coverage.
    expect(() =>
      doc.commit([{ layerId: mask.id, key: '1,0', before: undefined, after: new Uint8Array(TILE_BYTES) }])
    ).toThrow('one byte per pixel');
  });

  it('deletes a mask as one step that undo restores with its tiles, and goes back to the pixels', () => {
    const { doc, base } = drawing();
    doc.changeLayer({ type: 'add-mask', id: base });
    paintMask(doc, base, '0,0', coverage(0));
    const tile = maskOf(doc, base).tiles.get('0,0');
    doc.changeLayer({ type: 'delete-mask', id: base });
    expect(doc.node(base)?.mask).toBeUndefined();
    expect(doc.activeTarget).toEqual({ type: 'pixels' });
    // Deleting a mask that is not there does nothing.
    const steps = doc.state().historyStates.length;
    doc.changeLayer({ type: 'delete-mask', id: base });
    expect(doc.state().historyStates).toHaveLength(steps);

    doc.undo();
    expect(maskOf(doc, base).tiles.get('0,0')).toBe(tile);
    expect(doc.activeTarget).toEqual({ type: 'mask', id: maskOf(doc, base).id });
    doc.redo();
    expect(doc.node(base)?.mask).toBeUndefined();
  });

  it('applies a mask: new pixels and the mask gone in one step, refused through `changeLayer` and on folders', () => {
    const { doc, base, group } = drawing();
    doc.changeLayer({ type: 'add-mask', id: base });
    paintMask(doc, base, '0,0', coverage(255, [0, 128]));
    const before = (doc.node(base) as Layer).tiles.get('0,0')!;
    const masked = maskPixels(unpackTile(before), unpackMaskTile(maskOf(doc, base).tiles.get('0,0')!), false);
    expect(() => doc.changeLayer({ type: 'apply-mask', id: base })).toThrow('through the runtime');
    doc.applyMask(base, new Map([['0,0', masked]]));
    expect(doc.node(base)?.mask).toBeUndefined();
    expect(doc.activeTarget).toEqual({ type: 'pixels' });
    expect([...unpackTile((doc.node(base) as Layer).tiles.get('0,0')!).subarray(0, 8)]).toEqual([
      0, 0, 0, 0, 100, 50, 25, 128
    ]);
    doc.undo();
    expect((doc.node(base) as Layer).tiles.get('0,0')).toBe(before);
    expect(maskOf(doc, base).tiles.size).toBe(1);

    doc.changeLayer({ type: 'add-mask', id: group });
    expect(() => doc.applyMask(group, new Map())).toThrow('raster layer with a mask');
  });

  it('duplicates and deletes subtrees with their masks, which get fresh ids and keep their tiles', () => {
    const { doc, base, group, inner } = drawing();
    doc.changeLayer({ type: 'add-mask', id: group });
    paintMask(doc, group, '0,0', coverage(10));
    doc.changeLayer({ type: 'add-mask', id: inner });
    paintMask(doc, inner, '1,0', coverage(20));
    doc.changeLayer({ type: 'duplicate', id: group });
    const copy = doc.activeId;
    const copied = doc.nodes.filter((node) => node.id === copy || node.parentId === copy);
    const masks = copied.map((node) => node.mask!);
    expect(masks.map((mask) => mask.id)).not.toContain(maskOf(doc, group).id);
    expect(masks.map((mask) => mask.id)).not.toContain(maskOf(doc, inner).id);
    expect(
      new Set([...doc.nodes.map((node) => node.id), ...doc.nodes.flatMap((n) => (n.mask ? [n.mask.id] : []))]).size
    ).toBe(doc.nodes.length + doc.nodes.filter((node) => node.mask).length);
    // Copies share the immutable tile versions and own their maps.
    expect(masks[0]!.tiles.get('1,0')).toBe(maskOf(doc, inner).tiles.get('1,0'));
    expect(masks[0]!.tiles).not.toBe(maskOf(doc, inner).tiles);
    expect(masks[1]!.tiles.get('0,0')).toBe(maskOf(doc, group).tiles.get('0,0'));
    expect(
      doc
        .history()
        .undo.at(-1)!
        .tiles.map((tile) => tile.layerId)
        .sort()
    ).toEqual([masks[0]!.id, masks[1]!.id].sort());

    const groupMask = maskOf(doc, group).id,
      innerMask = maskOf(doc, inner).id;
    doc.changeLayer({ type: 'delete', id: group });
    expect(doc.node(group)).toBeUndefined();
    const removed = doc
      .history()
      .undo.at(-1)!
      .tiles.map((tile) => tile.layerId);
    expect(removed).toEqual(expect.arrayContaining([groupMask, innerMask]));
    doc.undo();
    expect(maskOf(doc, group).tiles.size).toBe(1);
    expect(maskOf(doc, inner).tiles.size).toBe(1);
    expect(doc.node(base)).toBeDefined();
  });

  it('ungroups a masked folder, its mask going with it until undo', () => {
    const { doc, group } = drawing();
    doc.changeLayer({ type: 'add-mask', id: group });
    paintMask(doc, group, '0,0', coverage(0));
    const tile = maskOf(doc, group).tiles.get('0,0');
    doc.changeLayer({ type: 'ungroup', id: group });
    expect(doc.node(group)).toBeUndefined();
    doc.undo();
    expect(maskOf(doc, group).tiles.get('0,0')).toBe(tile);
  });

  it('keeps mask steps out of the colour plane in region history, and finds them in the mask plane', async () => {
    const { doc, base } = drawing();
    doc.changeLayer({ type: 'add-mask', id: base });
    paintMask(doc, base, '0,0', coverage(0));
    const read = async (data: TileData) =>
      isMaskTile(data) ? maskRgba(unpackMaskTile(data)) : unpackTile(data as TileData);
    const history = createRegionHistory(read);
    const steps = doc.undoSteps();
    // Newest first: the mask stroke, adding the mask, three steps on `Inner` and its folder, then the base's paint.
    expect(await history.touching(steps, base, wholeSelection)).toEqual([5]);
    expect(await history.touching(steps, maskOf(doc, base).id, wholeSelection)).toEqual([0]);
  });

  it('counts mask tiles in the storage budget and in persistence and garbage collection', () => {
    const { doc, base } = drawing();
    doc.changeLayer({ type: 'add-mask', id: base });
    const pixelBytes = doc.state().pixelBytes;
    paintMask(doc, base, '0,0', coverage(0));
    const tile = maskOf(doc, base).tiles.get('0,0')!;
    expect(doc.state().pixelBytes).toBe(pixelBytes + tile.byteLength);
    expect([...doc.snapshots()]).toContain(tile);
    const captured = new Map<TileData, TileData>();
    doc.persist((pixels) => {
      if (!captured.has(pixels))
        captured.set(pixels, { storageId: crypto.randomUUID(), byteLength: pixels.byteLength });
      return captured.get(pixels)!;
    });
    expect(maskOf(doc, base).tiles.get('0,0')).toBe(captured.get(tile));
    expect(doc.history().undo.at(-1)!.tiles[0]!.after).toBe(captured.get(tile));
  });

  it('restores a history handoff with mask steps, refusing one of another drawing', () => {
    const { doc, base } = drawing();
    doc.changeLayer({ type: 'add-mask', id: base });
    paintMask(doc, base, '0,0', coverage(3));
    const handoff = structuredClone(doc.history());
    const next = createDocument();
    next.replace(doc.nodes, doc.activeId, true, doc.psdIdentity(), true);
    expect(next.activeTarget).toEqual({ type: 'mask', id: maskOf(doc, base).id });
    next.restoreHistory(handoff);
    next.undo();
    expect(maskOf(next, base).tiles.size).toBe(0);
    next.undo();
    expect(next.node(base)?.mask).toBeUndefined();

    const other = createDocument();
    other.replace(
      doc.nodes.map((node) => ({ ...node, mask: undefined }) as DocumentNode),
      doc.activeId
    );
    expect(() => other.restoreHistory(handoff)).toThrow('another drawing');
  });

  it('refuses drawings whose masks repeat an id or cover outside 0–255', () => {
    const doc = createDocument();
    const layer = doc.nodes[0] as Layer;
    expect(() => doc.replace([{ ...layer, mask: newMask(layer.id) }], layer.id)).toThrow('mask identifiers');
    expect(() => doc.replace([{ ...layer, mask: { ...newMask('m'), outside: 256 } }], layer.id)).toThrow(
      'from 0 to 255'
    );
  });
});

describe('masks in saved drawings', () => {
  /** A drawing with a masked raster and a masked folder, painted, the raster's mask the paint target. */
  function masked() {
    const { doc, base, group, inner } = drawing();
    doc.changeLayer({ type: 'add-mask', id: group });
    paintMask(doc, group, '0,0', coverage(0, [255]));
    doc.changeLayer({ type: 'update-mask', id: group, patch: { inverted: true, linked: false } });
    doc.changeLayer({ type: 'add-mask', id: base });
    paintMask(doc, base, '1,1', coverage(40));
    paintMask(doc, base, '2,1', coverage(41));
    doc.changeLayer({ type: 'update-mask', id: base, patch: { enabled: false } });
    return { doc, base, group, inner };
  }

  const saved = (doc: Doc) =>
    snapshotDocument(doc.nodes, doc.activeId, defaultCamera(), {}, true, undefined, doc.activeTarget.type === 'mask');

  /** The masks of `nodes` as comparable values: properties and unpacked tiles. */
  const masks = (nodes: readonly DocumentNode[]) =>
    nodes.flatMap((node) =>
      node.mask
        ? [
            {
              node: node.id,
              ...node.mask,
              tiles: [...node.mask.tiles]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, data]) => [key, [...unpackMaskTile(data).subarray(0, 2)]])
            }
          ]
        : []
    );

  it('writes version 6 only for a drawing with a mask, with the mask target', () => {
    const { doc } = masked();
    const snapshot = saved(doc);
    expect(snapshot.version).toBe(6);
    expect(snapshot.activeMask).toBe(true);
    expect([...savedTiles(snapshot)]).toHaveLength(4);
    const plain = createDocument();
    expect(snapshotDocument(plain.nodes, plain.activeId, defaultCamera()).version).toBe(4);
  });

  it('round-trip through the checkpoint, portable JSON and `.paint` files', async () => {
    const { doc } = masked();
    const restored = restoreDocument(structuredClone(saved(doc)));
    expect(masks(restored.nodes)).toEqual(masks(doc.nodes));
    expect(restored.maskTarget).toBe(true);

    const decoded = decodeDocument(encodeDocument(saved(doc)));
    expect(masks(decoded.nodes)).toEqual(masks(doc.nodes));
    expect(decoded.maskTarget).toBe(true);

    const file = await writePaintFile(saved(doc), async (data) => data as Uint8Array);
    expect(new TextDecoder().decode(new Uint8Array(await file.slice(0, 8).arrayBuffer()))).toBe('PAINT7\r\n');
    const read = await readPaintFile(file);
    expect(masks(read.nodes)).toEqual(masks(doc.nodes));
    expect(read.maskTarget).toBe(true);
    const opened = createDocument();
    opened.replace(read.nodes, read.activeId, read.linearBlending, undefined, read.maskTarget);
    expect(opened.activeTarget).toEqual(doc.activeTarget);
  });

  it('opens drawings of earlier versions unchanged, without masks', async () => {
    const { doc } = drawing();
    const snapshot = saved(doc);
    expect(snapshot.version).toBe(4);
    const file = await writePaintFile(snapshot, async (data) => data as Uint8Array);
    expect(new TextDecoder().decode(new Uint8Array(await file.slice(0, 8).arrayBuffer()))).toBe('PAINT5\r\n');
    const read = await readPaintFile(file);
    expect(read.nodes.some((node) => node.mask)).toBe(false);
    expect(read.nodes.map((node) => node.id)).toEqual(doc.nodes.map((node) => node.id));
    // A mask in an earlier version's document is not part of it.
    const legacy = { ...snapshot, layers: snapshot.layers.map((node) => ({ ...node, mask: { id: 'm' } })) };
    expect(restoreDocument(legacy).nodes.some((node) => node.mask)).toBe(false);
  });

  it('refuses masks with repeated ids, malformed tiles or coverage outside 0–255', () => {
    const { doc, base } = masked();
    const snapshot = saved(doc);
    const withMask = (change: (mask: Record<string, unknown>) => Record<string, unknown>) => ({
      ...snapshot,
      layers: snapshot.layers.map((node) => (node.id === base ? { ...node, mask: change({ ...node.mask }) } : node))
    });
    expect(() => restoreDocument(withMask((mask) => ({ ...mask, id: base })))).toThrow('mask identifiers');
    expect(() => restoreDocument(withMask((mask) => ({ ...mask, outside: 300 })))).toThrow();
    expect(() =>
      restoreDocument(
        withMask((mask) => ({ ...mask, tiles: [{ key: '0,0', pixels: packTile(pixelsOf([1, 1, 1, 1])) }] }))
      )
    ).toThrow('mask tile');
    // Tiles of only `outside` are dropped on opening.
    const pruned = restoreDocument(
      withMask((mask) => ({ ...mask, outside: 40, tiles: [{ key: '1,1', pixels: packMaskTile(coverage(40)) }] }))
    );
    expect(pruned.nodes.find((node) => node.id === base)!.mask!.tiles.size).toBe(0);
  });

  it('share masks with live viewers, tiles listed by mask id', async () => {
    const { doc, base, group } = masked();
    const capture = (data: TileData) => ({ storageId: crypto.randomUUID(), byteLength: data.byteLength });
    const { listing, versions } = listLiveTiles(
      { layers: doc.layers, nodes: doc.nodes, activeId: doc.activeId, linearBlending: true },
      { left: 0, top: 0, width: 1024, height: 1024 },
      capture,
      100
    );
    const maskIds = [maskOf(doc, base).id, maskOf(doc, group).id];
    expect(listing.tiles.filter((tile) => maskIds.includes(tile.layerId))).toHaveLength(3);
    expect(listing.layers.find((layer) => layer.id === base)!.mask).toMatchObject({ enabled: false });
    expect(JSON.stringify(listing.layers)).not.toContain('tiles');

    const viewer = createDocument();
    const state = {
      layers: listing.layers,
      activeId: listing.activeId,
      linearBlending: true,
      tiles: await Promise.all(
        listing.tiles.map(async (tile) => ({
          layerId: tile.layerId,
          key: tile.key,
          bytes: await compressTile(versions.get(tile.version) as Uint8Array)
        }))
      )
    };
    const applied = await applyLiveState(viewer.nodes, state);
    viewer.replace(applied.layers, state.activeId);
    expect(masks(viewer.nodes)).toEqual(masks(doc.nodes));
  });
});

describe('merging and applying masks', () => {
  const read = async (data: TileData) => data as Uint8Array;
  /** A raster with tile 0,0 of `rgba` and, given `values`, a mask whose tile 0,0 starts with them. */
  function raster(rgba: [number, number, number, number], values?: number[], options: Partial<LayerMask> = {}) {
    const mask = values && {
      ...newMask('m'),
      ...options,
      tiles: new Map([['0,0', packMaskTile(coverage(255, values))]])
    };
    return {
      tiles: new Map<string, TileData>([['0,0', packTile(pixelsOf(rgba))]]),
      blend: 'normal' as const,
      opacity: 1,
      ...(mask ? { mask } : {})
    };
  }

  const first = (tiles: Map<string, Uint8Array | undefined>, key = '0,0', pixels = 2) => [
    ...tiles.get(key)!.subarray(0, pixels * 4)
  ];

  it('bakes the upper layer’s enabled mask into it before compositing', async () => {
    const lower = raster([0, 0, 255, 255]);
    const upper = raster([255, 0, 0, 255], [0, 128]);
    const merged = await mergeDownTiles(upper, lower, { clipped: false, linear: false, read });
    // Hidden: the lower layer; half revealed: half way, 8-bit rounded.
    expect(first(merged)).toEqual([0, 0, 255, 255, 128, 0, 127, 255]);
  });

  it('bakes the lower layer’s enabled mask into every one of its tiles, and clips to the masked shape', async () => {
    const lower = raster([0, 0, 255, 255], [0, 255]);
    lower.tiles.set('5,5', packTile(pixelsOf([0, 255, 0, 255])));
    const upper = raster([255, 0, 0, 255]);
    const merged = await mergeDownTiles(upper, lower, { clipped: false, linear: false, read });
    expect(first(merged)).toEqual([255, 0, 0, 255, 255, 0, 0, 255]);
    // A tile only the lower layer has is baked too: outside its mask tile, the mask's `outside` reveals it.
    expect(first(merged, '5,5', 1)).toEqual([0, 255, 0, 255]);

    const clipped = await mergeDownTiles(upper, lower, { clipped: true, linear: false, read });
    // Clipped to the masked base, the upper layer shows only where the base does.
    expect(first(clipped)).toEqual([0, 0, 0, 0, 255, 0, 0, 255]);
  });

  it('ignores disabled masks, which had no effect', async () => {
    const lower = raster([0, 0, 255, 255], [0], { enabled: false });
    const upper = raster([255, 0, 0, 128], [0], { enabled: false });
    const merged = await mergeDownTiles(upper, lower, { clipped: false, linear: false, read });
    expect(first(merged, '0,0', 1)).toEqual([255, 0, 127, 255]);
  });

  it('leaves no mask after a merge, and undo brings both back with their tiles', async () => {
    const doc = createDocument();
    const lower = doc.activeId;
    doc.commit([{ layerId: lower, key: '0,0', before: undefined, after: pixelsOf([0, 0, 255, 255]) }]);
    doc.changeLayer({ type: 'add-mask', id: lower });
    paintMask(doc, lower, '0,0', coverage(0));
    doc.changeLayer({ type: 'add' });
    const upper = doc.activeId;
    doc.commit([{ layerId: upper, key: '0,0', before: undefined, after: pixelsOf([255, 0, 0, 255]) }]);
    doc.changeLayer({ type: 'add-mask', id: upper });
    paintMask(doc, upper, '0,0', coverage(255, [0]));
    doc.changeLayer({ type: 'update-mask', id: upper, patch: { enabled: false } });
    const masks = [maskOf(doc, lower).id, maskOf(doc, upper).id];
    const merged = await mergeDownTiles(doc.node(upper) as Layer, doc.node(lower) as Layer, {
      clipped: false,
      linear: false,
      read
    });
    doc.mergeDown(upper, merged);
    expect(doc.node(lower)?.mask).toBeUndefined();
    expect(doc.activeTarget).toEqual({ type: 'pixels' });
    // The lower layer's mask hid it; the upper layer's disabled mask did nothing.
    expect([...unpackTile((doc.node(lower) as Layer).tiles.get('0,0')!).subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    doc.undo();
    expect([maskOf(doc, lower).id, maskOf(doc, upper).id]).toEqual(masks);
    expect(maskOf(doc, lower).tiles.size).toBe(1);
    expect(maskOf(doc, upper).tiles.size).toBe(1);
  });

  it('applies a mask, enabled or not, into exactly the tiles it changes', async () => {
    const layer = raster([200, 100, 50, 255], [0, 128], { enabled: false });
    layer.tiles.set('3,3', packTile(pixelsOf([10, 10, 10, 255])));
    const applied = await appliedMaskTiles(layer as typeof layer & { mask: LayerMask }, read);
    expect([...applied.keys()]).toEqual(['0,0']);
    expect(first(applied)).toEqual([0, 0, 0, 0, 100, 50, 25, 128]);
    // A mask that hides everything leaves nothing.
    const hidden = raster([200, 100, 50, 255], []);
    hidden.mask!.outside = 0;
    hidden.mask!.tiles.clear();
    const gone = await appliedMaskTiles(hidden as typeof hidden & { mask: LayerMask }, read);
    expect(gone.get('0,0')).toBeUndefined();
    expect(gone.has('0,0')).toBe(true);
  });
});
