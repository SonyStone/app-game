import { z } from 'zod';
import { decodeDocument, restoreDocument, type SavedDocument } from './storage';
import { compressTile, restoreTile } from './tileCodec';
import { packTile, TILE_BYTES, unpackTile, type TileData } from './tilePixels';

/**
 * Portable binary drawing, version 5: the drawing's tiles, each stored once however many layers share it and
 * compressed by `compressTile`, then the metadata with an index of the tiles, then a trailer locating the metadata.
 * The metadata is a version 4 document (`SavedDocument`): its `layers` are the layer tree's nodes, raster layers
 * listing their tiles by index and folders listing none. Version 4 files had the same layout with a flat list of raster
 * layers. Tiles are read one at a time through `read`; each Blob part holds one tile, so no whole-document buffer is
 * built.
 */
export async function writePaintFile(
  snapshot: SavedDocument,
  read: (data: TileData) => Promise<Uint8Array>
): Promise<Blob> {
  const parts: BlobPart[] = [MAGIC_V5];
  const index: { offset: number; length: number; byteLength: number }[] = [];
  /** Index entries by tile version: a stored reference's id, or the packed pixels themselves. */
  const entries = new Map<unknown, number>();
  let offset = MAGIC_V5.byteLength;
  const layers = [];
  for (const layer of snapshot.layers) {
    if (layer.kind === 'group') {
      layers.push(layer);
      continue;
    }

    const tiles = [];
    for (const tile of layer.tiles) {
      const identity = tile.pixels instanceof Uint8Array ? tile.pixels : tile.pixels.storageId;
      let entry = entries.get(identity);
      if (entry === undefined) {
        const packed = await read(tile.pixels);
        const stored = await compressTile(packed);
        entry = index.length;
        entries.set(identity, entry);
        index.push({ offset, length: stored.byteLength, byteLength: packed.byteLength });
        parts.push(new Blob([stored as Uint8Array<ArrayBuffer>]));
        offset += stored.byteLength;
      }

      tiles.push({ key: tile.key, tile: entry });
    }

    layers.push({ ...layer, tiles });
  }

  const header = new TextEncoder().encode(JSON.stringify({ ...snapshot, version: 5, layers, tiles: index }));
  if (header.byteLength > MAX_HEADER) {
    throw new Error('Drawing metadata is too large to export.');
  }

  const trailer = new Uint8Array(TRAILER_BYTES);
  const view = new DataView(trailer.buffer);
  view.setBigUint64(0, BigInt(offset), true);
  view.setUint32(8, header.byteLength, true);
  trailer.set(TRAILER_MAGIC, 12);
  parts.push(header, trailer);
  return new Blob(parts, { type: 'application/x-paint' });
}

/**
 * Reads a drawing of any version, one tile at a time, validating everything before the caller replaces the drawing.
 * `capture` may page validated pixels to disk; a tile shared by several layers is captured once and shared again.
 * Older binary and JSON files remain readable.
 */
export async function readPaintFile(
  file: Blob,
  capture: (pixels: Uint8Array) => Promise<TileData> = async (pixels) => pixels
): Promise<ReturnType<typeof restoreDocument>> {
  const prefix = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  for (const [version, magic] of [
    [4, MAGIC_V4],
    [5, MAGIC_V5]
  ] as const) {
    if (magic.every((byte, index) => prefix[index] === byte)) {
      return readIndexed(file, version, capture);
    }
  }

  if (!MAGIC_V3.every((byte, index) => prefix[index] === byte)) {
    if (file.size > 384 * 1048576) throw new Error('The legacy JSON drawing is too large.');
    return decodeDocument(await file.text());
  }

  if (prefix.length !== 12) throw new Error('Truncated drawing header.');
  const length = new DataView(prefix.buffer).getUint32(8, true);
  if (length > MAX_HEADER || length + 12 > file.size) throw new Error('Invalid drawing header size.');
  const value: unknown = JSON.parse(await file.slice(12, 12 + length).text());
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 3)
    throw new Error('Unsupported binary drawing version.');
  const drawing = restoreDocument(value);
  let expected = 12 + length;
  for (const layer of drawing.layers) for (const pixels of layer.tiles.values()) expected += pixels.byteLength;
  if (expected !== file.size) throw new Error('Truncated or oversized drawing payload.');
  const readRange = createRangeReader(file, file.size);
  let offset = 12 + length;
  for (const layer of drawing.layers)
    for (const [key, ref] of layer.tiles) {
      const packed = await readRange(offset, offset + ref.byteLength);
      offset += ref.byteLength;
      const pixels = packTile(unpackTile(packed));
      layer.tiles.set(key, await capture(pixels));
    }
  return drawing;
}

/**
 * Reads a version 4 or 5 drawing: the trailer, the metadata and its tile index, then each indexed tile once. Version
 * 4 metadata is a flat version 3 document, version 5 a version 4 one with folders.
 */
