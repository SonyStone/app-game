import { describe, expect, it } from 'vitest';
import type { Point } from './camera';
import { createDocument, type Layer } from './document';
import { captureSelection, editSelection, pointInSelection, type SelectionStorage } from './selection';
import { TILE_BYTES, unpackTile, type TileData } from './tilePixels';

describe('lasso raster edits', () => {
  it('captures a concave polygon from disk references, preserving premultiplied bytes', async () => {
    const pixels = new Uint8Array(TILE_BYTES);
    pixels.set([60, 30, 0, 128], 0);
    pixels.set([0, 255, 0, 255], (2 * 256 + 2) * 4);
    const source = layer();
    source.tiles.set('0,0', { storageId: 'saved', byteLength: pixels.byteLength });
    const polygon = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 3 },
      { x: 0, y: 3 }
    ];
    const selected = await captureSelection(source, polygon, { ...storage, read: async () => pixels });
    expect(unpackTile(selected.tiles.get('0,0')!).slice(0, 4)).toEqual(new Uint8Array([60, 30, 0, 128]));
    expect(unpackTile(selected.tiles.get('0,0')!)[(2 * 256 + 2) * 4 + 3]).toBe(0);
    expect(pointInSelection({ x: 2.5, y: 2.5 }, polygon)).toBe(false);
  });
  it('moves overlapping pixels across zero and tile boundaries without smearing, then undoes exactly', async () => {
    const doc = createDocument();
    const pixels = new Uint8Array(TILE_BYTES);
    pixels.set([100, 0, 0, 128], 254 * 4);
    pixels.set([0, 200, 0, 255], 255 * 4);
    doc.commit([{ layerId: doc.active.id, key: '-1,0', before: undefined, after: pixels }]);
    const selected = await captureSelection(doc.active, rectangle(-2, 0, 0, 1), storage);
    doc.commit(
      await editSelection({
        selection: selected,
        source: doc.active,
        destination: doc.active,
        offset: { x: 1, y: 0 },
        storage
      })
    );
    expect(pixel(doc.active, -2, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(doc.active, -1, 0)).toEqual([100, 0, 0, 128]);
    expect(pixel(doc.active, 0, 0)).toEqual([0, 200, 0, 255]);
    doc.undo();
    expect(pixel(doc.active, -2, 0)).toEqual([100, 0, 0, 128]);
    expect(doc.active.tiles.has('0,0')).toBe(false);
    doc.redo();
    expect(pixel(doc.active, 0, 0)).toEqual([0, 200, 0, 255]);
  });
  it('cuts and adds a layer in one history entry, preserving the source properties and clipboard', async () => {
    const doc = createDocument();
    const pixels = new Uint8Array(TILE_BYTES);
    pixels.set([90, 40, 10, 128]);
    doc.commit([{ layerId: doc.active.id, key: '0,0', before: undefined, after: pixels }]);
    const sourceId = doc.active.id;
    const selected = await captureSelection(doc.active, rectangle(0, 0, 1, 1), storage);
    const { tiles: _tiles, ...info } = doc.active;
    const added = { ...info, id: 'selection-layer', name: 'Selection' };
    const changes = await editSelection({
      selection: selected,
      source: doc.active,
      destination: { ...added, tiles: new Map() },
      storage
    });
    doc.commit(changes, added);
    expect(doc.layers).toHaveLength(2);
    expect(doc.layers[0]!.tiles.size).toBe(0);
    expect(pixel(doc.active, 0, 0)).toEqual([90, 40, 10, 128]);
    doc.undo();
    expect(doc.layers).toHaveLength(1);
    expect(doc.active.id).toBe(sourceId);
    expect(pixel(doc.active, 0, 0)).toEqual([90, 40, 10, 128]);
    doc.redo();
    expect(doc.active.id).toBe(added.id);
    // Pasting a second time is source-over and leaves the copied bytes unchanged.
    doc.commit(await editSelection({ selection: selected, destination: doc.active, storage }));
    expect(pixel(doc.active, 0, 0)).toEqual([135, 60, 15, 192]);
    expect(unpackTile(selected.tiles.get('0,0')!).slice(0, 4)).toEqual(new Uint8Array([90, 40, 10, 128]));
  });
  it('does not mutate either layer if a destination tile cannot load', async () => {
    const source = layer();
    const pixels = new Uint8Array(TILE_BYTES);
    pixels.set([255, 0, 0, 255]);
    source.tiles.set('0,0', pixels);
    const selected = await captureSelection(source, rectangle(0, 0, 1, 1), storage);
    const destination = {
      ...layer(),
      id: 'target',
      tiles: new Map<string, TileData>([['0,0', { storageId: 'missing', byteLength: 1 }]])
    };
    await expect(
      editSelection({
        selection: selected,
        source,
        destination,
        storage: {
          ...storage,
          read: async (data) => {
            if (!(data instanceof Uint8Array)) throw new Error('Disk unavailable');
            return data;
          }
        }
      })
    ).rejects.toThrow('Disk unavailable');
    expect(pixel(source, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(destination.tiles.get('0,0')).toEqual({ storageId: 'missing', byteLength: 1 });
  });
  it('rejects empty selections while supporting more than 256 occupied tiles through staged references', async () => {
    const source = layer();
    await expect(captureSelection(source, rectangle(0, 0, 1, 1), storage)).rejects.toThrow('no pixels');
    const disk = new Map<string, Uint8Array>();
    const paged: SelectionStorage = {
      read: async (data) => (data instanceof Uint8Array ? data : disk.get(data.storageId)!),
      write: async (pixels) => {
        const storageId = `staged-${disk.size}`;
        disk.set(storageId, pixels);
        return { storageId, byteLength: pixels.byteLength };
      }
    };
    const original = new Uint8Array(TILE_BYTES);
    original.set([80, 20, 0, 128]);
    for (let i = 0; i < 300; i++) source.tiles.set(`${i % 20},${Math.floor(i / 20)}`, original);
    const selected = await captureSelection(source, rectangle(0, 0, 20 * 256, 15 * 256), paged);
    expect(selected.tiles.size).toBe(300);
    expect([...selected.tiles.values()].every((data) => !(data instanceof Uint8Array))).toBe(true);
    const changes = await editSelection({
      selection: selected,
      source,
      destination: source,
      offset: { x: -1, y: -1 },
      storage: paged
    });
    expect(changes.length).toBeGreaterThan(256);
    expect(changes.filter((c) => c.after).every((c) => !(c.after instanceof Uint8Array))).toBe(true);
    // Every moved pixel survives, including the negative destination tile, and source bytes are unchanged.
    const moved = changes.find((c) => c.key === '-1,-1')!.after!;
    expect([...unpackTile(await paged.read(moved)).slice(TILE_BYTES - 4)]).toEqual([80, 20, 0, 128]);
    expect([...original.slice(0, 4)]).toEqual([80, 20, 0, 128]);
  });
  it('leaves the document unchanged when staging fails after earlier tiles succeeded', async () => {
    const source = layer();
    const pixels = new Uint8Array(TILE_BYTES);
    pixels.set([255, 0, 0, 255]);
    source.tiles.set('0,0', pixels);
    source.tiles.set('1,0', pixels);
    const selected = await captureSelection(source, rectangle(0, 0, 512, 1), storage);
    let writes = 0;
    await expect(
      editSelection({
        selection: selected,
        source,
        destination: source,
        offset: { x: 0, y: 1 },
        storage: {
          ...storage,
          write: async (data) => {
            if (++writes === 2) throw new Error('Disk full');
            return data;
          }
        }
      })
    ).rejects.toThrow('Disk full');
    expect(source.tiles.get('0,0')).toBe(pixels);
    expect(source.tiles.get('1,0')).toBe(pixels);
  });
});

const storage: SelectionStorage = { read: async (data) => unpackTile(data), write: async (data) => data };
function layer(): Layer {
  return { id: 'source', name: 'Source', visible: true, opacity: 1, blend: 'linear', tiles: new Map() };
}
function rectangle(left: number, top: number, right: number, bottom: number): Point[] {
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom }
  ];
}
function pixel(layer: Layer, x: number, y: number) {
  const tx = Math.floor(x / 256),
    ty = Math.floor(y / 256);
  const data = layer.tiles.get(`${tx},${ty}`);
  const at = ((y - ty * 256) * 256 + x - tx * 256) * 4;
  return data ? [...unpackTile(data).slice(at, at + 4)] : [0, 0, 0, 0];
}
