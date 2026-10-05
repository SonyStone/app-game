import { describe, expect, it } from 'vitest';
import { defaultCamera } from './camera';
import { createDocument } from './document';
import { readPaintFile, writePaintFile } from './paintFile';
import { encodeDocument, snapshotDocument } from './storage';
import { packTile, unpackTile } from './tilePixels';

describe('portable paged drawings', () => {
  const fixture = () => {
    const document = createDocument();
    const pixels = new Uint8Array(256 * 256 * 4);
    pixels.set([20, 40, 80, 128], 4 * 231);
    document.commit([{ layerId: document.active.id, key: '-2,1', before: undefined, after: packTile(pixels) }]);
    return snapshotDocument(document.layers, document.active.id, defaultCamera());
  };
  it('roundtrips binary pixels, coordinates, metadata and legacy JSON', async () => {
    const source = fixture();
    const binary = await writePaintFile(source, async (pixels) => pixels as Uint8Array);
    for (const file of [binary, new Blob([encodeDocument(source)])]) {
      const loaded = await readPaintFile(file);
      expect(encodeDocument(snapshotDocument(loaded.layers, loaded.activeId, loaded.camera))).toBe(
        encodeDocument(source)
      );
    }
  });
  it('rejects incomplete payloads before staging any tiles', async () => {
    const binary = await writePaintFile(fixture(), async (pixels) => pixels as Uint8Array);
    let captured = 0;
    await expect(
      readPaintFile(binary.slice(0, binary.size - 1), async (pixels) => {
        captured++;
        return pixels;
      })
    ).rejects.toThrow();
    expect(captured).toBe(0);
  });
  it('stores a tile shared by layers once, compressed, and shares it again when read', async () => {
    const document = createDocument();
    const flat = packTile(new Uint8Array(256 * 256 * 4).fill(160));
    document.commit([{ layerId: document.active.id, key: '0,0', before: undefined, after: flat }]);
    document.changeLayer({ type: 'duplicate', id: document.active.id });
    const source = snapshotDocument(document.layers, document.active.id, defaultCamera());
    const binary = await writePaintFile(source, async (pixels) => pixels as Uint8Array);
    expect(binary.size).toBeLessThan(flat.byteLength / 20);

    let captured = 0;
    const loaded = await readPaintFile(binary, async (pixels) => {
      captured++;
      return pixels;
    });
    expect(captured).toBe(1);
    expect(loaded.layers).toHaveLength(2);
    expect(loaded.layers[0]!.tiles.get('0,0')).toBe(loaded.layers[1]!.tiles.get('0,0'));
    expect(loaded.layers[0]!.tiles.get('0,0')).toEqual(flat);
  });
  it('still reads version 3 drawings', async () => {
    const source = fixture();
    const tiles = source.layers.flatMap((layer) => layer.tiles.map(({ pixels }) => pixels as Uint8Array));
    const metadata = {
      ...source,
      version: 3,
      layers: source.layers.map((layer) => ({
        ...layer,
        tiles: layer.tiles.map(({ key, pixels }) => ({
          key,
          pixels: { storageId: '00000000-0000-4000-8000-000000000000', byteLength: pixels.byteLength }
        }))
      }))
    };
    const header = new TextEncoder().encode(JSON.stringify(metadata));
    const prefix = new Uint8Array(12);
    prefix.set(new TextEncoder().encode('PAINT3\r\n'));
    new DataView(prefix.buffer).setUint32(8, header.byteLength, true);
    const loaded = await readPaintFile(new Blob([prefix, header, ...tiles.map((pixels) => pixels.slice())]));
    expect(encodeDocument(snapshotDocument(loaded.layers, loaded.activeId, loaded.camera))).toBe(
      encodeDocument(source)
    );
  });
  it('passes each validated tile to the storage callback', async () => {
    const binary = await writePaintFile(fixture(), async (pixels) => pixels as Uint8Array);
    const ref = { storageId: crypto.randomUUID(), byteLength: 42 };
    const loaded = await readPaintFile(binary, async (pixels) => {
      expect(unpackTile(pixels)[231 * 4 + 3]).toBe(128);
      return ref;
    });
    expect(loaded.layers[0]!.tiles.get('-2,1')).toBe(ref);
  });
});
