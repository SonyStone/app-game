import { describe, expect, it } from 'vitest';
import { defaultCamera } from './camera';
import { createDocument } from './document';
import { decodeDocument, encodeDocument, restoreDocument, snapshotDocument } from './storage';
import { isEmptyPackedTile, packTile, TILE_BYTES, unpackTile } from './tilePixels';

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
  it('preserves the version-1 packet format for offset views and zero-alpha RGB', () => {
    const storage = new Uint8Array(TILE_BYTES + 6).fill(99);
    const pixels = storage.subarray(3, 3 + TILE_BYTES);
    pixels.fill(0);
    pixels.set([1, 2, 3, 0], 4);
    expect(packTile(pixels)).toEqual(
      Uint8Array.of(0x50, 0x4c, 0x54, 0x31, 1, 0, 0, 0x80, 1, 0, 0, 0, 1, 2, 3, 0, 0xfe, 0xff, 0, 0x80)
    );
    expect(unpackTile(packTile(pixels))).toEqual(pixels);
    expect(storage.subarray(0, 3)).toEqual(Uint8Array.of(99, 99, 99));
    expect(storage.subarray(-3)).toEqual(Uint8Array.of(99, 99, 99));
  });
  it('round-trips fragmented runs and returns raw data when run headers exceed the budget', () => {
    const pixels = Uint8Array.from({ length: TILE_BYTES }, (_, i) => (Math.floor(i / 4) % 4 ? 0 : 57));
    const packed = packTile(pixels);
    expect(packed.byteLength).toBe(196612);
    expect(unpackTile(packed)).toEqual(pixels);
    for (let i = 0; i < TILE_BYTES; i += 8) pixels.set([57, 57, 57, 57], i);
    expect(packTile(pixels)).toBe(pixels);
  });
  it('recognizes only validated empty packets, including offset views', () => {
    const empty = packTile(new Uint8Array(TILE_BYTES));
    const storage = new Uint8Array(11);
    storage.set(empty, 3);
    expect(isEmptyPackedTile(storage.subarray(3))).toBe(true);
    for (const source of [
      undefined,
      new Uint8Array(TILE_BYTES),
      new Uint8Array(8),
      { storageId: 'empty', byteLength: 8 },
      packTile(diagonal())
    ])
      expect(isEmptyPackedTile(source)).toBe(false);
    empty[6] = 0;
    expect(isEmptyPackedTile(empty)).toBe(false);
    expect(() => unpackTile(empty)).toThrow();
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