async function readIndexed(file: Blob, version: 4 | 5, capture: (pixels: Uint8Array) => Promise<TileData>) {
  if (file.size < MAGIC_V4.byteLength + TRAILER_BYTES) throw new Error('Truncated drawing.');
  const trailer = new DataView(await file.slice(file.size - TRAILER_BYTES).arrayBuffer());
  const end = new Uint8Array(trailer.buffer, 12, 4);
  if (!TRAILER_MAGIC.every((byte, index) => end[index] === byte)) throw new Error('Truncated drawing.');
  const offset = Number(trailer.getBigUint64(0, true));
  const length = trailer.getUint32(8, true);
  if (length > MAX_HEADER || offset < MAGIC_V4.byteLength || offset + length + TRAILER_BYTES !== file.size)
    throw new Error('Invalid drawing header size.');
  const value: unknown = JSON.parse(await file.slice(offset, offset + length).text());
  const indexed = indexSchema.parse(value);
  if (indexed.version !== version) throw new Error('Unsupported binary drawing version.');
  for (const [entry, tile] of indexed.tiles.entries()) {
    const previous = indexed.tiles[entry - 1];
    if (
      tile.offset !== (previous ? previous.offset + previous.length : MAGIC_V4.byteLength) ||
      tile.offset + tile.length > offset
    )
      throw new Error('Truncated or oversized drawing payload.');
  }

  // Validated as a checkpoint whose tiles are references, then filled in from the index.
  const saved = (value as { layers: { id?: unknown }[] }).layers;
  const drawing = restoreDocument({
    ...(value as object),
    version: version === 4 ? 3 : 4,
    layers: indexed.layers.map((layer, index) => ({
      ...saved[index],
      ...(layer.tiles
        ? {
            tiles: layer.tiles.map(({ key, tile }) => ({
              key,
              pixels: { storageId: PLACEHOLDER_ID, byteLength: indexed.tiles[tile]!.byteLength }
            }))
          }
        : {})
    }))
  });
  // Restoring puts the nodes in canonical order, so the index is matched by id, which it has checked are unique.
  const tilesOf = new Map(indexed.layers.map((layer, index) => [saved[index]!.id, layer.tiles ?? []]));
  const readRange = createRangeReader(file, offset);
  const captured = new Map<number, TileData>();
  for (const layer of drawing.layers)
    for (const { key, tile } of tilesOf.get(layer.id)!) {
      let pixels = captured.get(tile);
      if (!pixels) {
        const { offset: start, length: size, byteLength } = indexed.tiles[tile]!;
        const packed = await restoreTile(await readRange(start, start + size));
        if (packed.byteLength !== byteLength) throw new Error('A tile of the drawing is damaged.');
        pixels = await capture(packTile(unpackTile(packed)));
        captured.set(tile, pixels);
      }

      layer.tiles.set(key, pixels);
    }

  return drawing;
}

/**
 * Reads byte ranges of `file` below `limit` through one window of at least `RANGE_WINDOW_BYTES`, refilled from the
 * requested start whenever a range falls outside it. Every Blob read has a fixed cost, about 70 ms for a file chosen
 * on Android Chrome, so reading thousands of tiles one slice at a time took minutes; tiles are written in the order
 * they are read, so one window serves many of them. Returns a copy, so a kept tile does not retain the window.
 */
function createRangeReader(file: Blob, limit: number) {
  let windowStart = 0;
  let window = new Uint8Array(0);
  return async (start: number, end: number) => {
    if (start < windowStart || end > windowStart + window.byteLength) {
      windowStart = start;
      window = new Uint8Array(
        await file.slice(start, Math.min(limit, Math.max(end, start + RANGE_WINDOW_BYTES))).arrayBuffer()
      );
    }

    return window.slice(start - windowStart, end - windowStart);
  };
}

/**
 * The version 4 or 5 tile index and the layers' references into it; the rest is validated by `restoreDocument`. A
 * folder of version 5 has no `tiles`.
 */
const indexSchema = z
  .object({
    version: z.union([z.literal(4), z.literal(5)]),
    tiles: z.array(
      z.object({
        offset: z.number().int().nonnegative(),
        length: z.number().int().positive().max(TILE_BYTES),
        byteLength: z.number().int().min(8).max(TILE_BYTES)
      })
    ),
    layers: z.array(
      z.object({ tiles: z.array(z.object({ key: z.string(), tile: z.number().int().nonnegative() })).optional() })
    )
  })
  .refine(
    ({ tiles, layers }) => layers.every((layer) => (layer.tiles ?? []).every(({ tile }) => tile < tiles.length)),
    {
      message: 'A layer refers to a missing tile.'
    }
  );

const MAGIC_V3 = new TextEncoder().encode('PAINT3\r\n');
const MAGIC_V4 = new TextEncoder().encode('PAINT4\r\n');
const MAGIC_V5 = new TextEncoder().encode('PAINT5\r\n');
/** The metadata's offset (64 bits), its length (32 bits), then this end marker. */
const TRAILER_MAGIC = new TextEncoder().encode('P4IX');
const TRAILER_BYTES = 16;
const MAX_HEADER = 32 * 1048576;
const RANGE_WINDOW_BYTES = 8 * 1048576;
const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';
