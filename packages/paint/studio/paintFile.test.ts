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
    ).rejects.toThrow('payload');
    expect(captured).toBe(0);
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
