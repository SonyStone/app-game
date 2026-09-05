import { describe, expect, it } from 'vitest';
import { packTile, unpackTile, TILE_BYTES } from './tilePixels';
import { createDocument } from './document';
import { defaultCamera } from './camera';
import { decodeDocument, encodeDocument, restoreDocument, snapshotDocument } from './storage';

describe('lossless sparse tiles', () => {
  it('preserves every byte of a soft diagonal and stores only its occupied runs', () => {
    const pixels = diagonal();
    const packed = packTile(pixels);
    expect(packed.byteLength).toBeLessThan(TILE_BYTES / 10);
    expect(unpackTile(packed)).toEqual(pixels);
    expect(packTile(packed)).toBe(packed);
    expect(unpackTile(packTile(new Uint8Array(TILE_BYTES)))).toEqual(new Uint8Array(TILE_BYTES));
  });
  it('keeps dense pixels raw without increasing storage', () => {
    const pixels = new Uint8Array(TILE_BYTES).fill(57);
    expect(packTile(pixels)).toBe(pixels);
    expect(unpackTile(pixels)).toBe(pixels);
  });
  it('rejects corrupt, truncated, overflowing and incomplete packets', () => {
    const packed = packTile(diagonal());
    expect(() => unpackTile(packed.subarray(0, packed.length - 4))).toThrow();
    for (const count of [0, 0x80010001, 0x80000001]) {
      const invalid = packTile(new Uint8Array(TILE_BYTES));
      new DataView(invalid.buffer).setUint32(4, count, true);
      expect(() => unpackTile(invalid)).toThrow();
    }
    expect(() => unpackTile(new Uint8Array(8))).toThrow();
  });
  it('commits a single 2048-tile doodle with undo, redo and portable persistence', () => {
    const doc = createDocument();
    const pixels = packTile(diagonal());
    doc.commit(
      Array.from({ length: 2048 }, (_, x) => ({
        layerId: doc.active.id,
        key: `${x},${x}`,
        before: undefined,
        after: pixels
      }))
    );
    expect(doc.state().tileCount).toBe(2048);
    expect(doc.state().pixelBytes).toBeLessThan(32 * 1048576);
    expect(doc.state().canUndo).toBe(true);
    doc.undo();
    expect(doc.state().pixelBytes).toBe(0);
    doc.redo();
    const saved = snapshotDocument(doc.layers, doc.active.id, defaultCamera());
    const restored = decodeDocument(encodeDocument(saved));
    expect(restored.layers[0]!.tiles.size).toBe(2048);
    expect(unpackTile(restored.layers[0]!.tiles.get('2047,2047')!)).toEqual(diagonal());
  });
  it('still rejects an over-budget dense stroke atomically', () => {
    const doc = createDocument();
    const pixels = new Uint8Array(TILE_BYTES).fill(255);
    expect(() =>
      doc.commit(
        Array.from({ length: 1025 }, (_, x) => ({
          layerId: doc.active.id,
          key: `${x},0`,
          before: undefined,
          after: pixels
        }))
      )
    ).toThrow('storage budget');
    expect(doc.state().tileCount).toBe(0);
    expect(doc.state().canUndo).toBe(false);
  });
  it('loads old raw version-1 files and losslessly migrates them', () => {
    const doc = createDocument();
    const saved = snapshotDocument(doc.layers, doc.active.id, defaultCamera());
    const restored = restoreDocument({
      ...saved,
      version: 1,
      layers: [
        {
          ...saved.layers[0],
          tiles: [{ key: '-1,0', pixels: diagonal() }]
        }
      ]
    });
    const packed = restored.layers[0]!.tiles.get('-1,0')!;
    expect(packed.byteLength).toBeLessThan(TILE_BYTES / 10);
    expect(unpackTile(packed)).toEqual(diagonal());
  });
});

function diagonal() {
  const pixels = new Uint8Array(TILE_BYTES);
  for (let y = 0; y < 256; y++)
    for (let x = Math.max(0, y - 3); x <= Math.min(255, y + 3); x++)
      pixels.set([13, 37, 71, 97 + (x % 153)], (y * 256 + x) * 4);
  return pixels;
}
