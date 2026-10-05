import { z } from 'zod';
import { decodeDocument, restoreDocument, type SavedDocument } from './storage';
import { compressTile, restoreTile } from './tileCodec';
import { packTile, TILE_BYTES, unpackTile, type TileData } from './tilePixels';

/**
 * Portable binary drawing, version 4: the drawing's tiles, each stored once however many layers share it and
 * compressed by `compressTile`, then the metadata with an index of the tiles, then a trailer locating the metadata.
 * Tiles are read one at a time through `read`; each Blob part holds one tile, so no whole-document buffer is built.
 */
export async function writePaintFile(
  snapshot: SavedDocument,
  read: (data: TileData) => Promise<Uint8Array>
): Promise<Blob> {
  const parts: BlobPart[] = [MAGIC_V4];
  const index: { offset: number; length: number; byteLength: number }[] = [];
  /** Index entries by tile version: a stored reference's id, or the packed pixels themselves. */
  const entries = new Map<unknown, number>();
  let offset = MAGIC_V4.byteLength;
  const layers = [];
  for (const layer of snapshot.layers) {
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

  const header = new TextEncoder().encode(JSON.stringify({ ...snapshot, version: 4, layers, tiles: index }));
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
  if (MAGIC_V4.every((byte, index) => prefix[index] === byte)) {
    return readVersion4(file, capture);
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
  let offset = 12 + length;
  for (const layer of drawing.layers)
    for (const [key, ref] of layer.tiles) {
      const packed = new Uint8Array(await file.slice(offset, offset + ref.byteLength).arrayBuffer());
      offset += ref.byteLength;
      const pixels = packTile(unpackTile(packed));
      layer.tiles.set(key, await capture(pixels));
    }
  return drawing;
}

/** Reads a version 4 drawing: the trailer, the metadata and its tile index, then each indexed tile once. */
async function readVersion4(file: Blob, capture: (pixels: Uint8Array) => Promise<TileData>) {
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
  for (const [entry, tile] of indexed.tiles.entries()) {
    const previous = indexed.tiles[entry - 1];
    if (
      tile.offset !== (previous ? previous.offset + previous.length : MAGIC_V4.byteLength) ||
      tile.offset + tile.length > offset
    )
      throw new Error('Truncated or oversized drawing payload.');
  }

  // Validated as a version 3 checkpoint whose tiles are references, then filled in from the index.
  const drawing = restoreDocument({
    ...(value as object),
    version: 3,
    layers: indexed.layers.map((layer, index) => ({
      ...(value as { layers: object[] }).layers[index],
      tiles: layer.tiles.map(({ key, tile }) => ({
        key,
        pixels: { storageId: PLACEHOLDER_ID, byteLength: indexed.tiles[tile]!.byteLength }
      }))
    }))
  });
  const captured = new Map<number, TileData>();
  for (const [index, layer] of drawing.layers.entries())
    for (const { key, tile } of indexed.layers[index]!.tiles) {
      let pixels = captured.get(tile);
      if (!pixels) {
        const { offset: start, length: size, byteLength } = indexed.tiles[tile]!;
        const packed = await restoreTile(new Uint8Array(await file.slice(start, start + size).arrayBuffer()));
        if (packed.byteLength !== byteLength) throw new Error('A tile of the drawing is damaged.');
        pixels = await capture(packTile(unpackTile(packed)));
        captured.set(tile, pixels);
      }

      layer.tiles.set(key, pixels);
    }

  return drawing;
}

/** The version 4 tile index and the layers' references into it; the rest is validated by `restoreDocument`. */
const indexSchema = z
  .object({
    version: z.literal(4),
    tiles: z.array(
      z.object({
        offset: z.number().int().nonnegative(),
        length: z.number().int().positive().max(TILE_BYTES),
        byteLength: z.number().int().min(8).max(TILE_BYTES)
      })
    ),
    layers: z.array(z.object({ tiles: z.array(z.object({ key: z.string(), tile: z.number().int().nonnegative() })) }))
  })
  .refine(({ tiles, layers }) => layers.every((layer) => layer.tiles.every(({ tile }) => tile < tiles.length)), {
    message: 'A layer refers to a missing tile.'
  });

const MAGIC_V3 = new TextEncoder().encode('PAINT3\r\n');
const MAGIC_V4 = new TextEncoder().encode('PAINT4\r\n');
/** The metadata's offset (64 bits), its length (32 bits), then this end marker. */
const TRAILER_MAGIC = new TextEncoder().encode('P4IX');
const TRAILER_BYTES = 16;
const MAX_HEADER = 32 * 1048576;
const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';
