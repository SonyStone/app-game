import { deflateSync } from 'node:zlib';
import { createRoot } from 'solid-js';
import { expect, it } from 'vitest';
import { createRasterDecoder } from './createRasterDecoder';
import { packedTileIndex } from './rasterPixels';
import type { RasterRequest } from './rasterWorkerTypes';
import { lastLevel, mipSize, packMipTails, tileSize } from './virtualTiles';

it('assembles a wide codec-4 tail mip from every packed tile it spans', async () => {
  const width = 1000;
  const table = new DataView(new ArrayBuffer(24));
  table.setUint32(0, width, true);
  table.setUint32(4, 1, true);
  const tailLevel = packMipTails(table).images[0]!.level;
  expect(mipSize(width, tailLevel)).toBeGreaterThan(tileSize);

  const reply = (
    await decode({ id: 0, bytes: packedImage(width, 1), width, height: 1, codec: 4, tailLevel, tiles: [] })
  )._unsafeUnwrap();
  const tail = new Uint32Array(reply.tail!.pixels);
  let offset = 1;

  // The tail row between its one-texel borders holds each level's texels in order.
  for (let level = tailLevel; level <= lastLevel(width, 1); level++) {
    const size = mipSize(width, level);
    const row = Array.from(tail.subarray(reply.tail!.width + offset, reply.tail!.width + offset + size));
    expect(row).toEqual(Array.from({ length: size }, (_, x) => texel(level, x)));
    offset += size + 2;
  }
});

it('widens channel-prefixed gray and RGB tiles to opaque RGBA', async () => {
  // A 3×1 image: level 0 is stored gray, its 1×1 level 1 as RGB. Tiles include a one-texel gutter.
  const gray = Uint8Array.from({ length: 5 * 3 }, (_, i) => 10 + (i % 5));
  const rgb = Uint8Array.from({ length: 3 * 3 * 3 }, (_, i) => [200, 100, 50][i % 3]!);
  const tiles = [Uint8Array.of(1, ...deflateSync(gray)), Uint8Array.of(3, ...deflateSync(rgb))];
  const header = 16 + tiles.length * 8;
  const bytes = new Uint8Array(header + tiles[0]!.length + tiles[1]!.length);
  const records = new DataView(bytes.buffer);
  records.setUint32(0, tileSize, true);
  records.setUint32(4, 2, true);
  records.setUint32(8, 2, true);
  records.setUint32(12, 1, true);
  let offset = header;

  for (const [index, tile] of tiles.entries()) {
    records.setUint32(16 + index * 8, offset, true);
    records.setUint32(20 + index * 8, tile.length, true);
    bytes.set(tile, offset);
    offset += tile.length;
  }

  const reply = (
    await decode({
      id: 0,
      bytes: bytes.buffer,
      width: 3,
      height: 1,
      codec: 4,
      tiles: [
        { image: 0, level: 0, x: 0, y: 0 },
        { image: 0, level: 1, x: 0, y: 0 }
      ]
    })
  )._unsafeUnwrap();
  expect(Array.from(new Uint8Array(reply.tiles[0]!.pixels, 0, 8))).toEqual([10, 10, 10, 255, 11, 11, 11, 255]);
  expect(Array.from(new Uint8Array(reply.tiles[1]!.pixels, 0, 4))).toEqual([200, 100, 50, 255]);
});

it('rejects raw pixels whose length does not match the declared dimensions', async () => {
  const result = await decode({
    id: 0,
    bytes: new ArrayBuffer(12),
    width: 2,
    height: 2,
    codec: 0,
    tailLevel: 0,
    tiles: []
  });
  expect(result._unsafeUnwrapErr()).toContain('declared dimensions');
});

it('stops between decoding steps once the request is aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await decode(
    {
      id: 0,
      bytes: new ArrayBuffer(4 * 4 * 4),
      width: 4,
      height: 4,
      codec: 0,
      tiles: [{ image: 0, level: 0, x: 0, y: 0 }]
    },
    controller.signal
  );
  expect(result._unsafeUnwrapErr()).toContain('cancelled');
});

function decode(request: RasterRequest, signal?: AbortSignal) {
  return createRoot((dispose) => {
    const pending = createRasterDecoder().decode(request, signal);
    void pending.then(dispose, dispose);
    return pending;
  });
}

/** Distinct texel per level and column, so misplaced rows or tiles change the result. */
function texel(level: number, x: number) {
  return ((level + 1) << 24) | (x + 1);
}

/** Builds a GDOC codec-4 source: per-tile offset/length records after a 16-byte header, then deflated gutter tiles. */
function packedImage(width: number, height: number) {
  const tiles: Uint8Array[] = [];

  for (let level = 0; level <= lastLevel(width, height); level++) {
    const levelWidth = mipSize(width, level);
    const levelHeight = mipSize(height, level);

    for (let ty = 0; ty < Math.ceil(levelHeight / tileSize); ty++) {
      for (let tx = 0; tx < Math.ceil(levelWidth / tileSize); tx++) {
        const columns = Math.min(tileSize, levelWidth - tx * tileSize) + 2;
        const rows = Math.min(tileSize, levelHeight - ty * tileSize) + 2;
        const pixels = new Uint32Array(columns * rows);

        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < columns; x++) {
            const sx = Math.max(0, Math.min(levelWidth - 1, tx * tileSize + x - 1));
            pixels[y * columns + x] = texel(level, sx);
          }
        }

        expect(tiles.length).toBe(packedTileIndex(width, height, { level, x: tx, y: ty }));
        tiles.push(deflateSync(new Uint8Array(pixels.buffer)));
      }
    }
  }

  const header = 16 + tiles.length * 8;
  const bytes = new Uint8Array(header + tiles.reduce((sum, tile) => sum + tile.length, 0));
  const records = new DataView(bytes.buffer);
  let offset = header;

  for (const [index, tile] of tiles.entries()) {
    records.setUint32(16 + index * 8, offset, true);
    records.setUint32(20 + index * 8, tile.length, true);
    bytes.set(tile, offset);
    offset += tile.length;
  }

  return bytes.buffer;
}
